'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Restore session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }

    // Verify session with server via httpOnly cookie (no token in JS).
    // 8s timeout prevents the spinner from hanging if the server is unreachable.
    api.get('/me', { timeout: 8000 })
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      })
      .catch(() => {
        // Cookie invalid/expired — clear stale user display data
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/login', { email, password });
    const { user: userData } = res.data;
    // Store only non-sensitive user display info (name, email, role) — NOT the token
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    router.push('/');
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.post('/logout'); // Server clears the httpOnly cookie
    } catch { /* ignore */ }
    localStorage.removeItem('user');
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
