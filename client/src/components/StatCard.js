'use client';

export default function StatCard({ label, value, icon, iconBg, iconColor, sub, valueClass }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: iconBg || 'var(--gray-100)' }}>
        <span style={{ color: iconColor || 'var(--gray-600)' }}>{icon}</span>
      </div>
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value ${valueClass || ''}`}>{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}
