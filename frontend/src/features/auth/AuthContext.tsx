import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User } from '@/types';
import { api } from '@/services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const generation = useRef(0);
  const resetIdentity = useCallback(() => {
    generation.current += 1;
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);
  const [user, setUser] = useState<User | null>(() => api.getStoredUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(async () => {
    resetIdentity();
    setUser(null);
    try {
      if (api.getToken()) {
        await api.logout();
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      api.clearSession();
      setUser(null);
    }
  }, [resetIdentity]);

  const refreshProfile = useCallback(async () => {
    if (!api.getToken()) {
      resetIdentity();
      setUser(null);
      setIsLoading(false);
      return;
    }

    const version = generation.current;
    try {
      const res = await api.getMe();
      if (version !== generation.current) return;
      if (res.success && res.data) {
        setUser(res.data);
        api.setStoredUser(res.data);
      } else {
        await logout();
      }
    } catch (err) {
      if (version !== generation.current) return;
      // Hanya logout pada 401/403 — jangan logout pada error jaringan/500
      if (err instanceof Error && 'status' in err) {
        const status = (err as { status: number }).status;
        if (status === 401 || status === 403) {
          await logout();
        }
      }
      // Simpan user lama untuk memungkinkan retry
    } finally {
      setIsLoading(false);
    }
  }, [logout, resetIdentity]);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      resetIdentity();
      api.clearSession();
      setUser(null);
    });
    refreshProfile();
    return () => api.setUnauthorizedHandler(() => {});
  }, [refreshProfile, resetIdentity]);

  const login = async (username: string, password: string) => {
    // Jangan set global isLoading — biarkan komponen handle loading lokal
    resetIdentity();
    const res = await api.login(username, password);
    if (res.success && res.data.user) {
      resetIdentity();
      setUser(res.data.user);
    }
    // Jika gagal, error dilempar dan ditangkap caller
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};