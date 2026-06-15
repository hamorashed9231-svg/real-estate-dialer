export type UserRole = 'admin' | 'agent';

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email: string | null;
  status: 'new' | 'contacted' | 'interested' | 'not_interested' | 'callback';
  custom_fields: Record<string, any>;
  created_at: string;
}

export interface Campaign {
  id: string;
  company_id: string;
  name: string;
  status: 'active' | 'paused';
  created_at: string;
}

export interface CampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  company_id: string;
  status: 'pending' | 'calling' | 'completed' | 'skipped';
  priority: number;
  locked_by: string | null;
  created_at: string;
}

export interface Call {
  id: string;
  company_id: string;
  campaign_id: string | null;
  lead_id: string;
  user_id: string | null;
  phone_number: string;
  status: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed';
  duration: number | null;
  voip_call_sid: string | null;
  recording_url: string | null;
  created_at: string;
  // Join references
  profiles?: {
    full_name: string | null;
  };
}

export interface Note {
  id: string;
  company_id: string;
  lead_id: string;
  user_id: string | null;
  note_text: string;
  created_at: string;
  // Join references
  profiles?: {
    full_name: string | null;
  };
}

export interface DialerStats {
  calls_today: number;
  contacts_reached: number;
  interested_leads: number;
  callbacks_scheduled: number;
}

export interface QueueMetrics {
  pending: number;
  calling_now: number;
  completed: number;
  skipped: number;
}
