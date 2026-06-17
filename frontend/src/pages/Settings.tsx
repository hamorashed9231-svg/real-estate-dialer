import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building, PhoneCall, Volume2, Users, Database, Save, Plus, Trash2, 
  Loader2, Play, Square, Link2, Copy, AlertTriangle, ShieldCheck, Mail 
} from 'lucide-react';
import api from '../lib/axios';
import { toast } from 'sonner';

interface CallerId {
  id: string;
  phoneNumber: string;
  areaCode: string;
  state: string;
  isActive: boolean;
}

interface VoicemailTemplate {
  id: string;
  name: string;
  duration: number;
  url: string;
  isDefault: boolean;
}

interface Integration {
  name: string;
  connected: boolean;
  keyStub: string;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<'profile' | 'caller-ids' | 'voicemail' | 'team' | 'crm'>('profile');

  // 1. Fetch Company settings
  const { data: companyData, isLoading: isLoadingCompany } = useQuery({
    queryKey: ['settings-company'],
    queryFn: async () => {
      const res = await api.get('/settings/company');
      return res.data.data;
    },
  });

  // 2. Fetch Caller ID pool
  const { data: callerIds = [], isLoading: isLoadingCallerIds } = useQuery<CallerId[]>({
    queryKey: ['settings-caller-ids'],
    queryFn: async () => {
      const res = await api.get('/settings/caller-ids');
      return res.data.data;
    },
  });

  // 3. Fetch Voicemail templates
  const { data: voicemailTemplates = [], isLoading: isLoadingVoicemail } = useQuery<VoicemailTemplate[]>({
    queryKey: ['settings-voicemail-templates'],
    queryFn: async () => {
      const res = await api.get('/settings/voicemail-templates');
      return res.data.data;
    },
  });

  // 4. Fetch CRM integrations
  const { data: integrations = [], isLoading: isLoadingCRM } = useQuery<Integration[]>({
    queryKey: ['settings-integrations'],
    queryFn: async () => {
      const res = await api.get('/settings/integrations');
      return res.data.data;
    },
  });

  // State controls for modifications
  const [companyName, setCompanyName] = useState('');
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // Business Hours Local states
  const [bizHours, setBizHours] = useState<any>(null);

  // New Caller ID form states
  const [newPhone, setNewPhone] = useState('');
  const [newState, setNewState] = useState('');
  const [newArea, setNewArea] = useState('');
  const [isAddingId, setIsAddingId] = useState(false);

