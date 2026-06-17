import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, Calendar, Phone, PhoneCall, UserCheck, MailCheck, 
  Ban, Download, Loader2, Users, FolderOpen, Volume2 
} from 'lucide-react';
import CallVolumeChart from '../components/dashboard/CallVolumeChart';
import DispositionChart from '../components/dashboard/DispositionChart';
import api from '../lib/axios';

interface AgentReportRow {
  agentId: string;
  name: string;
  callsMade: number;
  answerRate: number;
  avgHandleTime: number;
  avgDialsToConnect: number;
  conversions: number;
  dncRequests: number;
}

interface CampaignReportRow {
  campaignId: string;
  name: string;
  totalLeads: number;
  contactedPercent: number;
  interestedPercent: number;
  conversionRate: number;
  status: string;
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'summary' | 'agents' | 'campaigns'>('summary');
  const [period, setPeriod] = useState<'1d' | '7d' | '30d'>('7d');

  // 1. Query Call Summary metrics
  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['reports-summary', period],
    queryFn: async () => {
      const res = await api.get(`/reports/summary?period=${period}`);
      return res.data.data;
    },
  });

  // 2. Query Agent Performance metrics
  const { data: agentsReport = [], isLoading: isLoadingAgents } = useQuery<AgentReportRow[]>({
    queryKey: ['reports-agents', period],
    queryFn: async () => {
      const res = await api.get(`/reports/agents?period=${period}`);
      return res.data.data;
    },
    enabled: activeTab === 'agents',
  });

  // 3. Query Campaign Performance metrics
  const { data: campaignsReport = [], isLoading: isLoadingCampaigns } = useQuery<CampaignReportRow[]>({
    queryKey: ['reports-campaigns'],
    queryFn: async () => {
      const res = await api.get('/reports/campaigns');
      return res.data.data;
    },
    enabled: activeTab === 'campaigns',
  });

  // Helper to trigger direct attachment downloads
  const handleExportCSV = () => {
    const exportType = activeTab === 'summary' ? 'calls' : activeTab;
    const downloadUrl = `/api/reports/export?type=${exportType}&period=${period}`;
    
    // Create hidden link to click and force file download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `propdial-${exportType}-report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatHandleTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-300">
      
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-800/40">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Performance Analytics</h1>
          <p className="text-xs text-zinc-550">Track calling SLAs, conversion stats, and agent metrics.</p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs font-bold text-zinc-400 focus:outline-none"
          >
            <option value="1d">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* Export Report Trigger */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-900/10 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-850 p-1 bg-zinc-900/10 gap-2 max-w-sm rounded-2xl border border-zinc-900">
        {(['summary', 'agents', 'campaigns'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? 'bg-zinc-900 border border-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-350'
            }`}
          >
            {tab === 'summary' ? 'Call Summary' : tab === 'agents' ? 'Agents Roster' : 'Campaigns'}
          </button>
        ))}
      </div>

      {/* TAB 1: Call Summary View */}
      {activeTab === 'summary' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {isLoadingSummary ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span>Compiling aggregate analytics...</span>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest block">Total Calls</span>
                  <p className="text-2xl font-bold font-mono mt-2 text-zinc-200">{summary?.totalCalls}</p>
                </div>
                <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest block">Connected</span>
                  <p className="text-2xl font-bold font-mono mt-2 text-emerald-400">{summary?.answered}</p>
                </div>
                <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest block">Answer Rate</span>
                  <p className="text-2xl font-bold font-mono mt-2 text-blue-400">{summary?.answerRate}%</p>
                </div>
                <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest block">Avg Duration</span>
                  <p className="text-2xl font-bold font-mono mt-2 text-amber-400">{formatHandleTime(summary?.avgHandleTime || 0)}</p>
                </div>
                <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest block">Conversions</span>
                  <p className="text-2xl font-bold font-mono mt-2 text-purple-400">{summary?.converted}</p>
                </div>
              </div>

              {/* Embed Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CallVolumeChart />
                <DispositionChart />
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Agent Performance Table */}
      {activeTab === 'agents' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4 animate-in fade-in duration-200">
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Agent Performance Table</h3>
            <p className="text-[10px] text-zinc-500">Outbound call logs grouped per company dialing representative.</p>
          </div>

          <div className="overflow-x-auto border border-zinc-850 rounded-2xl bg-zinc-950/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/70">
                  <th className="py-4 px-4">Agent Name</th>
                  <th className="py-4 px-4 text-center">Dials Made</th>
                  <th className="py-4 px-4 text-center">Answer Rate</th>
                  <th className="py-4 px-4 text-center">Avg Handle Time</th>
                  <th className="py-4 px-4 text-center">Dials to Connect</th>
                  <th className="py-4 px-4 text-center">Conversions</th>
                  <th className="py-4 px-4 text-center">DNCs Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60 font-medium">
                {isLoadingAgents ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                      <div className="flex items-center justify-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        Analyzing rosters logs...
                      </div>
                    </td>
                  </tr>
                ) : agentsReport.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-650">No agent data found.</td>
                  </tr>
                ) : (
                  agentsReport.map((row) => (
                    <tr key={row.agentId} className="hover:bg-zinc-900/20 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-zinc-350">{row.name}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-zinc-200">{row.callsMade}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-emerald-400">{row.answerRate}%</td>
                      <td className="py-3.5 px-4 text-center font-mono text-zinc-200">
                        {formatHandleTime(row.avgHandleTime)}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-zinc-200">{row.avgDialsToConnect}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-purple-400">{row.conversions}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-rose-455">{row.dncRequests}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Campaign Performance Table */}
      {activeTab === 'campaigns' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4 animate-in fade-in duration-200">
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Campaign Analytics Table</h3>
            <p className="text-[10px] text-zinc-500">KPI status aggregates across dialing campaigns.</p>
          </div>

          <div className="overflow-x-auto border border-zinc-855 rounded-2xl bg-zinc-950/20">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/70">
                  <th className="py-4 px-4">Campaign Name</th>
                  <th className="py-4 px-4 text-center">Total Contacts</th>
                  <th className="py-4 px-4 text-center">Contact Rate</th>
                  <th className="py-4 px-4 text-center">Interested Rate</th>
                  <th className="py-4 px-4 text-center">Conversion Rate</th>
                  <th className="py-4 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60 font-medium">
                {isLoadingCampaigns ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500">
                      <div className="flex items-center justify-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        Syncing campaign matrices...
                      </div>
                    </td>
                  </tr>
                ) : campaignsReport.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-650">No campaigns logged.</td>
                  </tr>
                ) : (
                  campaignsReport.map((row) => (
                    <tr key={row.campaignId} className="hover:bg-zinc-900/20 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-zinc-350">{row.name}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-zinc-200">{row.totalLeads}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-blue-400">{row.contactedPercent}%</td>
                      <td className="py-3.5 px-4 text-center font-mono text-emerald-400">{row.interestedPercent}%</td>
                      <td className="py-3.5 px-4 text-center font-mono text-purple-400">{row.conversionRate}%</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          row.status === 'active' 
                            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' 
                            : 'text-zinc-550 bg-zinc-950 border border-zinc-850'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
