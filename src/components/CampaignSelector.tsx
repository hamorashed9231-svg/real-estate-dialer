import { Campaign, QueueMetrics } from '@/types/dialer';

interface CampaignSelectorProps {
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string) => void;
  metrics: QueueMetrics;
  onFetchNext: () => void;
  loading: boolean;
  hasActiveCall: boolean;
}

export function CampaignSelector({
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  metrics,
  onFetchNext,
  loading,
  hasActiveCall,
}: CampaignSelectorProps) {
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-6 h-full shadow-xl shadow-black/10">
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Dialing Campaigns
        </h3>
        <p className="text-[11px] text-zinc-500 mt-1">Select an active list to start dialing</p>
      </div>

      {/* Campaigns Dropdown/List */}
      <div className="space-y-2 flex-1 overflow-y-auto max-h-[30vh]">
        {campaigns.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-6 italic bg-zinc-950/40 rounded-xl border border-zinc-800/50">
            No active campaigns found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => !hasActiveCall && onSelectCampaign(campaign.id)}
                disabled={hasActiveCall}
                className={`w-full text-left px-4 py-3.5 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] ${
                  campaign.id === selectedCampaignId
                    ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-md shadow-blue-500/5'
                    : 'bg-zinc-950/60 border-zinc-850 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                } ${hasActiveCall ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{campaign.name}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      campaign.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'
                    }`}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Campaign Queue Metrics */}
      {selectedCampaignId && selectedCampaign && (
        <div className="border-t border-zinc-800/80 pt-5 space-y-4 mt-auto">
          <div>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
              Active Queue
            </span>
            <span className="text-xs font-bold text-zinc-200 block mt-1 truncate">
              {selectedCampaign.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-medium">
            <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-850">
              <span className="text-zinc-500 block">Pending</span>
              <span className="text-sm font-bold text-zinc-300 block mt-1">
                {metrics.pending}
              </span>
            </div>
            <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-850">
              <span className="text-zinc-500 block">Calling Now</span>
              <span className="text-sm font-bold text-blue-400 block mt-1">
                {metrics.calling_now}
              </span>
            </div>
            <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-850">
              <span className="text-zinc-500 block">Completed</span>
              <span className="text-sm font-bold text-emerald-400 block mt-1">
                {metrics.completed}
              </span>
            </div>
            <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-850">
              <span className="text-zinc-500 block">Skipped</span>
              <span className="text-sm font-bold text-red-400 block mt-1">
                {metrics.skipped}
              </span>
            </div>
          </div>

          <button
            onClick={onFetchNext}
            disabled={loading || hasActiveCall || metrics.pending === 0}
            className="w-full flex items-center justify-center py-3 px-4 border border-transparent text-xs font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-600/10"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                Locking Lead...
              </span>
            ) : (
              'Fetch Next Lead'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
