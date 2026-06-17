import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, accessToken, refreshToken } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      // If access token is missing in-memory but persisted user claims suggest we were logged in,
      // trigger a silent refresh cycle.
      if (!accessToken && isAuthenticated) {
        try {
          await refreshToken();
        } catch (error) {
          console.error('[PROTECTED ROUTE] Refresh token renewal failed. Forcing logout.');
        } finally {
          setChecking(false);
        }
      } else {
        setChecking(false);
      }
    };

    verifySession();
  }, [accessToken, isAuthenticated, refreshToken]);

  // Loading spinner during auth validation
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-zinc-500 text-sm font-semibold tracking-wide">Validating session...</p>
        </div>
      </div>
    );
  }

  // Not authenticated? Redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but unauthorized? Redirect to unauthorized warning page
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Allowed? Render outlet layout
  return <Outlet />;
}
