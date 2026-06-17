import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Upload, Download, Search, Filter, Ban, Trash2, Phone, Edit, 
  Trash, Loader2, X, ChevronLeft, ChevronRight, Check, AlertTriangle, 
  CheckCircle2, Users, FileSpreadsheet, Play 
} from 'lucide-react';
import Papa from 'papaparse';
import { useDialerStore } from '../store/dialerStore';
import { useDialer } from '../hooks/useDialer';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import api from '../lib/axios';
import { toast } from 'sonner';

interface CRMLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  customFields: Record<string, any>;
  createdAt: string;
}

export default function Leads() {
  const queryClient = useQueryClient();
  const { startCall } = useDialer();
  const callStatus = useDialerStore((state) => state.callStatus);

  // Local filtering & pagination state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Selected rows for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDncOpen, setIsDncOpen] = useState(false);
  const [isBulkCampaignOpen, setIsBulkCampaignOpen] = useState(false);
  
  // Active editing lead
  const [activeLead, setActiveLead] = useState<CRMLead | null>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [source, setSource] = useState('Organic');
  const [notes, setNotes] = useState('');

  // Bulk status / Campaign states
  const [bulkCampaignId, setBulkCampaignId] = useState('');

  // CSV Import States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importResults, setImportResults] = useState<{ imported: number; skipped: number; errors: any[] } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Fetch campaigns for lists
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await api.get('/campaigns');
      return res.data.data;
    },
  });

  // Fetch CRM Leads list based on filters
  const { data: leadsData, isLoading, refetch } = useQuery({
    queryKey: ['leads', page, search, statusFilter, campaignFilter],
    queryFn: async () => {
      const res = await api.get('/leads', {
        params: {
          page,
          limit,
          search: search || undefined,
          status: statusFilter || undefined,
          campaignId: campaignFilter || undefined,
        },
      });
      return res.data.data;
    },
  });

  const leadsList: CRMLead[] = leadsData?.leads || [];
  const totalLeadsCount = leadsData?.pagination?.total || 0;
  const totalPages = leadsData?.pagination?.pages || 1;

  // Single Lead Call Trigger
  const handleInitiateCall = async (lead: CRMLead) => {
    if (callStatus !== 'idle') {
      toast.warning('A call is already active on the softphone.');
      return;
    }
    toast.info(`Initiating call to: ${lead.name}`);
    await startCall(lead.id, lead.phone);
  };

  // Add/Edit Forms Submit Handlers
  const handleOpenAddModal = () => {
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setState('');
    setZip('');
    setSource('Organic');
    setNotes('');
    setIsAddOpen(true);
  };

  const handleOpenEditModal = (lead: CRMLead) => {
    const parts = lead.name.split(' ');
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setPhone(lead.phone.replace('+1', ''));
    setEmail(lead.email || '');
    setAddress(lead.customFields?.address || '');
    setCity(lead.customFields?.city || '');
    setState(lead.customFields?.state || '');
    setZip(lead.customFields?.zip || '');
    setSource(lead.customFields?.source || 'Organic');
    setNotes(lead.customFields?.notes || '');
    setActiveLead(lead);
    setIsEditOpen(true);
  };

  // Add Lead Mutation
  const addLeadMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.post('/leads', payload);
    },
    onSuccess: () => {
      toast.success('Lead created successfully.');
      setIsAddOpen(false);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to create lead.');
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Invalid phone number length (requires 10 digits).');
      return;
    }

    addLeadMutation.mutate({
      name: `${firstName} ${lastName}`.trim(),
      phone: cleanPhone,
      email: email || null,
      status: 'New',
      customFields: { address, city, state, zip, source, notes },
    });
  };

  // Edit Lead Mutation
  const editLeadMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.patch(`/leads/${activeLead?.id}`, payload);
    },
    onSuccess: () => {
      toast.success('Lead updated successfully.');
      setIsEditOpen(false);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update lead.');
    },
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Invalid phone number length.');
      return;
    }

    editLeadMutation.mutate({
      name: `${firstName} ${lastName}`.trim(),
      phone: cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`,
      email: email || null,
      customFields: { address, city, state, zip, source, notes },
    });
  };

  // Delete Lead Mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/leads/${id}`);
    },
    onSuccess: () => {
      toast.success('Lead deleted successfully.');
      setIsDeleteOpen(false);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to delete lead.');
    },
  });

  // Bulk Actions
  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map(id => api.delete(`/leads/${id}`)));
      toast.success('Selected leads deleted successfully.');
      setSelectedIds([]);
      refetch();
    } catch (err) {
      toast.error('Failed to delete some leads.');
    }
  };

  const handleBulkDnc = async () => {
    try {
      await Promise.all(selectedIds.map(id => api.post(`/leads/${id}/dnc`)));
      toast.warning('Selected leads added to Do Not Call registry.');
      setSelectedIds([]);
      refetch();
      setIsDncOpen(false);
    } catch (err) {
      toast.error('Failed to register some DNC items.');
    }
  };

  const handleBulkAssignCampaign = async () => {
    if (!bulkCampaignId) return;
    try {
      await api.post(`/campaigns/${bulkCampaignId}/leads`, { leadIds: selectedIds });
      toast.success('Selected leads successfully queued in campaign.');
      setSelectedIds([]);
      setIsBulkCampaignOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to assign leads.');
    }
  };

  // CSV File Upload Parsing
  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setImportResults(null);
    setImportProgress(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setCsvHeaders(headers);
        setPreviewRows(results.data.slice(0, 5));

        // Auto map columns if standard names match
        const mapping: Record<string, string> = {};
        headers.forEach((h) => {
          const lower = h.toLowerCase();
          if (lower.includes('first') || lower === 'name') mapping[h] = 'firstName';
          else if (lower.includes('last')) mapping[h] = 'lastName';
          else if (lower.includes('phone') || lower === 'tel') mapping[h] = 'phone';
          else if (lower.includes('mail')) mapping[h] = 'email';
          else if (lower === 'city') mapping[h] = 'city';
          else if (lower === 'state') mapping[h] = 'state';
        });
        setColumnMapping(mapping);
      },
    });
  };

  // CSV Import Submit
  const handleCSVImportSubmit = async () => {
    if (!csvFile) return;

    // Build Form Data
    const formData = new FormData();
    formData.append('file', csvFile);
    if (bulkCampaignId) {
      formData.append('campaignId', bulkCampaignId);
    }

    setImportProgress(0);
    try {
      const uploadRes = await api.post('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { jobId } = uploadRes.data.data;
      setActiveJobId(jobId);

      // Start Polling Job status
      const interval = setInterval(async () => {
        try {
          const pollRes = await api.get(`/leads/jobs/${jobId}`);
          const job = pollRes.data.data;

          if (job.status === 'processing') {
            setImportProgress(job.progress);
          } else if (job.status === 'completed') {
            clearInterval(interval);
            setImportProgress(null);
            setImportResults({
              imported: job.imported,
              skipped: job.skipped,
              errors: job.errors || [],
            });
            refetch();
          } else if (job.status === 'failed') {
            clearInterval(interval);
            setImportProgress(null);
            toast.error(job.error || 'Import job failed.');
          }
        } catch (err) {
          clearInterval(interval);
          setImportProgress(null);
        }
      }, 1500);

    } catch (error: any) {
      setImportProgress(null);
      toast.error(error.response?.data?.error?.message || 'CSV upload failed.');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === leadsList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leadsList.map(l => l.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'new':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'contacted':
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
      case 'interested':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'not interested':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'callback':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'converted':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      default:
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-300">
      
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-800/40">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-100">Leads CRM manager</h1>
            <span className="text-xs font-mono font-bold bg-zinc-900 border border-zinc-850 px-2.5 py-0.5 rounded-full text-zinc-400">
              {totalLeadsCount} total contacts
            </span>
          </div>
          <p className="text-xs text-zinc-550">Sieve through, upload, and assign dials lists into your campaigns.</p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="flex-1 md:flex-none h-10 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex-1 md:flex-none h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-900/10 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Contact
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="glass p-4 rounded-2xl border border-zinc-800/80 flex flex-col xl:flex-row items-center gap-3">
        <div className="relative w-full xl:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-650" />
          <input
            type="text"
            placeholder="Search lead Name, Phone, Email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full h-10 bg-zinc-950/70 border border-zinc-850 rounded-xl pl-10 pr-4 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="w-full flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs font-semibold text-zinc-400 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="New">New</option>
            <option value="Contacted">Contacted</option>
            <option value="Interested">Interested</option>
            <option value="Not Interested">Not Interested</option>
            <option value="Callback">Callback</option>
            <option value="Converted">Converted</option>
          </select>

          {/* Campaign filter */}
          <select
            value={campaignFilter}
            onChange={(e) => {
              setCampaignFilter(e.target.value);
              setPage(1);
            }}
            className="h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs font-semibold text-zinc-400 focus:outline-none max-w-[200px]"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Bulk Actions Panel (Displays when items are checked) */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
            <Check className="h-4 w-4" />
            <span>{selectedIds.length} leads checked</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBulkCampaignOpen(true)}
              className="px-3.5 py-2 bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-bold uppercase tracking-wider rounded-xl text-zinc-300 transition-colors"
            >
              Add to Campaign
            </button>
            <button
              type="button"
              onClick={() => setIsDncOpen(true)}
              className="px-3.5 py-2 bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-[10px] font-bold uppercase tracking-wider rounded-xl text-red-400 hover:bg-red-955/10 transition-colors"
            >
              Move to DNC
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-3.5 py-2 bg-red-650 hover:bg-red-700 text-[10px] font-bold uppercase tracking-wider rounded-xl text-white transition-colors"
            >
              Delete Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-3.5 py-2 bg-zinc-950 border border-zinc-850 text-[10px] font-bold uppercase tracking-wider rounded-xl text-zinc-500 hover:text-zinc-350"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 4. Leads Table */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-4 min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-zinc-500 text-xs">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span>Syncing CRM list...</span>
          </div>
        ) : leadsList.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={Users}
              title="No CRM Contacts Found"
              description="Upload a CSV dialing roster or add single leads to populate the list."
              actionLabel="Import CSV File"
              onAction={() => setIsImportOpen(true)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-zinc-850 rounded-2xl bg-zinc-950/20">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/70 select-none">
                    <th className="py-4 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === leadsList.length}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded bg-zinc-950 border-zinc-800 text-blue-600 focus:ring-0"
                      />
                    </th>
                    <th className="py-4 px-4">Contact</th>
                    <th className="py-4 px-4">Phone</th>
                    <th className="py-4 px-4 text-center">Status</th>
                    <th className="py-4 px-4">Source</th>
                    <th className="py-4 px-4 text-center w-24">Lead Score</th>
                    <th className="py-4 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/60 font-medium">
                  {leadsList.map((lead) => {
                    const isChecked = selectedIds.includes(lead.id);
                    // Determine simple rating score (mock based on name length/date)
                    const score = Math.round(50 + (lead.name.length * 2) % 45);
                    return (
                      <tr
                        key={lead.id}
                        className={`transition-colors duration-150 ${
                          isChecked ? 'bg-blue-500/5' : 'hover:bg-zinc-900/20'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectRow(lead.id)}
                            className="h-3.5 w-3.5 rounded bg-zinc-950 border-zinc-800 text-blue-600 focus:ring-0"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-zinc-200">{lead.name}</p>
                          <p className="text-[10px] text-zinc-500">{lead.email || 'No email'}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400">{lead.phone}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeColor(lead.status)}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 text-[10.5px]">
                          {lead.customFields?.source || 'Organic'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 justify-center">
                            <span className="text-[10px] font-bold font-mono text-zinc-450">{score}</span>
                            <div className="w-12 h-1.5 bg-zinc-850 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  score > 75 ? 'bg-emerald-500' : score > 50 ? 'bg-blue-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleInitiateCall(lead)}
                              className="p-2 bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl transition-all"
                              title="Call Now"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(lead)}
                              className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-450 hover:text-zinc-200 rounded-xl transition-colors"
                              title="Edit Lead"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveLead(lead);
                                setIsDeleteOpen(true);
                              }}
                              className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-red-400/80 hover:text-red-400 rounded-xl transition-colors"
                              title="Delete Lead"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Page {page} of {totalPages}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-850 rounded-xl transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="p-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-850 rounded-xl transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Add Contact Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-2 border-b border-zinc-800">
              <div>
                <h3 className="font-bold text-zinc-100">Add CRM Contact</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Register a single lead to dialing logs.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Phone (E.164)</label>
                  <input
                    type="tel"
                    required
                    placeholder="3105550199"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Street Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Zip Code</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Lead Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-250 focus:outline-none"
                  >
                    <option value="Organic">Organic</option>
                    <option value="Cold Call">Cold Call</option>
                    <option value="FSBO Import">FSBO Import</option>
                    <option value="Direct Mail">Direct Mail</option>
                    <option value="Referral">Referral</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Internal Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={addLeadMutation.isPending}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {addLeadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save CRM Contact
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Contact Modal */}
      {isEditOpen && activeLead && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-2 border-b border-zinc-800">
              <div>
                <h3 className="font-bold text-zinc-100">Edit Lead Profile</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Modify CRM details for: {activeLead.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-855 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Phone (E.164)</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Street Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Zip Code</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Lead Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-250 focus:outline-none"
                  >
                    <option value="Organic">Organic</option>
                    <option value="Cold Call">Cold Call</option>
                    <option value="FSBO Import">FSBO Import</option>
                    <option value="Direct Mail">Direct Mail</option>
                    <option value="Referral">Referral</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Internal Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={editLeadMutation.isPending}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {editLeadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Update CRM Lead
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 7. Import CSV Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-2 border-b border-zinc-800">
              <div>
                <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                  CSV List Import Wizard
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">Import and assign contacts directly into campaigns.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* File picker */}
              <div className="border border-dashed border-zinc-800 rounded-2xl p-6 bg-zinc-950/40 text-center hover:border-zinc-700 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVFileChange}
                  className="hidden"
                  id="csv-file-picker"
                />
                <label htmlFor="csv-file-picker" className="cursor-pointer space-y-2 block">
                  <Upload className="h-8 w-8 text-zinc-650 mx-auto" />
                  <p className="text-xs text-zinc-300 font-bold">
                    {csvFile ? csvFile.name : 'Choose CSV file to parse'}
                  </p>
                  <p className="text-[10px] text-zinc-500">Max size 2MB (mp3 mapping stubs)</p>
                </label>
              </div>

              {/* CSV Columns mapping section */}
              {csvHeaders.length > 0 && (
                <div className="space-y-3 p-4 bg-zinc-950 border border-zinc-850 rounded-2xl">
                  <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Align Roster Headers</h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase">First Name</label>
                      <select
                        value={columnMapping['firstName'] || ''}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, firstName: e.target.value }))}
                        className="w-full h-8 mt-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 text-[11px]"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase">Last Name</label>
                      <select
                        value={columnMapping['lastName'] || ''}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, lastName: e.target.value }))}
                        className="w-full h-8 mt-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 text-[11px]"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase">Phone Number</label>
                      <select
                        value={columnMapping['phone'] || ''}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full h-8 mt-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 text-[11px]"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase">Email Address</label>
                      <select
                        value={columnMapping['email'] || ''}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full h-8 mt-1 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded px-2 text-[11px]"
                      >
                        <option value="">-- Choose Column --</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign Direct assignment select */}
              {csvFile && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Direct Assignment (Optional)</label>
                  <select
                    value={bulkCampaignId}
                    onChange={(e) => setBulkCampaignId(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs focus:outline-none"
                  >
                    <option value="">Keep in CRM only (Not Assigned)</option>
                    {campaigns.map((c: any) => (
                      <option key={c.id} value={c.id}>Queue directly in campaign: {c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Progress and results summary */}
              {importProgress !== null && (
                <div className="space-y-2 p-4 bg-zinc-950 border border-zinc-850 rounded-2xl">
                  <div className="flex justify-between text-xs font-bold text-zinc-350">
                    <span>Importing leads asynchronously...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-350" style={{ width: `${importProgress}%` }} />
                  </div>
                </div>
              )}

              {importResults && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    CSV File Processing Complete
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                    <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl">
                      <p className="text-[10px] font-bold text-zinc-550 uppercase">Imported</p>
                      <p className="text-lg font-bold text-emerald-400 mt-1">{importResults.imported}</p>
                    </div>
                    <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl">
                      <p className="text-[10px] font-bold text-zinc-550 uppercase">DNC Skipped</p>
                      <p className="text-lg font-bold text-amber-500 mt-1">{importResults.skipped}</p>
                    </div>
                    <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl">
                      <p className="text-[10px] font-bold text-zinc-550 uppercase">Errors</p>
                      <p className="text-lg font-bold text-red-500 mt-1">{importResults.errors.length}</p>
                    </div>
                  </div>
                </div>
              )}

              {csvFile && !importResults && importProgress === null && (
                <button
                  type="button"
                  onClick={handleCSVImportSubmit}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  Start Outbound List Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Lead Confirm Overlay */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete CRM Contact"
        message={`Are you sure you want to delete lead ${activeLead?.name}? This will purge call records.`}
        confirmLabel="Purge Lead"
        isDestructive={true}
        onConfirm={() => activeLead && deleteLeadMutation.mutate(activeLead.id)}
        onCancel={() => setIsDeleteOpen(false)}
      />

      {/* DNC Move Confirm Overlay */}
      <ConfirmDialog
        isOpen={isDncOpen}
        title="Move Selected to DNC Registry"
        message="Are you sure you want to scrub these phone numbers? Standard compliance rules prohibit future campaign dialings."
        confirmLabel="Assign DNC"
        isDestructive={true}
        onConfirm={handleBulkDnc}
        onCancel={() => setIsDncOpen(false)}
      />

      {/* Bulk Campaign Assignment Modal */}
      {isBulkCampaignOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-zinc-100">Queue Leads in Campaign</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Assign the {selectedIds.length} checked leads to an active campaign queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkCampaignOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <select
                value={bulkCampaignId}
                onChange={(e) => setBulkCampaignId(e.target.value)}
                className="w-full h-11 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs focus:outline-none"
              >
                <option value="">Select Campaign Target...</option>
                {campaigns.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleBulkAssignCampaign}
                disabled={!bulkCampaignId}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                Assign Leads to Queue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
