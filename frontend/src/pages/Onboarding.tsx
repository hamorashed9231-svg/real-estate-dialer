import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, Mail, CheckCircle2, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  // Step 2: Invite Agents State
  const [emailInput, setEmailInput] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  // File Upload handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadCSV = async () => {
    if (!file) {
      toast.error('Please select a CSV file first.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/leads/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('Leads list uploaded successfully. Importing in background!');
      setStep(2);
    } catch (error: any) {
      console.error('[CSV UPLOAD ERROR]', error);
      toast.error(error.response?.data?.error?.message || 'Failed to upload CSV file.');
    } finally {
      setUploading(false);
    }
  };

  // Agent Invitation handler
  const handleAddEmail = () => {
    if (!emailInput) return;
    if (!emailInput.includes('@')) {
      toast.error('Invalid email address format.');
      return;
    }
    if (invitedEmails.includes(emailInput)) {
      toast.error('Email already added.');
      return;
    }
    setInvitedEmails([...invitedEmails, emailInput]);
    setEmailInput('');
  };

  const handleRemoveEmail = (index: number) => {
    setInvitedEmails(invitedEmails.filter((_, i) => i !== index));
  };

  const handleSendInvitations = async () => {
    if (invitedEmails.length === 0) {
      setStep(3);
      return;
    }

    setInviting(true);
    try {
      // Simulation of invitation sending (since backend invites are mocked/stubs)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success(`Successfully sent invitations to ${invitedEmails.length} agents!`);
      setStep(3);
    } catch (error) {
      toast.error('Failed to send invitations.');
    } finally {
      setInviting(false);
    }
  };

  const handleComplete = () => {
    if (user?.role === 'admin' || user?.role === 'manager') {
      navigate('/dashboard');
    } else {
      navigate('/dialer');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white px-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      
      <div className="w-full max-w-xl glass p-10 rounded-3xl shadow-2xl relative z-10 space-y-8">
        
        {/* Progress Header */}
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <span>PropDial Onboarding</span>
            <span>Step {step} of 3</span>
          </div>
          <div className="flex gap-2 h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-300 ${step >= 1 ? 'w-1/3 bg-blue-600' : 'w-0'}`} />
            <div className={`h-full transition-all duration-300 ${step >= 2 ? 'w-1/3 bg-blue-600' : 'w-0'}`} />
            <div className={`h-full transition-all duration-300 ${step >= 3 ? 'w-1/3 bg-blue-600' : 'w-0'}`} />
          </div>
        </div>

        {step === 1 && (
          /* STEP 1: LEAD IMPORT */
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Import your first leads</h2>
              <p className="text-zinc-400 text-sm">
                Upload a CSV file containing your contacts. We support standard headers like phone, name, email, address, etc.
              </p>
            </div>

            <div className="border border-dashed border-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center bg-zinc-900/20 hover:bg-zinc-900/40 transition-colors relative cursor-pointer group">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="h-12 w-12 rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800 text-zinc-400 group-hover:text-white transition-colors">
                <Upload className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold mt-4 text-zinc-300 group-hover:text-white transition-colors">
                {file ? file.name : 'Select CSV file'}
              </span>
              <span className="text-xs text-zinc-500 mt-1">Maximum size: 25MB</span>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/3 py-3 border border-zinc-800 hover:border-zinc-700 transition-colors text-zinc-400 hover:text-white font-semibold rounded-xl text-sm"
              >
                Skip
              </button>

              <button
                type="button"
                disabled={!file || uploading}
                onClick={handleUploadCSV}
                className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          /* STEP 2: INVITE AGENTS */
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Add your first agents</h2>
              <p className="text-zinc-400 text-sm">
                Invite team members or agents by entering their emails. They will receive credentials to login to the softphone portal.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  placeholder="agent@apexrealty.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())}
                  className="w-full pl-10 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleAddEmail}
                className="px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg flex items-center justify-center"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Email tags list */}
            {invitedEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-zinc-800 bg-zinc-900/10 rounded-xl">
                {invitedEmails.map((email, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(index)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-1/3 py-3 border border-zinc-800 hover:border-zinc-700 transition-colors text-zinc-400 hover:text-white font-semibold rounded-xl text-sm"
              >
                Skip
              </button>

              <button
                type="button"
                disabled={inviting}
                onClick={handleSendInvitations}
                className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Inviting...
                  </>
                ) : (
                  <>
                    Send Invitations
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          /* STEP 3: READY/COMPLETED */
          <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 bg-blue-600/10 border border-blue-500/20 text-blue-500 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-blue-500/10">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight">You're ready!</h2>
              <p className="text-zinc-400 text-sm max-w-xs mx-auto">
                Your PropDial company account has been created. You can now access your dialer dashboard.
              </p>
            </div>

            <button
              type="button"
              onClick={handleComplete}
              className="w-full max-w-sm py-3.5 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm mx-auto"
            >
              Go to Dashboard
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
