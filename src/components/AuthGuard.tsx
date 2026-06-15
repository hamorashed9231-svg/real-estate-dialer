'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthGuardProps {
  onAuthenticated: (config: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    sessionToken: string;
    userId: string;
    companyId: string;
    userEmail: string;
    fullName: string;
    supabaseClient?: any;
  }) => void;
  children: React.ReactNode;
}

export function AuthGuard({ onAuthenticated, children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSignUp, setIsSignUp] = useState<boolean>(false);

  // Sign In Form States
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // Sign Up Form States
  const [companyName, setCompanyName] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [signUpEmail, setSignUpEmail] = useState<string>('');
  const [signUpPassword, setSignUpPassword] = useState<string>('');

  // Configuration States (loaded from environment or user input)
  const [supabaseUrl, setSupabaseUrl] = useState<string>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  );
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store onAuthenticated in a ref to avoid infinite re-render loops when parent recreation-sensitive callbacks change
  const onAuthenticatedRef = useRef(onAuthenticated);
  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  // Use the singleton client instance to avoid recreating it
  const client = supabase;

  // =====================================================================
  // AUTH STATE LISTENER & SILENT SESSION RENEWAL (HIGH-03)
  // =====================================================================
  useEffect(() => {
    if (!client) return;

    // Subscribe to auth state updates (e.g. initial sign-in, token refreshed)
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, sessionData) => {
      console.log(`[AUTH STATE CHANGE EVENT] Event: ${event}`);

      if (sessionData && sessionData.user) {
        try {
          // Fetch the user's company profile with a 6-second timeout race
          const profilePromise = client
            .from('profiles')
            .select('company_id, full_name')
            .eq('id', sessionData.user.id)
            .single();

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch request timed out. Please check your network connection or adblocker.')), 6000)
          );

          const { data: profile, error: profileError } = await Promise.race([
            profilePromise,
            timeoutPromise
          ]) as any;

          if (profileError || !profile) {
            setError('User profile not associated with a valid tenant company.');
            setIsAuthenticated(false);
            setLoading(false);
            await client.auth.signOut();
            return;
          }

          // Propagate refreshed credentials to active dialer hook
          onAuthenticatedRef.current({
            supabaseUrl,
            supabaseAnonKey,
            sessionToken: sessionData.access_token,
            userId: sessionData.user.id,
            companyId: profile.company_id,
            userEmail: sessionData.user.email || '',
            fullName: profile.full_name || 'Agent',
            supabaseClient: client,
          });

          setIsAuthenticated(true);
        } catch (err: any) {
          setError(err.message || 'An error occurred while loading profile.');
          setIsAuthenticated(false);
          await client.auth.signOut();
        } finally {
          setLoading(false);
        }
      } else {
        setIsAuthenticated(false);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, supabaseUrl, supabaseAnonKey]);

  // Handle Sign In submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!client || !email || !password) {
      setError('Please fill in all configuration and credential fields.');
      setLoading(false);
      return;
    }

    try {
      // Sign-in request with a 6-second timeout race
      const loginPromise = client.auth.signInWithPassword({
        email,
        password,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign-in request timed out. Please check your network connection or adblocker.')), 6000)
      );

      const { data, error: authError } = await Promise.race([
        loginPromise,
        timeoutPromise
      ]) as any;

      if (authError || !data.user || !data.session) {
        throw new Error(authError?.message || 'Authentication failed.');
      }
      
      // onAuthStateChange handles session state propagation automatically
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Handle Secure Onboarding Sign Up submission (Calls backend API with compensating rollback)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!companyName || !fullName || !signUpEmail || !signUpPassword) {
      setError('All signup fields are required.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName,
          email: signUpEmail,
          password: signUpPassword,
          fullName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Onboarding failed.');
      }

      setSuccessMessage('Tenant company and administrator profile created successfully! Please sign in.');
      setIsSignUp(false);
      setEmail(signUpEmail);
      setPassword('');
      
      // Clear signup fields
      setCompanyName('');
      setFullName('');
      setSignUpEmail('');
      setSignUpPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl">
        <div>
          <div className="flex justify-center">
            <span className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-2xl tracking-tight shadow-lg shadow-blue-600/10">
              D
            </span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            {isSignUp ? 'Create Tenant Company' : 'DialerPro Agent Portal'}
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-400">
            {isSignUp
              ? 'Onboard your organization and set up admin profile'
              : 'Sign in to access your multi-tenant calling queue'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-lg text-sm text-center">
            {successMessage}
          </div>
        )}



        {isSignUp ? (
          /* Sign Up Form */
          <form className="space-y-4" onSubmit={handleSignUp}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Company Name
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full px-3 py-2 border border-zinc-800 bg-zinc-950 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="Apex Realty LLC"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Administrator Full Name
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full px-3 py-2 border border-zinc-800 bg-zinc-950 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Admin Email
              </label>
              <input
                type="email"
                required
                className="mt-1 block w-full px-3 py-2 border border-zinc-800 bg-zinc-950 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="admin@apexrealty.com"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Admin Password
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-zinc-800 bg-zinc-950 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="••••••••"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Creating Tenant...' : 'Onboard Company'}
              </button>
            </div>

            <div className="text-center mt-4 text-xs">
              <span className="text-zinc-500">Already registered? </span>
              <button
                type="button"
                className="text-blue-500 font-semibold hover:underline"
                onClick={() => setIsSignUp(false)}
              >
                Sign In instead
              </button>
            </div>
          </form>
        ) : (
          /* Sign In Form */
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Agent Email
              </label>
              <input
                type="email"
                required
                className="mt-1 block w-full px-3 py-2 border border-zinc-800 bg-zinc-950 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="agent@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Password
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full px-3 py-2 border border-zinc-800 bg-zinc-950 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>

            <div className="text-center mt-4 text-xs">
              <span className="text-zinc-500">Need a new organization? </span>
              <button
                type="button"
                className="text-blue-500 font-semibold hover:underline"
                onClick={() => setIsSignUp(true)}
              >
                Onboard Company
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
