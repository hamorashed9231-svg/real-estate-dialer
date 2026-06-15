'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthGuard } from '@/components/AuthGuard';
import { DialerStatsWidget } from '@/components/DialerStats';
import { CampaignSelector } from '@/components/CampaignSelector';
import { LeadCard } from '@/components/LeadCard';
import { CallControls } from '@/components/CallControls';
import { DispositionPanel } from '@/components/DispositionPanel';
import { useDialer } from '@/hooks/useDialer';
import { Campaign } from '@/types/dialer';

interface AuthSession {
  supabaseUrl: string;
  supabaseAnonKey: string;
  sessionToken: string;
  userId: string;
  companyId: string;
  userEmail: string;
  fullName: string;
  supabaseClient?: any;
}

export default function Home() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showDocs, setShowDocs] = useState<boolean>(false);

  // Initialize the dialer hook once authenticated
  const dialer = useDialer(
    session
      ? {
          sessionToken: session.sessionToken,
          userId: session.userId,
          companyId: session.companyId,
        }
      : {
          sessionToken: '',
          userId: '',
          companyId: '',
        }
  );

  // Load campaigns on authentication
  useEffect(() => {
    if (!session) return;

    const fetchCampaigns = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('company_id', session.companyId);

        if (error) throw error;
        setCampaigns(data || []);
      } catch (err: any) {
        console.error('Failed to load campaigns:', err.message);
      }
    };

    fetchCampaigns();
  }, [session]);

  const handleLogout = async () => {
    if (session?.supabaseClient) {
      try {
        await session.supabaseClient.auth.signOut();
      } catch (err) {
        console.error('Failed to sign out from Supabase:', err);
      }
    }
    setSession(null);
    setCampaigns([]);
  };

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Track state changes to fire toasts
  const [prevLeadId, setPrevLeadId] = useState<string | null>(null);
  const [prevCallStatus, setPrevCallStatus] = useState<string>('idle');

  useEffect(() => {
    if (dialer.currentLead?.id !== prevLeadId) {
      if (dialer.currentLead) {
        showToast('Lead loaded successfully', 'success');
      }
      setPrevLeadId(dialer.currentLead?.id || null);
    }

    if (dialer.callStatus !== prevCallStatus) {
      if (dialer.callStatus === 'initiated') {
        showToast('Call started', 'info');
      } else if (dialer.callStatus === 'answered') {
        showToast('Call connected', 'success');
      } else if (dialer.callStatus === 'completed' && prevCallStatus !== 'idle') {
        showToast('Call completed', 'success');
      } else if (dialer.callStatus === 'failed') {
        showToast('Call connection failed', 'error');
      }
      setPrevCallStatus(dialer.callStatus);
    }

    // Capture disposition submission
    if (prevLeadId && !dialer.currentLead && prevCallStatus === 'completed') {
      showToast('Disposition and notes saved', 'success');
    }
  }, [dialer.currentLead, dialer.callStatus, prevLeadId, prevCallStatus]);

  const isCallActive = ['initiated', 'ringing', 'answered'].includes(dialer.callStatus);

  return (
    <AuthGuard onAuthenticated={(newSession) => setSession(newSession)}>
      {session && (
        <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans relative">
          
          {/* Toast Notification Widget */}
          {toast && (
            <div className="fixed top-5 right-5 z-50 animate-bounce duration-300">
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-bold shadow-2xl ${
                toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' :
                toast.type === 'error' ? 'bg-red-500/10 border-red-500/25 text-red-400' :
                'bg-blue-500/10 border-blue-500/25 text-blue-400'
              }`}>
                <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}</span>
                <span>{toast.message}</span>
              </div>
            </div>
          )}

          {/* Header Navigation */}
          <header className="border-b border-zinc-900 bg-zinc-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-600/10">
                D
              </span>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">DialerPro Workspace</h1>
                <p className="text-[10px] text-zinc-400 font-mono">
                  Tenant: {session.companyId.substring(0, 8)}...
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-zinc-200">{session.fullName}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{session.userEmail}</div>
              </div>

              {/* Toggle Developer Console */}
              <button
                onClick={() => setShowDocs(!showDocs)}
                className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs font-semibold hover:bg-zinc-900 transition-colors"
              >
                {showDocs ? 'Workspace' : 'API Docs'}
              </button>

              <button
                onClick={handleLogout}
                className="text-xs text-zinc-400 hover:text-red-400 font-semibold transition-colors"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Productivity widgets row */}
          <div className="max-w-7xl w-full mx-auto px-6 pt-6">
            <DialerStatsWidget stats={dialer.stats} />
          </div>

          {/* Main workspace layout */}
          <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 overflow-hidden">
            {showDocs ? (
              /* Developer Console Panel */
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 overflow-y-auto max-h-[75vh]">
                <div>
                  <h2 className="text-xl font-bold text-white">Developer API Reference</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Direct access URLs to test the API integrations using cURL or Postman.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-850">
                    <div className="text-xs font-semibold text-blue-400 uppercase font-mono">POST /api/leads/create</div>
                    <pre className="text-[11px] font-mono text-zinc-300 mt-2 overflow-x-auto">
{`curl -X POST http://localhost:3000/api/leads/create \\
  -H "Authorization: Bearer ${session.sessionToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Ziad Rashed",
    "phone": "+15550199",
    "email": "ziad@example.com",
    "status": "new",
    "custom_fields": { "propertyValue": 450000, "bedrooms": 4 }
  }'`}
                    </pre>
                  </div>

                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-850">
                    <div className="text-xs font-semibold text-blue-400 uppercase font-mono">POST /api/leads/import-csv</div>
                    <pre className="text-[11px] font-mono text-zinc-300 mt-2 overflow-x-auto">
{`curl -X POST http://localhost:3000/api/leads/import-csv \\
  -H "Authorization: Bearer ${session.sessionToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "campaignId": "${dialer.activeCampaignId || 'CAMPAIGN_UUID'}",
    "csvData": "Full Name,Mobile Number,Email\\nJohn Doe,555-0100,john@doe.com",
    "fieldMappings": {
      "name": "Full Name",
      "phone": "Mobile Number",
      "email": "Email"
    }
  }'`}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              /* Agent Dialer Workspace Grid */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[72vh] relative">
                
                {/* 1. Left Panel (Campaign + Queue) - Hidden in Focus Mode */}
                {!isCallActive && (
                  <div className="lg:col-span-3 h-full transition-all duration-300">
                    <CampaignSelector
                      campaigns={campaigns}
                      selectedCampaignId={dialer.activeCampaignId}
                      onSelectCampaign={dialer.setActiveCampaignId}
                      metrics={dialer.queueMetrics}
                      onFetchNext={dialer.fetchNextLead}
                      loading={dialer.loading}
                      hasActiveCall={isCallActive}
                    />
                  </div>
                )}

                {/* 2. Center Panel (Active Lead / Dialer Controls) */}
                <div className={`${isCallActive ? 'lg:col-span-12 max-w-xl mx-auto w-full flex flex-col justify-center items-center h-full' : 'lg:col-span-5'} h-full transition-all duration-300`}>
                  {isCallActive && (
                    /* Blur dimmed backdrop overlay in Focus Mode */
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 transition-all duration-300 pointer-events-none" />
                  )}
                  <div className={`relative z-40 w-full flex flex-col gap-6 ${isCallActive ? 'bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl shadow-blue-500/5' : ''}`}>
                    <LeadCard
                      lead={dialer.currentLead}
                      loading={dialer.loading}
                      variant="identity"
                      focusMode={isCallActive}
                    />
                    <CallControls
                      currentLead={dialer.currentLead}
                      callStatus={dialer.callStatus}
                      callDuration={dialer.callDuration}
                      onStartCall={dialer.startCall}
                      onEndCall={dialer.endCall}
                      loading={dialer.loading}
                      focusMode={isCallActive}
                    />
                  </div>
                </div>

                {/* 3. Right Panel (Actions / CRM details / timeline) - Hidden in Focus Mode */}
                {!isCallActive && (
                  <div className="lg:col-span-4 h-full flex flex-col gap-6 overflow-y-auto pr-1">
                    {dialer.error && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-semibold text-center">
                        ⚠️ {dialer.error}
                      </div>
                    )}

                    <DispositionPanel
                      currentLead={dialer.currentLead}
                      onSubmit={dialer.submitDisposition}
                      loading={dialer.loading}
                      hasCallStarted={dialer.callStatus !== 'idle'}
                    />

                    <LeadCard
                      lead={dialer.currentLead}
                      history={dialer.leadHistory}
                      loading={dialer.loading}
                      variant="details"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
