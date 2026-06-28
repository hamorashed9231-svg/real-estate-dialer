/// <reference types="vite/client" />
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string) || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send httpOnly cookies for refresh token rotation
});

let isRefreshing = false;
let failedQueue: any[] = [];

/**
 * Resolves or rejects queued requests waiting for a fresh access token.
 */
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Attach bearer accessToken to outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Seamless access token renewal on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token expired (401) and prevent infinite retry loops
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue concurrent requests while token is refreshing
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Post directly to auth/refresh (withCredentials handles cookie verification)
        const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const { accessToken } = response.data.data;

        // Save fresh access token in Zustand store
        useAuthStore.getState().setAccessToken(accessToken);

        // Update original request authorization header
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Process queue of pending requests
        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshError: any) {
        // Refresh token is expired, invalid, or reused. Trigger logout.
        processQueue(refreshError, null);
        await useAuthStore.getState().logout();
        
        // Redirect to login (avoiding routing library to force fresh window context)
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.data && typeof error.response.data.error === 'string') {
      const errorMsg = error.response.data.error;
      const errorCode = error.response.data.code;
      error.response.data.error = {
        message: errorMsg,
        code: errorCode
      };
    }

    return Promise.reject(error);
  }
);

export default api;
