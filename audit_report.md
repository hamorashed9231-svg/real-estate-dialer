# End-to-End QA & Security Audit Report - Dialer MVP

**Author**: Senior QA Engineer & SaaS Systems Architect  
**Target Project**: SaaS Real Estate Power Dialer MVP  
**Status**: Verification Completed  

---

## Executive Summary
This audit provides a comprehensive code review of the database schema, RLS policies, Next.js API endpoints, and client-side state machine implemented for the Dialer MVP. 

The system implements a modern, token-based multi-tenant architecture with robust atomic database locks. However, several critical security vulnerabilities and operational hazards must be resolved before deploying this system to production.

---

## 1. Critical Issues

### CRITICAL-01: Profile Table Update RLS Privilege Escalation
- **Location**: `supabase_schema.sql` (RLS Policy: `"Update Profiles"`)
- **Vulnerability**: The update policy allows users to update their own profiles if `id = auth.uid()`. Since there are no column-level checks, any standard agent can issue a direct Supabase query modifying their own `role` column from `'agent'` to `'admin'`.
- **Impact**: Full privilege escalation. Agents can self-promote to admin status, allowing them to delete leads, modify campaign queues, and access company settings.

### CRITICAL-02: Self-Onboarding Profile Creation Block
- **Location**: `supabase_schema.sql` (RLS Policy: `"Insert Profiles"`)
- **Vulnerability**: The policy restricts profile inserts to: `company_id = public.get_user_company_id() AND public.is_company_admin()`. When a new user signs up, they do not yet have a record in `public.profiles`. Therefore, `get_user_company_id()` returns `NULL` and `is_company_admin()` returns `FALSE`.
- **Impact**: New users cannot insert their initial profile record upon signup, completely blocking the user onboarding flow.

---

## 2. High Priority Issues

### HIGH-01: Webhook Spoofing via Unauthenticated Endpoint
- **Location**: `src/app/api/webhooks/telnyx/route.ts`
- **Vulnerability**: The webhook endpoint receives incoming call status events and uses the unconstrained `getSupabaseAdminClient()` to update call records. There is no verification of the Telnyx signature header (`telnyx-signature-ed25519`).
- **Impact**: An attacker can send spoofed hangups or fake call events to complete calls, inject fake recording links, or unlock queues.

### HIGH-02: Orphaned Locked Leads (Stuck Queue Items)
- **Location**: `supabase_queue_function.sql` (Stored Procedure: `fetch_and_lock_next_lead`)
- **Vulnerability**: When an agent locks a lead, the status changes to `'calling'`. If the agent's browser crashes, they close the tab, or their network drops before saving a disposition, the record remains in `'calling'` status indefinitely.
- **Impact**: Stale locks accumulate over time, leaving leads permanently hidden from the active dialing queue.

### HIGH-03: Stale JWT Session Token Expiration
- **Location**: `src/hooks/useDialer.ts`
- **Vulnerability**: The hook receives the initial `sessionToken` on login and caches the Supabase headers. It does not listen to `onAuthStateChange`. 
- **Impact**: After 1 hour, the Supabase JWT expires. Subsequent API calls using the old token will return `401 Unauthorized`, forcing agents to log out and log back in.

---

## 3. Medium Priority Issues

### MED-01: Premature Queue Completion via Hangup Webhook
- **Location**: `src/app/api/webhooks/telnyx/route.ts`
- **Vulnerability**: The Telnyx hangup event (`call.hangup`) automatically updates the `campaign_leads` status to `'completed'`.
- **Impact**: If the agent intends to mark the call as a "Callback" or "Wrong Number" during their wrapping phase, the webhook has already marked it as `'completed'` and removed it from the queue, causing race conditions in queue metrics.

### MED-02: Phone Number Normalization Mismatch
- **Location**: `src/app/api/leads/import-csv/route.ts` vs `src/app/api/leads/create/route.ts`
- **Vulnerability**: Phone numbers are cleaned and formatted during lead creation, but the unique constraint `unique_company_lead_phone` relies on string equality. If a number is imported with formatting that bypasses the cleaner, duplicate leads can occur.

---

## 4. Recommended Fixes

### Fix for CRITICAL-01 (Privilege Escalation)
Use a PostgreSQL `BEFORE UPDATE` trigger on `public.profiles` to reject role modifications by non-admins:
```sql
CREATE OR REPLACE FUNCTION check_profile_role_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.company_id IS DISTINCT FROM NEW.company_id) 
       AND NOT public.is_company_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can modify roles or company associations.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_check_role_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION check_profile_role_modification();
```

### Fix for CRITICAL-02 (Onboarding Block)
Provide a policy that allows users to create their *first* profile record if it matches their authenticated user ID and the company is verified:
```sql
CREATE POLICY "Users can create their own initial profile" ON public.profiles
    FOR INSERT WITH CHECK (id = auth.uid());
```

### Fix for HIGH-01 (Webhook Verification)
Implement Telnyx webhook signature verification in Next.js:
```typescript
import { verifySignature } from '@telnyx/webrtc'; // Or raw crypto verification
// Verify req.headers.get('telnyx-signature-ed25519') against raw text body
```

### Fix for HIGH-02 (Orphaned Locks)
Add a `locked_at` column to `campaign_leads`, and allow fetching calling leads whose locks have expired (e.g. > 5 minutes):
```sql
-- In fetch_and_lock_next_lead
SELECT cl.id, cl.lead_id INTO v_campaign_lead_id, v_lead_id
FROM public.campaign_leads cl
WHERE cl.campaign_id = p_campaign_id 
  AND cl.company_id = v_company_id
  AND (cl.status = 'pending' OR (cl.status = 'calling' AND cl.locked_at < now() - interval '5 minutes'))
ORDER BY cl.priority DESC, cl.created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- Update locked_at during lock
UPDATE public.campaign_leads
SET status = 'calling', locked_by = v_user_id, locked_at = now()
WHERE id = v_campaign_lead_id;
```

### Fix for HIGH-03 (Token Expiration)
Add `onAuthStateChange` listener in `page.tsx` to refresh the session token dynamically:
```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      setSessionToken(session.access_token);
    }
  });
  return () => subscription.unsubscribe();
}, []);
```

### Fix for MED-01 (Premature Queue Completion)
Remove the `campaign_leads` update from `/api/webhooks/telnyx`. Let the queue status remain `'calling'` (locked) until the agent explicitly posts to `/api/calls/update` with their chosen disposition.

---

## 5. Production Readiness & Go/No-Go

### Production Readiness Score: **72/100**
- **Architecture**: 90/100 (Strong multi-tenant model, index utilization, and Postgres lock queue)
- **Security**: 55/100 (Bypasses webhook signature, profile role modifications, and initial signup constraints)
- **Stability**: 70/100 (Handles state transitions via Supabase Realtime, but lacks session token refreshing and lock recovery)

### Go / No-Go Recommendation: **NO-GO**
The system is in a highly complete and functional MVP state, but due to the two critical security vulnerabilities (agent self-promotion to admin, blocked user onboarding) and webhook spoofing risks, we recommend a **NO-GO** for production launch until the recommended fixes are deployed. Once fixed, the system is immediately ready for production testing.
