import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white px-4">
      <div className="w-full max-w-md glass p-10 rounded-2xl shadow-xl text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center">
            <ShieldAlert className="h-7 w-7" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Access Forbidden</h2>
          <p className="text-zinc-400 text-sm">
            You do not have the required permissions or credentials to access this administrative resource page.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-sm font-semibold text-zinc-300 hover:text-white transition-colors w-full"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Safety
        </Link>
      </div>
    </div>
  );
}
