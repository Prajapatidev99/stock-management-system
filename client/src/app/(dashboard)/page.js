'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import TopNav from '@/components/TopNav';
import StatCard from '@/components/StatCard';
import api from '@/lib/api';
import { format } from 'date-fns';

function fmt(n) {
  if (n >= 1_000_000) return '₹' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '₹' + (n / 1_000).toFixed(1) + 'K';
  return '₹' + Number(n).toFixed(2);
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildChartData(raw) {
  const map = {};
  raw.forEach(({ _id, total }) => {
    const key = `${MONTH_NAMES[_id.month - 1]} ${_id.year}`;
    if (!map[key]) map[key] = { month: key, purchase: 0, sale: 0 };
    if (_id.type === 'purchase') map[key].purchase += total;
    else if (_id.type === 'purchase_return') map[key].purchase -= total;
    else if (_id.type === 'sale') map[key].sale += total;
    else if (_id.type === 'sales_return') map[key].sale -= total;
  });
  return Object.values(map).map(item => ({
    ...item,
    purchase: Math.max(0, item.purchase),
    sale: Math.max(0, item.sale),
  }));
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sumRes, chartRes, txRes] = await Promise.all([
          api.get('/transactions/summary'),
          api.get('/transactions/chart?months=6'),
          api.get('/transactions?limit=5'),
        ]);
        setSummary(sumRes.data);
        setChartData(buildChartData(chartRes.data));
        setRecentTx(txRes.data.transactions || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <>
      <TopNav
        title="Dashboard"
        subtitle={`Overview as of ${format(new Date(), 'dd MMM yyyy')}`}
      />
      <div className="page-content">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div className="stat-cards">
              <StatCard
                label="Total Products"
                value={summary?.totalProducts ?? 0}
                iconBg="var(--gray-100)"
                iconColor="var(--gray-700)"
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
                sub="Active, non-deleted"
              />
              <StatCard
                label="Total Stock"
                value={(summary?.totalStock ?? 0).toLocaleString() + ' units'}
                iconBg="var(--info-light)"
                iconColor="var(--info)"
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                sub="Across all products"
              />
              <StatCard
                label="Total Purchases"
                value={fmt(summary?.totalPurchases ?? 0)}
                iconBg="var(--warning-light)"
                iconColor="var(--warning)"
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
                sub={`${summary?.purchaseCount ?? 0} transactions`}
              />
              <StatCard
                label="Total Sales"
                value={fmt(summary?.totalSales ?? 0)}
                iconBg="var(--success-light)"
                iconColor="var(--success)"
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
                sub={`${summary?.saleCount ?? 0} transactions`}
              />
              <StatCard
                label="Net Profit"
                value={fmt(summary?.profit ?? 0)}
                valueClass={(summary?.profit ?? 0) >= 0 ? 'stat-card-positive' : 'stat-card-negative'}
                iconBg={(summary?.profit ?? 0) >= 0 ? 'var(--success-light)' : 'var(--danger-light)'}
                iconColor={(summary?.profit ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'}
                icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
                sub="Sales − Purchases"
              />
            </div>

            {/* ── Low Stock Alert Banner ── */}
            {summary?.lowStockProducts?.length > 0 && (
              <div style={{
                background: '#fffbe6',
                border: '1px solid #ffe58f',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d46b08', fontWeight: 700, fontSize: 14 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Low Stock Alert ({summary.lowStockProducts.length} product(s) running low)
                  </div>
                  <a href="/purchases" className="btn btn-secondary btn-sm" style={{ background: 'white' }}>
                    + Record Purchase / Restock
                  </a>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {summary.lowStockProducts.map(p => (
                    <div key={p._id} style={{
                      background: 'white',
                      border: '1px solid #ffd591',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius)',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{p.name}</span>
                      <span className={`badge ${p.stock === 0 ? 'badge-danger' : 'badge-warning'}`}>
                        {p.stock === 0 ? 'Out of Stock' : `${p.stock} left`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Chart + Recent Transactions ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {/* Chart */}
              <div className="chart-card">
                <div className="chart-header">
                  <div>
                    <h3>Purchases vs Sales</h3>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>Last 6 months</p>
                  </div>
                </div>
                {chartData.length === 0 ? (
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <p>No transaction data yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} barSize={20} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--gray-500)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--gray-500)' }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'K' : v)} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow)' }}
                        formatter={(v, name) => [fmt(v), name === 'purchase' ? 'Purchases' : 'Sales']}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={v => v === 'purchase' ? 'Purchases' : 'Sales'}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="purchase" fill="#FCD34D" radius={[4,4,0,0]} />
                      <Bar dataKey="sale"     fill="#34D399" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Recent Transactions */}
              <div className="chart-card">
                <div className="chart-header" style={{ marginBottom: 12 }}>
                  <h3>Recent Transactions</h3>
                  <a href="/transactions" style={{ fontSize: 12, color: 'var(--info)', textDecoration: 'none' }}>View all →</a>
                </div>
                {recentTx.length === 0 ? (
                  <div className="empty-state" style={{ padding: '32px 0' }}>
                    <p>No transactions yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {recentTx.map((tx) => {
                      const isReturn = tx.type?.includes('return');
                      return (
                        <div key={tx._id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 4px', borderBottom: '1px solid var(--gray-100)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 'var(--radius)',
                              background: isReturn ? '#fffbe6' : (tx.type === 'purchase' ? 'var(--warning-light)' : 'var(--success-light)'),
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              {isReturn
                                ? <span style={{ fontSize: 14 }}>↩️</span>
                                : (tx.type === 'purchase'
                                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                                )
                              }
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-900)' }}>
                                {tx.product_id?.name || 'Unknown'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                                {tx.contact_id?.name} · {tx.quantity} units {isReturn ? `(${tx.type === 'purchase_return' ? 'Pur Return' : 'Sale Return'})` : ''}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{
                              fontSize: 13, fontWeight: 600,
                              color: isReturn ? 'var(--warning)' : (tx.type === 'purchase' ? 'var(--warning)' : 'var(--success)'),
                            }}>
                              {tx.type === 'purchase' ? '-' : tx.type === 'sale' ? '+' : '↩ '}{fmt(tx.total_amount)}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                              {format(new Date(tx.date), 'dd MMM')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
