import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { router } from './router';
import './index.css';

// Initialize React Query Client for backend caching and mutations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevents aggressive background refreshes
      retry: 1, // Only retry failed requests once
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster 
        theme="dark" 
        position="top-right" 
        closeButton 
        richColors 
        toastOptions={{
          style: {
            background: '#18181c',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#fff',
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
