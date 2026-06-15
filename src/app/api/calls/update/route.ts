import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/calls/update
 * 
 * Updates call session state (status, duration, recording) and synchronizes outcomes
 * (lead status, campaign queue status, and optional post-call notes).
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

    // 2. Fetch user company_id
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

    // 3. Parse input request parameters
    const {
      callId,
      voipCallSid,
      status, // 'initiated', 'ringing', 'answered', 'completed', 'failed'
      duration,
      recordingUrl,
      leadStatus, // 'new', 'contacted', 'interested', 'not_interested', 'callback'
      campaignLeadStatus, // 'pending', 'calling', 'completed', 'skipped'
      noteText,
    } = await req.json();

    if (!callId && !voipCallSid) {
      return NextResponse.json(
        { error: 'Either callId or voipCallSid is required.' },
        { status: 400 }
      );
    }

    // 4. Update the call record in database
    const query = supabase.from('calls').update({
      status,
      duration: duration !== undefined ? duration : undefined,
      recording_url: recordingUrl || undefined,
    });

    if (callId) {
      query.eq('id', callId);
    } else {
      query.eq('voip_call_sid', voipCallSid);
    }

    const { data: updatedCalls, error: updateCallError } = await query.select();

    if (updateCallError || !updatedCalls || updatedCalls.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update call record. Verify RLS permissions and ID.', details: updateCallError?.message },
        { status: 500 }
      );
    }

    const callRecord = updatedCalls[0];

    // 5. Update lead status in the CRM database (if provided)
    if (leadStatus) {
      const { error: updateLeadError } = await supabase
        .from('leads')
        .update({ status: leadStatus })
        .eq('id', callRecord.lead_id)
        .eq('company_id', company_id);

      if (updateLeadError) {
        console.error('[CRM ERROR] Failed to update lead status:', updateLeadError.message);
      }
    }

    // 6. Update the campaign lead queue item status (if campaign exists)
    if (callRecord.campaign_id && campaignLeadStatus) {
      const { error: updateQueueError } = await supabase
        .from('campaign_leads')
        .update({
          status: campaignLeadStatus,
          locked_by: campaignLeadStatus === 'calling' ? user.id : null, // Release lock if call ends
        })
        .eq('campaign_id', callRecord.campaign_id)
        .eq('lead_id', callRecord.lead_id)
        .eq('company_id', company_id);

      if (updateQueueError) {
        console.error('[QUEUE ERROR] Failed to update queue status:', updateQueueError.message);
      }
    }

    // 7. Write call notes to database notes table (if noteText provided)
    if (noteText && noteText.trim()) {
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          company_id,
          lead_id: callRecord.lead_id,
          user_id: user.id,
          note_text: noteText,
        });

      if (noteError) {
        console.error('[NOTES ERROR] Failed to save call note:', noteError.message);
      }
    }

    return NextResponse.json({
      success: true,
      call: callRecord,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
