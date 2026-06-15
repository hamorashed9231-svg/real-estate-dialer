import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch tenant profile (company_id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Tenant profile not found' },
        { status: 403 }
      );
    }

    const { company_id } = profile;

    // 3. Parse input request
    const { name, phone, email, status = 'new', custom_fields = {} } = await req.json();

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Name and Phone are required.' },
        { status: 400 }
      );
    }

    // Standardize phone format (clean non-digits)
    const digitsOnly = phone.replace(/\D/g, '');
    const formattedPhone = digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`;

    // 4. Insert lead into the database
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        company_id,
        name,
        phone: formattedPhone,
        email,
        status,
        custom_fields,
      })
      .select()
      .single();

    if (insertError) {
      // Handle unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'A lead with this phone number already exists in your company database.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Database insert failed', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
