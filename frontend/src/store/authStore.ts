import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  companyId: string;
  companyName: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAccessToken: (token: string) => {
        set({ accessToken: token, isAuthenticated: !!token });
      },

      login: async (email, password) => {
        const response = await axios.post('/api/auth/login', { email, password });
        const { accessToken, user } = response.data.data;
        set({ accessToken, user, isAuthenticated: true });
      },

      register: async (data: RegisterData) => {
        const response = await axios.post('/api/auth/register', data);
        if (!response.data.success) {
          throw new Error(response.data.error?.message || 'Registration failed');
        }
      },

      logout: async () => {
        try {
          // Clear session on backend (deletes Redis token JTI)
          await axios.post('/api/auth/logout', {}, { withCredentials: true });
        } catch (error) {
          console.error('[AUTH STORE LOGOUT ERROR]', error);
        } finally {
          // Reset local authentication state
          set({ user: null, accessToken: null, isAuthenticated: false });
        }
      },

      refreshToken: async () => {
        try {
          const response = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
          const { accessToken } = response.data.data;
          set({ accessToken, isAuthenticated: true });
        } catch (error) {
          // Reset auth state on refresh failure (forces login)
          set({ user: null, accessToken: null, isAuthenticated: false });
          throw error;
        }
      },
    }),
    {
      name: 'propdial-auth-persist',
      // Persist ONLY the user metadata, not the access token (kept in-memory)
      partialize: (state) => ({ user: state.user }),
    }
  )
);