  // Voicemail upload states
  const [vmName, setVmName] = useState('');
  const [vmFile, setVmFile] = useState<File | null>(null);
  const [isUploadingVm, setIsUploadingVm] = useState(false);
  const [playingVmId, setPlayingVmId] = useState<string | null>(null);
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);

  // Team Invite states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');

  // Sync loaded company details
  React.useEffect(() => {
    if (companyData) {
      setCompanyName(companyData.name);
      setBizHours(companyData.businessHours);
    }
  }, [companyData]);

  // Company Profile Mutation
  const updateCompanyMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.patch('/settings/company', payload);
    },
    onSuccess: () => {
      toast.success('Company profile updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['settings-company'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update settings.');
    },
  });

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompanyMutation.mutate({
      name: companyName,
      businessHours: bizHours,
    });
  };

  // Add Caller ID Mutation
  const addCallerIdMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.post('/settings/caller-ids', payload);
    },
    onSuccess: () => {
      toast.success('Number successfully added to Caller ID pool.');
      setNewPhone('');
      setNewState('');
      setNewArea('');
      queryClient.invalidateQueries({ queryKey: ['settings-caller-ids'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to add number.');
    },
  });

  const handleAddCallerId = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error('Invalid Caller ID phone number length.');
      return;
    }
    const formatted = digits.length === 10 ? `+1${digits}` : `+${digits}`;

    addCallerIdMutation.mutate({
      phoneNumber: formatted,
      state: newState || 'California',
      areaCode: newArea || digits.substring(0, 3),
    });
  };

  // Delete Caller ID Mutation
  const deleteCallerIdMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/settings/caller-ids/${id}`);
    },
    onSuccess: () => {
      toast.success('Caller ID removed from pool.');
      queryClient.invalidateQueries({ queryKey: ['settings-caller-ids'] });
    },
  });

  // Voicemail Preview player
  const handlePlayVm = (template: VoicemailTemplate) => {
    if (playingVmId === template.id) {
      if (audioInstance) {
        audioInstance.pause();
        audioInstance.currentTime = 0;
      }
      setPlayingVmId(null);
      setAudioInstance(null);
      return;
    }

    if (audioInstance) {
      audioInstance.pause();
    }

    const audio = new Audio(template.url);
    audio.play();
    setPlayingVmId(template.id);
    setAudioInstance(audio);

    audio.onended = () => {
      setPlayingVmId(null);
      setAudioInstance(null);
    };
  };

  // Voicemail Upload Submit
  const handleUploadVoicemail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vmFile) {
      toast.error('Please select an audio file to upload.');
      return;
    }

    setIsUploadingVm(true);
    const formData = new FormData();
    formData.append('file', vmFile);
    formData.append('name', vmName || vmFile.name);

    try {
      await api.post('/settings/voicemail-templates', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Voicemail template uploaded successfully.');
      setVmFile(null);
      setVmName('');
      queryClient.invalidateQueries({ queryKey: ['settings-voicemail-templates'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Voicemail upload failed.');
    } finally {
      setIsUploadingVm(false);
    }
  };

  // Delete Voicemail template
  const handleDeleteVoicemail = async (id: string) => {
    try {
      await api.delete(`/settings/voicemail-templates/${id}`);
      toast.success('Voicemail template deleted.');
      queryClient.invalidateQueries({ queryKey: ['settings-voicemail-templates'] });
    } catch (err) {
      toast.error('Failed to delete template.');
    }
  };

  // Invite Team Stub
  const handleInviteAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    // STUB: Simulate email invite sending
    const stubLink = `${window.location.origin}/register?invite=${inviteEmail.replace('@', '_at_')}&role=${inviteRole}`;
    setGeneratedInviteLink(stubLink);
    toast.success(`Invite compiled! Standard email stubs require SENDGRID_API_KEY. Link generated below.`);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedInviteLink);
    toast.success('Invite registration link copied to clipboard.');
  };

  // CRM Connect action stub
  const handleConnectCRM = (crmName: string) => {
    toast.info(`API Key Integration: Configure "${crmName.toUpperCase()}_API_KEY" in the backend .env configuration.`, {
      description: 'Once defined, the connection status updates to Connected automatically.',
      duration: 5000,
    });
  };

  const sidebarItems = [
    { id: 'profile', name: 'Company Profile', icon: Building },
    { id: 'caller-ids', name: 'Caller ID Pool', icon: PhoneCall },
    { id: 'voicemail', name: 'Voicemail Templates', icon: Volume2 },
    { id: 'team', name: 'Team Roster', icon: Users },
    { id: 'crm', name: 'CRM Integrations', icon: Database },
  ] as const;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-10rem)] gap-4 min-h-0 overflow-hidden">
      
      {/* 1. Settings Internal Sidebar */}
      <aside className="w-full lg:w-64 glass rounded-3xl border border-zinc-800/80 p-3 shrink-0 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all shrink-0 lg:shrink-1 ${
                isActive
                  ? 'bg-zinc-900 border border-zinc-800 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950/40'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
            </button>
          );
        })}
      </aside>

      {/* 2. Main Settings Panel viewport */}
      <main className="flex-1 glass rounded-3xl border border-zinc-800/80 p-6 overflow-y-auto min-h-0 bg-zinc-900/10">
        
        {/* SECTION 1: Company Profile settings */}
        {activeSection === 'profile' && (
          <div className="space-y-6 max-w-xl animate-in fade-in duration-200">
            <div>
              <h2 className="text-base font-bold text-zinc-150">Company Profile</h2>
              <p className="text-xs text-zinc-550 mt-0.5">Customize corporate branding parameters and office operational slots.</p>
            </div>

            {isLoadingCompany ? (
              <div className="flex items-center gap-2 text-xs text-zinc-550 py-8">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                Retrieving profiles...
              </div>
            ) : (
              <form onSubmit={handleCompanySubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Company Name</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full h-10 bg-zinc-950 border border-zinc-850 rounded-xl px-3 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-3 pt-3 border-t border-zinc-850/60">
                  <h3 className="text-xs font-bold text-zinc-300">Office Working Hours</h3>
                  <p className="text-[10px] text-zinc-550 leading-relaxed">Compliance regulations prevent campaigns from dialing outside standard local recipient times.</p>
                  
                  {bizHours && (
                    <div className="grid grid-cols-2 gap-4">
                      {Object.keys(bizHours.hours).map((day) => (
                        <div key={day} className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl text-[10.5px]">
                          <span className="font-bold uppercase text-zinc-400 tracking-wider shrink-0 w-16">{day}</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={bizHours.hours[day].from}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBizHours((prev: any) => ({
                                  ...prev,
                                  hours: { ...prev.hours, [day]: { ...prev.hours[day], from: val } }
                                }));
                              }}
                              className="w-12 h-6 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px]"
                            />
                            <span>to</span>
                            <input
                              type="text"
                              value={bizHours.hours[day].to}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBizHours((prev: any) => ({
                                  ...prev,
                                  hours: { ...prev.hours, [day]: { ...prev.hours[day], to: val } }
                                }));
                              }}
                              className="w-12 h-6 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={updateCompanyMutation.isPending}
                  className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  {updateCompanyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Configurations
                </button>
              </form>
            )}
          </div>
        )}

        {/* SECTION 2: Caller ID Pool */}
        {activeSection === 'caller-ids' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-base font-bold text-zinc-150">Local Presence Caller ID Pool</h2>
              <p className="text-xs text-zinc-550 mt-0.5">Manage caller numbers mapped automatically to recipient area codes.</p>
            </div>

            <form onSubmit={handleAddCallerId} className="flex flex-wrap items-end gap-3 p-4 bg-zinc-950/60 border border-zinc-850 rounded-2xl max-w-xl">
              <div className="space-y-1 flex-1 min-w-[150px]">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Add Phone (E.164)</label>
                <input
                  type="tel"
                  required
                  placeholder="+13105550199"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1 w-24">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Area Code</label>
                <input
                  type="text"
                  placeholder="310"
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1 w-28">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">US State</label>
                <input
                  type="text"
                  placeholder="CA"
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={addCallerIdMutation.isPending}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shrink-0"
              >
                {addCallerIdMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Number
              </button>
            </form>

            {/* List Caller ID Pool */}
            <div className="max-w-2xl border border-zinc-850 rounded-2xl bg-zinc-950/20 overflow-hidden mt-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/70">
                    <th className="py-3 px-4">Caller ID Number</th>
                    <th className="py-3 px-4 text-center">Area Code</th>
                    <th className="py-3 px-4 text-center">State</th>
                    <th className="py-3 px-4 text-center">Active status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/60 font-medium">
                  {isLoadingCallerIds ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-550">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-500" />
                      </td>
                    </tr>
                  ) : callerIds.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-650">No Caller IDs registered in pool.</td>
                    </tr>
                  ) : (
                    callerIds.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-900/20">
                        <td className="py-3 px-4 font-mono text-zinc-300">{c.phoneNumber}</td>
                        <td className="py-3 px-4 text-center text-zinc-400 font-mono">{c.areaCode}</td>
                        <td className="py-3 px-4 text-center text-zinc-450">{c.state}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => deleteCallerIdMutation.mutate(c.id)}
                            className="p-1.5 hover:bg-zinc-900 hover:text-red-400 rounded-lg text-zinc-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 3: Voicemail templates */}
        {activeSection === 'voicemail' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-base font-bold text-zinc-150">Voicemail Templates Drop</h2>
              <p className="text-xs text-zinc-550 mt-0.5">Configure audio greetings to play on lead answering machine detection.</p>
            </div>

            {/* Upload form */}
            <form onSubmit={handleUploadVoicemail} className="flex flex-wrap items-end gap-3 p-4 bg-zinc-950/60 border border-zinc-850 rounded-2xl max-w-xl">
              <div className="space-y-1 flex-1 min-w-[150px]">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Template Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cash Offer Pitch Drop"
                  value={vmName}
                  onChange={(e) => setVmName(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1 w-48">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Audio File (mp3/wav)</label>
                <input
                  type="file"
                  accept=".mp3,.wav"
                  required
                  onChange={(e) => setVmFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-zinc-500 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-zinc-900 file:text-zinc-350 cursor-pointer file:cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isUploadingVm}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shrink-0"
              >
                {isUploadingVm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Upload
              </button>
            </form>

            {/* List templates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-w-2xl mt-4">
              {isLoadingVoicemail ? (
                <div className="col-span-2 text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-500" />
                </div>
              ) : voicemailTemplates.length === 0 ? (
                <div className="col-span-2 text-center py-6 text-zinc-600 text-xs">No custom voicemails.</div>
              ) : (
                voicemailTemplates.map((template) => (
                  <div key={template.id} className="p-3 bg-zinc-950 border border-zinc-850 rounded-2xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-200 truncate">{template.name}</p>
                      <p className="text-[9px] text-zinc-500 font-mono mt-0.5">Duration: {template.duration}s</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlayVm(template)}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-blue-400 hover:text-blue-300 rounded-lg border border-zinc-800"
                      >
                        {playingVmId === template.id ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                      </button>
                      <button
                        type="button"
                        disabled={template.isDefault}
                        onClick={() => handleDeleteVoicemail(template.id)}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-650 hover:text-red-400 disabled:opacity-30 rounded-lg border border-zinc-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SECTION 4: Team Management */}
        {activeSection === 'team' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-base font-bold text-zinc-150">Team Invitations</h2>
              <p className="text-xs text-zinc-550 mt-0.5">Invite new company dialing agents. stubs out SMTP emails.</p>
            </div>

            <form onSubmit={handleInviteAgent} className="flex flex-wrap items-end gap-3 p-4 bg-zinc-950/60 border border-zinc-850 rounded-2xl max-w-xl">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="agent@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <div className="space-y-1 w-28">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Select Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 text-zinc-350 rounded px-2.5 text-xs"
                >
                  <option value="agent">Agent</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <button
                type="submit"
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
              >
                <Mail className="h-3.5 w-3.5" />
                Invite Agent
              </button>
            </form>

            {generatedInviteLink && (
              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl max-w-xl space-y-3.5 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    <Link2 className="h-4 w-4" />
                    Copy Registration Link
                  </h4>
                  <p className="text-[10.5px] text-zinc-500 leading-normal">
                    Email invite delivery requires SENDGRID_API_KEY. Use the link below for registration:
                  </p>
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    readOnly
                    value={generatedInviteLink}
                    className="w-full bg-zinc-950 border border-zinc-850 text-[10px] font-mono text-zinc-300 p-2 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-300"
                    title="Copy Link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 5: CRM Integrations */}
        {activeSection === 'crm' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-base font-bold text-zinc-150">CRM Integrations</h2>
              <p className="text-xs text-zinc-550 mt-0.5">Synchronize dialing outcomes and CRM contacts records in real-time.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              {isLoadingCRM ? (
                <div className="col-span-2 text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-500" />
                </div>
              ) : (
                integrations.map((crm) => (
                  <div key={crm.name} className="p-4 bg-zinc-950/60 border border-zinc-850 rounded-2xl flex flex-col justify-between space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-zinc-200">{crm.name}</h3>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mt-1 leading-none">
                          Key stub: {crm.keyStub}
                        </p>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                        crm.connected
                          ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                          : 'text-zinc-550 bg-zinc-900 border border-zinc-800'
                      }`}>
                        {crm.connected ? 'Connected' : 'Not Connected'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleConnectCRM(crm.name)}
                        className={`w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${
                          crm.connected
                            ? 'bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-zinc-350'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {crm.connected ? 'Field Mappings' : 'Configure Integration'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
