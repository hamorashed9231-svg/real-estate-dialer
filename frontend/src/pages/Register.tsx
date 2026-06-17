import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Building, User, Lock, Mail, ArrowRight, ArrowLeft, Loader2, Phone } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const registerFormSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  companySize: z.string().min(1, 'Please select your organization size'),
  industry: z.string().default('Real Estate'),
  name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Confirm password is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

export default function Register() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const registerUser = useAuthStore((state) => state.register);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema) as any,
    defaultValues: {
      companyName: '',
      companySize: '6-20',
      industry: 'Real Estate',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleNextStep = async () => {
    // Validate only Step 1 inputs before moving forward
    const isStep1Valid = await trigger(['companyName', 'companySize', 'industry']);
    if (isStep1Valid) {
      setStep(2);
    }
  };

  const onSubmit = async (data: RegisterFormValues) => {
    setLoading(true);
    try {
      await registerUser({
        name: data.name,
        email: data.email,
        password: data.password,
        companyName: data.companyName,
      });

      toast.success('Organization registered successfully! Welcome aboard.');
      navigate('/onboarding');
    } catch (error: any) {
      console.error('[REGISTER SUBMIT ERROR]', error);
      const message = error.response?.data?.error?.message || 'Failed to onboard company.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-zinc-950 text-white">
      {/* Left side: Taglines and Grid */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-900 via-slate-950 to-zinc-950 p-16 flex-col justify-between relative overflow-hidden border-r border-zinc-800">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Phone className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            PropDial
          </span>
        </div>

        <div className="space-y-6 relative z-10">
          <h2 className="text-4xl font-extrabold leading-tight text-white">
            Ready to scale your <br />
            <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
              outbound call centers?
            </span>
          </h2>
          <p className="text-zinc-400 text-base max-w-sm">
            Set up tenant isolation, invite your agents, import lists, and start calling under strict TCPA time zone and DNC protection in minutes.
          </p>
        </div>

        <div className="text-sm text-zinc-500 relative z-10 border-t border-zinc-800/80 pt-8">
          © {new Date().getFullYear()} PropDial Inc. All rights reserved.
        </div>
      </div>

      {/* Right side: Register Wizard Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-16">
        <div className="w-full max-w-md space-y-8 glass p-10 rounded-2xl shadow-xl">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-extrabold tracking-tight">Onboard Company</h2>
              <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md">
                Step {step} of 2
              </span>
            </div>
            <p className="text-zinc-400 text-sm">
              {step === 1
                ? 'Introduce your organization/real estate group.'
                : 'Set up your master administrator user details.'}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {step === 1 ? (
              /* STEP 1: COMPANY METADATA */
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Company Name
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Apex Realty Group LLC"
                      className="w-full pl-10 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      {...register('companyName')}
                    />
                  </div>
                  {errors.companyName && (
                    <p className="text-xs text-red-500 mt-1">{errors.companyName.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Organization Size
                  </label>
                  <select
                    className="w-full px-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    {...register('companySize')}
                  >
                    <option value="1-5">1-5 agents</option>
                    <option value="6-20">6-20 agents</option>
                    <option value="21-50">21-50 agents</option>
                    <option value="50+">50+ agents</option>
                  </select>
                  {errors.companySize && (
                    <p className="text-xs text-red-500 mt-1">{errors.companySize.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Industry Type
                  </label>
                  <input
                    type="text"
                    disabled
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-500 sm:text-sm cursor-not-allowed"
                    {...register('industry')}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-semibold rounded-lg shadow-md flex items-center justify-center gap-2 text-sm mt-6"
                >
                  Configure Account
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* STEP 2: ADMINISTRATOR USER CREDENTIALS */
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Administrator Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="John Doe"
                      className="w-full pl-10 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      {...register('name')}
                    />
                  </div>
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Admin Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="email"
                      placeholder="admin@apexrealty.com"
                      className="w-full pl-10 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      {...register('password')}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      {...register('confirmPassword')}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-1/3 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors text-zinc-400 hover:text-white font-semibold rounded-lg flex items-center justify-center gap-2 text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-semibold rounded-lg shadow-md flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      'Create Tenant'
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          <div className="text-center text-xs text-zinc-500 mt-4">
            Already registered?{' '}
            <Link to="/login" className="text-blue-500 hover:underline font-semibold">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
