import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Megaphone, Plus, Play, Pause, Trash2, Loader2, X, AlertTriangle, 
  Layers, Settings2, BarChart2 
} from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import api from '../lib/axios';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  mode: 'power' | 'preview';
  linesPerAgent: number;
  status: 'active' | 'paused';
  createdAt: string;
}

export default function Campaigns() {
  const queryClient = useQueryClient();

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'power' | 'preview'>('power');
  const [linesPerAgent, setLinesPerAgent] = useState(1);

  // Query campaigns
  const { data: campaigns = [], isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await api.get('/campaigns');
      return res.data.data;
    },
  });

  // Create Campaign Mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.post('/campaigns', payload);
    },
    onSuccess: () => {
      toast.success('Campaign created successfully.');
      setIsCreateOpen(false);
      setName('');
      setMode('power');
      setLinesPerAgent(1);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to create campaign.');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createCampaignMutation.mutate({
      name: name.trim(),
      mode,
      linesPerAgent,
    });
  };

  // Toggle status Mutation
  const toggleCampaignMutation = useMutation({
    mutationFn: async (campaign: Campaign) => {
      const action = campaign.status === 'active' ? 'pause' : 'start';
      await api.post(`/campaigns/${campaign.id}/${action}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign status toggled successfully.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to toggle status.');
    },
  });

  // Delete Campaign Mutation
  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/campaigns/${id}`);
    },
    onSuccess: () => {
      toast.success('Campaign deleted successfully.');
      setIsDeleteOpen(false);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to delete campaign.');
    },
  });

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-300">
      
      {/* Header bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-800/40">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 font-sans">Campaign Queues</h1>
          <p className="text-xs text-zinc-550">Orchestrate automated preview or power call dialing routines.</p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="w-full md:w-auto h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-900/10 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Campaign
        </button>
      </div>

      {/* Main campaigns display grid */}
      <div className="min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-zinc-550 text-xs">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span>Syncing campaign pools...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={Megaphone}
              title="No Dialing Campaigns Created"
              description="Configure your first dialing campaign to load pending lead queues."
              actionLabel="Create Campaign"
              onAction={() => setIsCreateOpen(true)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map((camp) => {
              const isActive = camp.status === 'active';
              return (
                <div key={camp.id} className="glass p-5 rounded-3xl border border-zinc-800/80 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="font-bold text-zinc-200">{camp.name}</h3>
                      <div className="flex gap-2 text-[10px]">
                        <span className="font-bold uppercase px-2 py-0.5 rounded bg-zinc-950 border border-zinc-850 text-zinc-400">
                          {camp.mode} dial
                        </span>
                        <span className="font-mono text-zinc-500 font-bold px-2 py-0.5 rounded bg-zinc-950 border border-zinc-850">
                          {camp.linesPerAgent} Line(s)
                        </span>
                      </div>
                    </div>

                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                      isActive 
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                        : 'text-zinc-550 bg-zinc-950 border-zinc-850'
                    }`}>
                      {camp.status}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-zinc-900">
                    <span className="text-[10px] font-bold text-zinc-550 font-mono">
                      Created: {new Date(camp.createdAt).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCampaignMutation.mutate(camp)}
                        disabled={toggleCampaignMutation.isPending}
                        className={`p-2 rounded-xl text-xs font-bold flex items-center justify-center border transition-all ${
                          isActive
                            ? 'bg-amber-600/10 border-amber-500/20 hover:bg-amber-600 text-amber-400 hover:text-white'
                            : 'bg-emerald-600/10 border-emerald-500/20 hover:bg-emerald-600 text-emerald-400 hover:text-white'
                        }`}
                      >
                        {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>

                      <button
                        type="button"
                        disabled={isActive}
                        onClick={() => {
                          setActiveCampaign(camp);
                          setIsDeleteOpen(true);
                        }}
                        className="p-2 bg-zinc-950 border border-zinc-850 hover:border-zinc-800 text-zinc-500 hover:text-red-400 rounded-xl transition-colors disabled:opacity-30"
                        title="Delete Campaign"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start pb-1 border-b border-zinc-850">
              <div>
                <h3 className="font-bold text-zinc-100">Create Dial Campaign</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Define calling speeds and constraints.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Campaign Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FSBO Prospecting Call Queue"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Dialer Mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as any)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-2.5 text-xs text-zinc-300 focus:outline-none"
                  >
                    <option value="power">Power Dial</option>
                    <option value="preview">Preview Dial</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Lines Per Agent</label>
                  <select
                    value={linesPerAgent}
                    onChange={(e) => setLinesPerAgent(parseInt(e.target.value, 10))}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-2.5 text-xs text-zinc-300 focus:outline-none"
                  >
                    <option value={1}>1 Line (Single)</option>
                    <option value={2}>2 Lines (Multi)</option>
                    <option value={3}>3 Lines (Multi)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={createCampaignMutation.isPending}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {createCampaignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Campaign
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Campaign Confirm overlay */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Dialing Campaign"
        message={`Are you sure you want to delete campaign "${activeCampaign?.name}"? All assigned lead mappings will be severed.`}
        confirmLabel="Confirm Delete"
        isDestructive={true}
        onConfirm={() => activeCampaign && deleteCampaignMutation.mutate(activeCampaign.id)}
        onCancel={() => setIsDeleteOpen(false)}
      />

    </div>
  );
}
