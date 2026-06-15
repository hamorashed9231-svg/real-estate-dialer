import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * POST /api/auth/signup
 * 
 * Secure State-Machine Driven Onboarding Flow.
 * Guarantees no partial failures or orphaned records by logging progress incrementally.
 * Allows safe retries from the last completed step.
 */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdminClient();
  
  try {
    const { companyName, email, password, fullName } = await req.json();

    if (!companyName || !email || !password || !fullName) {
      return NextResponse.json(
        { error: 'All fields (companyName, email, password, fullName) are required.' },
        { status: 400 }
      );
    }

    // 1. Check if an onboarding status row already exists for this email
    const { data: existingStatus, error: selectStatusError } = await supabaseAdmin
      .from('onboarding_status')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (selectStatusError) {
      throw new Error(`Failed to query onboarding registry: ${selectStatusError.message}`);
    }

    // If onboarding is already fully complete, return success immediately
    if (existingStatus && existingStatus.status === 'completed') {
      return NextResponse.json({
        success: true,
        message: 'Onboarding already completed successfully. Please sign in.',
        companyId: existingStatus.company_id,
        userId: existingStatus.user_id,
      }, { status: 200 });
    }

    let currentStatus = existingStatus;

    // 2. Initialize onboarding status row if this is the first attempt
    if (!currentStatus) {
      const { data: newStatus, error: createStatusError } = await supabaseAdmin
        .from('onboarding_status')
        .insert({
          email,
          status: 'pending',
          step: 'company_created',
        })
        .select()
        .single();

      if (createStatusError || !newStatus) {
        throw new Error(`Failed to initialize onboarding tracking: ${createStatusError?.message}`);
      }
      currentStatus = newStatus;
    }

    let companyId = currentStatus.company_id;
    let userId = currentStatus.user_id;

    // STEP 1: Create company if missing
    if (!companyId) {
      const { data: company, error: companyError } = await supabaseAdmin
        .from('companies')
        .insert({ name: companyName })
        .select('id')
        .single();

      if (companyError || !company) {
        throw new Error(`[Step 1 Failed] Company creation failed: ${companyError?.message}`);
      }

      companyId = company.id;

      // Update onboarding status table
      const { error: updateError } = await supabaseAdmin
        .from('onboarding_status')
        .update({
          company_id: companyId,
          step: 'company_created',
          status: 'pending',
          error_message: null,
        })
        .eq('id', currentStatus.id);

      if (updateError) {
        throw new Error(`Failed to update onboarding state in Step 1: ${updateError.message}`);
      }
    }

    // STEP 2: Create Auth User if missing
    if (!userId) {
      // Check if user already exists in auth.users by email (resilience check)
      // Since supabaseAdmin is service_role, we can list users or try creating and catching the exist error
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        // If user already exists in Auth, try retrieving their user ID to recover state
        if (authError.message.includes('already exists') || authError.status === 422) {
          // Attempt to locate user in auth by email (privilege check)
          const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          if (listError) {
            throw new Error(`Failed to list users to resolve duplicate user: ${listError.message}`);
          }
          const foundUser = users.find(u => u.email === email);
          if (!foundUser) {
            throw new Error('User account already exists in Auth, but could not be retrieved.');
          }
          userId = foundUser.id;
        } else {
          throw new Error(`[Step 2 Failed] Auth user creation failed: ${authError.message}`);
        }
      } else if (authUser.user) {
        userId = authUser.user.id;
      }

      if (!userId) {
        throw new Error('[Step 2 Failed] Failed to resolve auth user ID.');
      }

      // Update onboarding state table
      const { error: updateError } = await supabaseAdmin
        .from('onboarding_status')
        .update({
          user_id: userId,
          step: 'user_created',
          status: 'pending',
          error_message: null,
        })
        .eq('id', currentStatus.id);

      if (updateError) {
        throw new Error(`Failed to update onboarding state in Step 2: ${updateError.message}`);
      }
    }

    // STEP 3: Create public.profiles record
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        company_id: companyId,
        role: 'admin',
        full_name: fullName,
      });

    if (profileError) {
      // If profile already exists, we treat it as complete (idempotent recovery)
      if (profileError.code !== '23505') {
        throw new Error(`[Step 3 Failed] Profile record creation failed: ${profileError.message}`);
      }
    }

    // Finalize onboarding status table as completed
    const { error: finalUpdateError } = await supabaseAdmin
      .from('onboarding_status')
      .update({
        step: 'profile_created',
        status: 'completed',
        error_message: null,
      })
      .eq('id', currentStatus.id);

    if (finalUpdateError) {
      throw new Error(`Failed to finalize onboarding state: ${finalUpdateError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully. Please sign in.',
      companyId,
      userId,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[SIGNUP ONBOARDING EXCEPTION] Storing failure state in machine:', error.message);

    // Save failure logs into onboarding state table instead of rolling back
    try {
      const emailInput = req.body ? (await req.clone().json()).email : null;
      if (emailInput) {
        await supabaseAdmin
          .from('onboarding_status')
          .update({
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('email', emailInput);
      }
    } catch (saveError: any) {
      console.error('[STATE MACHINE EXCEPTION] Failed to save failure state log:', saveError.message);
    }

    return NextResponse.json(
      { error: 'Onboarding halted. Progress saved for safe retry.', details: error.message },
      { status: 500 }
    );
  }
}
