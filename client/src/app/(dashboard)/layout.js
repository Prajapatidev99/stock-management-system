'use client';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LayoutProvider, useLayout } from '@/context/LayoutContext';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function ProtectedLayoutContent({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const { collapsed, toggleCollapse, mobileOpen, closeMobileMenu } = useLayout();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={`layout ${collapsed ? 'sidebar-is-collapsed' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        toggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        closeMobile={closeMobileMenu}
      />
      <div className="main-area">
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  return (
    <AuthProvider>
      <LayoutProvider>
        <ProtectedLayoutContent>{children}</ProtectedLayoutContent>
      </LayoutProvider>
    </AuthProvider>
  );
}
