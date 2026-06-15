import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { createOutboundCall } from '@/lib/telnyx';

/**
 * POST /api/calls/start
 * 
 * Initiates an outbound dial, calls the Telnyx client helper, and writes an 'initiated' call log.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch user's company_id
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

    // 3. Parse and validate input request parameters
    const body = await req.json();
    console.log('[CALL ORIGINATION] Payload received:', body);

    const leadPhone = body.phone || body.lead_phone;
    const campaignId = body.campaignId || body.campaign_id;
    const agentId = body.agent_id || body.agentId || user.id;
    const leadId = body.leadId || body.lead_id;

    if (!leadPhone) {
      return NextResponse.json({ error: 'lead phone is required.' }, { status: 400 });
    }
    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id is required.' }, { status: 400 });
    }
    if (!agentId) {
      return NextResponse.json({ error: 'agent_id is required.' }, { status: 400 });
    }
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required.' }, { status: 400 });
    }

    // Ensure phone number is in E.164 format before sending to provider
    let formattedPhone = leadPhone.trim();
    if (!formattedPhone.startsWith('+')) {
      const digitsOnly = formattedPhone.replace(/\D/g, '');
      if (digitsOnly.length === 10) {
        formattedPhone = `+1${digitsOnly}`;
      } else {
        formattedPhone = `+${digitsOnly}`;
      }
    } else {
      const digitsOnly = formattedPhone.substring(1).replace(/\D/g, '');
      formattedPhone = `+${digitsOnly}`;
    }

    // 4. Dial call via Telnyx integration (or Mock fallback)
    let callOriginResult;
    try {
      callOriginResult = await createOutboundCall(formattedPhone);
      console.log('[CALL ORIGINATION] Provider mode:', callOriginResult.provider);
      console.log('[CALL ORIGINATION] Provider response:', callOriginResult);
    } catch (dialError: any) {
      console.error('[CALL ORIGINATION] Provider call failed:', dialError.message);
      return NextResponse.json(
        {
          success: false,
          error: 'CALL_PROVIDER_FAILED',
          details: dialError.message || 'Unknown VoIP provider error'
        },
        { status: 502 }
      );
    }

    // 5. Create a new call log in the calls database table
    const voipCallSid = callOriginResult.call_id || callOriginResult.call_control_id || `mock_${Date.now()}`;
    const { data: callLog, error: insertError } = await supabase
      .from('calls')
      .insert({
        company_id,
        campaign_id: campaignId,
        lead_id: leadId,
        user_id: agentId,
        phone_number: formattedPhone,
        status: 'initiated',
        voip_call_sid: voipCallSid,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[DATABASE ERROR] Failed to log call starting:', insertError.message);
      return NextResponse.json(
        { error: 'Outbound call was dialed, but database logging failed.', details: insertError.message },
        { status: 500 }
      );
    }

    console.log('[CALL ORIGINATION] Final call record inserted:', callLog);

    return NextResponse.json({
      success: true,
      provider: callOriginResult.provider,
      call: callLog,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
