import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

// Pages
import Login from '../pages/Login';
import Register from '../pages/Register';
import Onboarding from '../pages/Onboarding';
import Dashboard from '../pages/Dashboard';
import Dialer from '../pages/Dialer';
import Leads from '../pages/Leads';
import Campaigns from '../pages/Campaigns';
import Reports from '../pages/Reports';
import Settings from '../pages/Settings';
import Unauthorized from '../pages/Unauthorized';

// Layouts & Guards
import AppLayout from '../components/layout/AppLayout';
import ProtectedRoute from '../components/layout/ProtectedRoute';

/**
 * Root redirection helper to forward authenticated users to their home dashboard/workspace.
 */
function RootRedirect() {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'admin' || user?.role === 'manager') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/dialer" replace />;
}

export const router = createBrowserRouter([
  // Public Routes
  {
    path: '/',
    element: <RootRedirect />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },

  // Protected Onboarding Wizard
  {
    element: <ProtectedRoute allowedRoles={['admin']} />,
    children: [
      {
        path: '/onboarding',
        element: <Onboarding />,
      },
    ],
  },

  // Protected Core Application (Wrapped in App Sidebar Layout)
  {
    element: <ProtectedRoute allowedRoles={['admin', 'manager', 'agent']} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Common Views
          {
            path: '/dialer',
            element: <Dialer />,
          },
          {
            path: '/leads',
            element: <Leads />,
          },

          // Admin/Manager Views
          {
            element: <ProtectedRoute allowedRoles={['admin', 'manager']} />,
            children: [
              {
                path: '/dashboard',
                element: <Dashboard />,
              },
              {
                path: '/campaigns',
                element: <Campaigns />,
              },
              {
                path: '/reports',
                element: <Reports />,
              },
            ],
          },

          // Admin Only Views
          {
            element: <ProtectedRoute allowedRoles={['admin']} />,
            children: [
              {
                path: '/settings',
                element: <Settings />,
              },
            ],
          },
        ],
      },
    ],
  },

  // Fallback Wildcard
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
