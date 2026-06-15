import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/campaigns/[id]/next-lead
 * 
 * Alternative POST endpoint for atomic queue locking.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: campaignId } = await params;

    if (!campaignId) {
      return NextResponse.json(
        { error: 'Campaign ID parameter is required.' },
        { status: 400 }
      );
    }

    // 2. Call the stored procedure
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
