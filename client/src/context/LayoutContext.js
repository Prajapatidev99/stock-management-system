'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const LayoutContext = createContext({
  collapsed: false,
  toggleCollapse: () => {},
  mobileOpen: false,
  openMobileMenu: () => {},
  closeMobileMenu: () => {},
});

export function LayoutProvider({ children }) {
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <LayoutContext.Provider
      value={{
        collapsed,
        toggleCollapse,
        mobileOpen,
        openMobileMenu: () => setMobileOpen(true),
        closeMobileMenu: () => setMobileOpen(false),
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
