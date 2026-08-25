'use client';
import { useLayout } from '@/context/LayoutContext';

export default function TopNav({ title, subtitle, actions, onMobileMenuClick }) {
  let openMenu = onMobileMenuClick;
  try {
    const layout = useLayout();
    if (!openMenu && layout?.openMobileMenu) {
      openMenu = layout.openMobileMenu;
    }
  } catch {
    // fallback if outside provider
  }

  return (
    <header className="topnav">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="mobile-menu-btn"
          onClick={openMenu}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-900)', marginBottom: subtitle ? 1 : 0 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 12, color: 'var(--gray-500)', margin: 0 }}>{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
        </div>
      )}
    </header>
  );
}
