-- =====================================================================
-- SAAS REAL ESTATE POWER DIALER - MVP DATABASE SCHEMA (HARDENED DESIGN)
-- Target: Supabase (PostgreSQL 15+)
-- Features: Multi-tenancy, RLS, Webhook Idempotency, Profile Protection Triggers,
--           Onboarding State Machine Tracker
-- =====================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- PHASE 1: DATABASE SCHEMA
-- =====================================================================

-- 1. Companies Table
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Profiles Table (Extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Leads Table
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL, -- E.164 format
    email TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'not_interested', 'callback')),
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_company_lead_phone UNIQUE (company_id, phone)
);

-- 4. Campaigns Table
CREATE TABLE public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Campaign Leads Table (Queue)
CREATE TABLE public.campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'skipped')),
    priority INTEGER NOT NULL DEFAULT 0,
    locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ, -- Tracks lock timestamp for dynamic stale lock recovery
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_campaign_lead_item UNIQUE (campaign_id, lead_id)
);

-- 6. Calls Table
CREATE TABLE public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'failed')),
    duration INTEGER,
    voip_call_sid TEXT UNIQUE,
    recording_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Notes Table
CREATE TABLE public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Upgraded Webhook Events Table (Webhook Idempotency Protection)
CREATE TABLE public.webhook_events (
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT pk_webhook_events PRIMARY KEY (event_id, event_type, provider)
);

-- 9. Onboarding Status Table (Durable Sign Up State Machine)
CREATE TABLE public.onboarding_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'retry')),
    step TEXT NOT NULL CHECK (step IN ('company_created', 'user_created', 'profile_created')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- PERFORMANCE INDEXES
-- =====================================================================
CREATE INDEX idx_profiles_company ON public.profiles(company_id);
CREATE INDEX idx_leads_company_phone ON public.leads(company_id, phone);
CREATE INDEX idx_campaigns_company ON public.campaigns(company_id);
CREATE INDEX idx_campaign_leads_composite ON public.campaign_leads(company_id, campaign_id, status, priority);
CREATE INDEX idx_calls_company_sid ON public.calls(company_id, voip_call_sid);
CREATE INDEX idx_calls_lead ON public.calls(lead_id);
CREATE INDEX idx_notes_lead ON public.notes(lead_id);
CREATE INDEX idx_onboarding_status_user_status ON public.onboarding_status(user_id, status);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID AS $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
    RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;
    RETURN v_is_admin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================================
-- PROFILE PROTECTION TRIGGER (DEFENSE IN DEPTH: LAYER 3)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Block modifications if running in client context (authenticated or anon)
    -- service_role / postgres connections bypass this check.
    IF auth.role() IN ('authenticated', 'anon') THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Unauthorized: role is immutable in this context.';
        END IF;
        IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
            RAISE EXCEPTION 'Unauthorized: company_id is immutable in this context.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_protect_profile_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- Enable RLS on all business data tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY; -- Locked by default (no policies = service_role only)
ALTER TABLE public.onboarding_status ENABLE ROW LEVEL SECURITY; -- Locked by default (no policies = service_role only)

-- 1. Companies Policies
CREATE POLICY "Select Company" ON public.companies
    FOR SELECT USING (id = public.get_user_company_id());

CREATE POLICY "Update Company" ON public.companies
    FOR UPDATE USING (id = public.get_user_company_id() AND public.is_company_admin());

-- 2. Profiles Policies
CREATE POLICY "Select Profiles" ON public.profiles
    FOR SELECT USING (company_id = public.get_user_company_id());

-- Client signup is blocked. Profiles can only be inserted via backend signup API (service_role)
-- or via invitations by an existing company admin.
CREATE POLICY "Admins can invite agents by inserting profiles" ON public.profiles
    FOR INSERT WITH CHECK (
        company_id = public.get_user_company_id() 
        AND public.is_company_admin()
    );

CREATE POLICY "Admins can update profiles or users can update their own names" ON public.profiles
    FOR UPDATE USING (
        (company_id = public.get_user_company_id() AND public.is_company_admin())
        OR id = auth.uid()
    );

CREATE POLICY "Admins can delete profiles" ON public.profiles
    FOR DELETE USING (
        company_id = public.get_user_company_id() 
        AND public.is_company_admin() 
        AND id != auth.uid()
    );

-- 3. Leads Policies
CREATE POLICY "Select Leads" ON public.leads
    FOR SELECT USING (company_id = public.get_user_company_id());

CREATE POLICY "Insert Leads" ON public.leads
    FOR INSERT WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Update Leads" ON public.leads
    FOR UPDATE USING (company_id = public.get_user_company_id());

CREATE POLICY "Delete Leads" ON public.leads
    FOR DELETE USING (company_id = public.get_user_company_id() AND public.is_company_admin());

-- 4. Campaigns Policies
CREATE POLICY "Select Campaigns" ON public.campaigns
    FOR SELECT USING (company_id = public.get_user_company_id());

CREATE POLICY "Insert Campaigns" ON public.campaigns
    FOR INSERT WITH CHECK (company_id = public.get_user_company_id() AND public.is_company_admin());

CREATE POLICY "Update Campaigns" ON public.campaigns
    FOR UPDATE USING (company_id = public.get_user_company_id() AND public.is_company_admin());

CREATE POLICY "Delete Campaigns" ON public.campaigns
    FOR DELETE USING (company_id = public.get_user_company_id() AND public.is_company_admin());

-- 5. Campaign Leads Policies
CREATE POLICY "Select Campaign Leads" ON public.campaign_leads
    FOR SELECT USING (company_id = public.get_user_company_id());

CREATE POLICY "Insert Campaign Leads" ON public.campaign_leads
    FOR INSERT WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Update Campaign Leads" ON public.campaign_leads
    FOR UPDATE USING (company_id = public.get_user_company_id());

CREATE POLICY "Delete Campaign Leads" ON public.campaign_leads
    FOR DELETE USING (company_id = public.get_user_company_id() AND public.is_company_admin());

-- 6. Calls Policies
CREATE POLICY "Select Calls" ON public.calls
    FOR SELECT USING (company_id = public.get_user_company_id());

CREATE POLICY "Insert Calls" ON public.calls
    FOR INSERT WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Update Calls" ON public.calls
    FOR UPDATE USING (company_id = public.get_user_company_id());

CREATE POLICY "Delete Calls" ON public.calls
    FOR DELETE USING (company_id = public.get_user_company_id() AND public.is_company_admin());

-- 7. Notes Policies
CREATE POLICY "Select Notes" ON public.notes
    FOR SELECT USING (company_id = public.get_user_company_id());

CREATE POLICY "Insert Notes" ON public.notes
    FOR INSERT WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "Update Notes" ON public.notes
    FOR UPDATE USING (company_id = public.get_user_company_id() AND (user_id = auth.uid() OR public.is_company_admin()));

CREATE POLICY "Delete Notes" ON public.notes
    FOR DELETE USING (company_id = public.get_user_company_id() AND (user_id = auth.uid() OR public.is_company_admin()));
