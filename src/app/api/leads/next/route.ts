import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/leads/next?campaignId=xxx
 * 
 * Fetches and locks the next available lead from the campaign queue atomically.
 * Resolves race conditions across concurrent agents dialing the same campaign.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse campaignId query parameter
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId query parameter is required.' },
        { status: 400 }
      );
    }

    // 3. Invoke the atomic PostgreSQL RPC
    const timeoutMinutes = parseInt(process.env.DIALER_LOCK_TIMEOUT_MINUTES || '5', 10);
    const { data: leadArray, error: rpcError } = await supabase.rpc(
      'fetch_and_lock_next_lead',
      { 
        p_campaign_id: campaignId,
        p_timeout_minutes: timeoutMinutes
      }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: 'Stored procedure execution failed', details: rpcError.message },
        { status: 500 }
      );
    }

    // Stored procedure returns a list containing either 0 or 1 row
    if (!leadArray || leadArray.length === 0) {
      return NextResponse.json(
        { message: 'The queue for this campaign is empty.' },
        { status: 200 }
      );
    }

    const nextLead = leadArray[0];

    return NextResponse.json({
      success: true,
      campaign_lead_id: nextLead.campaign_lead_id,
      lead_id: nextLead.lead_id,
      name: nextLead.name,
      phone: nextLead.phone,
      email: nextLead.email,
      status: nextLead.status,
      custom_fields: nextLead.custom_fields,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
