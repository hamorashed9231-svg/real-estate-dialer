-- =====================================================================
-- ATOMIC QUEUE LOCKING STORED PROCEDURE (WITH CONFIGURABLE TIMEOUT)
-- Target: Supabase (PostgreSQL)
-- Description: Fetches the next pending lead from a campaign queue, locks the row
--              by setting status to 'calling', locked_by to the agent's UUID, and
--              locked_at to now(). Automatically recycles locks that have expired
--              beyond p_timeout_minutes (passed from env config).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fetch_and_lock_next_lead(
    p_campaign_id UUID,
    p_timeout_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
    campaign_lead_id UUID,
    lead_id UUID,
    name TEXT,
    phone TEXT,
    email TEXT,
    status TEXT,
    custom_fields JSONB
) AS $$
DECLARE
    v_campaign_lead_id UUID;
    v_lead_id UUID;
    v_company_id UUID;
    v_user_id UUID;
BEGIN
    -- 1. Get the current user's company_id and user_id for validation
    v_company_id := public.get_user_company_id();
    v_user_id := auth.uid();
    
    IF v_company_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User tenant profile or session not found.';
    END IF;

    -- 2. Select and lock the next pending lead OR a calling lead whose lock has expired
    SELECT cl.id, cl.lead_id INTO v_campaign_lead_id, v_lead_id
    FROM public.campaign_leads cl
    WHERE cl.campaign_id = p_campaign_id 
      AND cl.company_id = v_company_id
      AND (
          cl.status = 'pending' 
          OR (cl.status = 'calling' AND cl.locked_at < (now() - (p_timeout_minutes || ' minutes')::interval))
      )
    ORDER BY cl.priority DESC, cl.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- 3. If a lead is found, mark it as 'calling', set locked_by and update locked_at
    IF v_campaign_lead_id IS NOT NULL THEN
        UPDATE public.campaign_leads
        SET status = 'calling',
            locked_by = v_user_id,
            locked_at = now()
        WHERE id = v_campaign_lead_id;

        RETURN QUERY
        SELECT 
            cl.id AS campaign_lead_id,
            l.id AS lead_id,
            l.name,
            l.phone,
            l.email,
            l.status,
            l.custom_fields
        FROM public.campaign_leads cl
        JOIN public.leads l ON cl.lead_id = l.id
        WHERE cl.id = v_campaign_lead_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
