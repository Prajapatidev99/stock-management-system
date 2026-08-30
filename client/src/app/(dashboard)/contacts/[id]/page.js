'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import TopNav from '@/components/TopNav';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { format } from 'date-fns';
import { generateContactPDF } from '@/lib/pdfGenerator';
import { fmt } from '@/lib/utils';

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id;

  const [loading, setLoading]         = useState(true);
  const [profile, setProfile]         = useState(null);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [activeTab, setActiveTab]     = useState('products'); // 'products', 'history', or 'payments'
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Logs State
  const [paymentLogs, setPaymentLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Pay Balance Modal State
  const [payModalOpen, setPayModalOpen]   = useState(false);
  const [payAmount, setPayAmount]         = useState('');
  const [payMode, setPayMode]             = useState('cash'); // 'cash' or 'online'
  const [payNotes, setPayNotes]           = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/contacts/${contactId}/profile`);
      setProfile(res.data);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError(err.response?.data?.message || 'Failed to load contact profile');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  const fetchPaymentLogs = useCallback(async () => {
    if (!contactId) return;
    setLogsLoading(true);
    try {
      const res = await api.get(`/transactions/payment-logs?contact_id=${contactId}`);
      setPaymentLogs(res.data);
    } catch {
      setPaymentLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchProfile();
    fetchPaymentLogs();
  }, [fetchProfile, fetchPaymentLogs]);

  if (loading) {
    return (
      <>
        <TopNav title="Contact Profile" subtitle="Loading details…" />
        <div className="page-content">
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto', width: 32, height: 32 }} />
            <p style={{ marginTop: 16, color: 'var(--gray-500)' }}>Fetching contact details & transaction ledger…</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <TopNav title="Contact Profile" subtitle="Error" />
        <div className="page-content">
          <div className="alert alert-error" style={{ marginBottom: 20 }}>{error || 'Contact not found'}</div>
          <Link href="/contacts" className="btn btn-secondary">← Back to Contacts</Link>
        </div>
      </>
    );
  }

  const { contact, stats, productsBreakdown, transactions } = profile;
  const isWholesaler = contact.type === 'wholesaler';

  const handleDownloadPDF = () => {
    generateContactPDF(contact, stats, transactions);
  };

  const handleOpenPayModal = () => {
    setPayAmount(String(stats.remainingBalance || ''));
    setPayNotes('');
    setPayModalOpen(true);
  };

  const handlePayBalanceSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive payment amount');
      return;
    }

    setPaySubmitting(true);
    try {
      const res = await api.post('/transactions/pay-balance', {
        contact_id: contact._id,
        amount: amt,
        payment_mode: payMode,
        notes: payNotes,
      });

      setSuccess(`✓ Payment Recorded! ${res.data.message}`);
      setPayModalOpen(false);
      fetchProfile();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record balance payment');
    } finally {
      setPaySubmitting(false);
    }
  };

  // Filter products or transactions
  const filteredProducts = productsBreakdown.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTx = transactions.filter(tx =>
    (tx.product_id?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (tx.notes || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <TopNav
        title={contact.name}
        subtitle={`Full profile, ledger statement & payment details for ${contact.name}`}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {stats.remainingBalance > 0 && (
              <button className="btn btn-primary" onClick={handleOpenPayModal} style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>
                💳 Pay / Settle Due Balance
              </button>
            )}
            <button className="btn btn-secondary" onClick={handleDownloadPDF}>
              📄 Download PDF Statement
            </button>
            <Link href="/contacts" className="btn btn-secondary">
              ← Back to Contacts
            </Link>
          </div>
        }
      />

      <div className="page-content">

        {success && <div className="alert alert-success" style={{ marginBottom: 20 }}>{success}</div>}

        {/* ── Contact Header Card ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: isWholesaler ? '#eff6ff' : '#f0fdf4',
                color: isWholesaler ? '#2563eb' : '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 22
              }}>
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--gray-900)' }}>{contact.name}</h1>
                  <span className={`badge badge-${contact.type}`}>
                    {contact.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 6, fontSize: 13, color: 'var(--gray-600)', flexWrap: 'wrap' }}>
                  <span>📞 Phone: <strong>{contact.phone || 'N/A'}</strong></span>
                  <span>📍 Address: <strong>{contact.address || 'N/A'}</strong></span>
                  <span>📅 Created: <strong>{format(new Date(contact.createdAt), 'dd MMM yyyy')}</strong></span>
                </div>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              {stats.remainingBalance > 0 && (
                <button className="btn btn-primary" onClick={handleOpenPayModal} style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>
                  💳 Pay / Settle Due Balance
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleDownloadPDF}>
                📄 Export PDF Profile
              </button>
            </div>
          </div>
        </div>

        {/* ── Metric Highlights & Payment Balances ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', textTransform: 'uppercase' }}>
              {isWholesaler ? 'Net Purchases (Minus Returns)' : 'Net Sales (Minus Returns)'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--gray-900)' }}>
              {fmt(stats.totalAmount)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
              Gross: {fmt(stats.grossAmount || stats.totalAmount)} {stats.returnAmount > 0 && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>(-{fmt(stats.returnAmount)} returned)</span>}
            </div>
          </div>

          <div className="card" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#274e13', textTransform: 'uppercase' }}>💵 Cash Payments Paid</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: '#389e0d' }}>
              {fmt(stats.cashPaid)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>Received / Paid in Cash</div>
          </div>

          <div className="card" style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0050b3', textTransform: 'uppercase' }}>📱 Online / Bank Paid</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: '#0958d9' }}>
              {fmt(stats.onlinePaid)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>UPI & Bank Transfers</div>
          </div>

          <div className="card" style={{ background: stats.remainingBalance > 0 ? '#fff1f0' : 'var(--gray-50)', borderColor: stats.remainingBalance > 0 ? '#ffa39e' : 'var(--gray-200)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: stats.remainingBalance > 0 ? 'var(--danger)' : 'var(--gray-600)', textTransform: 'uppercase' }}>
              ⏳ Pending / Due Balance
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: stats.remainingBalance > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {fmt(stats.remainingBalance)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
              {stats.remainingBalance > 0 ? (
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}
                  onClick={handleOpenPayModal}
                >
                  Pay now ➔
                </button>
              ) : 'Fully settled balance ✓'}
            </div>
          </div>
        </div>

        {/* ── Tabs & Search Bar ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', gap: 6 }}>
            <button
              className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
              style={{ padding: '8px 16px', borderBottom: '2px solid', borderColor: activeTab === 'products' ? 'var(--gray-900)' : 'transparent', fontWeight: 600 }}
              onClick={() => setActiveTab('products')}
            >
              📦 Products Traded ({productsBreakdown.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              style={{ padding: '8px 16px', borderBottom: '2px solid', borderColor: activeTab === 'history' ? 'var(--gray-900)' : 'transparent', fontWeight: 600 }}
              onClick={() => setActiveTab('history')}
            >
              📑 Transaction History & Ledger ({transactions.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
              style={{ padding: '8px 16px', borderBottom: '2px solid', borderColor: activeTab === 'payments' ? 'var(--gray-900)' : 'transparent', fontWeight: 600 }}
              onClick={() => setActiveTab('payments')}
            >
              💳 Payment History Logs ({paymentLogs.length})
            </button>
          </div>

          <div style={{ minWidth: 240 }}>
            <input
              className="form-input"
              placeholder="Search products or notes…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* ── Tab 1: Products Summary ── */}
        {activeTab === 'products' && (
          <div className="table-wrap">
            {filteredProducts.length === 0 ? (
              <div className="empty-state">
                <h3>No products found</h3>
                <p>{isWholesaler ? 'No products purchased from this wholesaler yet.' : 'No products sold to this retailer yet.'}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Total Orders</th>
                    <th>Total Units</th>
                    <th style={{ textAlign: 'right' }}>Net Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p._id}>
                      <td className="td-bold">{p.name}</td>
                      <td>
                        <span style={{ background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: 'var(--gray-700)' }}>
                          {p.category}
                        </span>
                      </td>
                      <td>{p.ordersCount} orders</td>
                      <td style={{ fontWeight: 600 }}>{p.totalQuantity} units</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: isWholesaler ? 'var(--warning)' : 'var(--success)' }}>
                        {fmt(p.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab 2: Full Transaction Ledger ── */}
        {activeTab === 'history' && (
          <div className="table-wrap">
            {filteredTx.length === 0 ? (
              <div className="empty-state">
                <h3>No transactions recorded</h3>
                <p>Transaction records will appear here.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Price/Unit</th>
                    <th>Total Amount</th>
                    <th>Mode</th>
                    <th>Amount Paid</th>
                    <th>Pending Due</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map((tx) => (
                    <tr key={tx._id}>
                      <td style={{ color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{format(new Date(tx.date), 'dd MMM yyyy')}</td>
                      <td>
                        <span className={`badge ${tx.type.includes('return') ? 'badge-warning' : 'badge-success'}`}>
                          {tx.type === 'purchase' ? '📦 PURCHASE'
                            : tx.type === 'sale' ? '🛒 SALE'
                            : tx.type === 'purchase_return' ? '↩️ PUR RETURN'
                            : '↩️ SALE RETURN'}
                        </span>
                      </td>
                      <td className="td-bold">{tx.product_id?.name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{tx.quantity}</td>
                      <td>{fmt(tx.price)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(tx.total_amount)}</td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--gray-100)' }}>
                          {(tx.payment_mode || 'cash').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: 'var(--success)', fontWeight: 600 }}>{fmt(tx.amount_paid)}</td>
                      <td style={{ color: tx.remaining_balance > 0 ? 'var(--danger)' : 'var(--gray-500)', fontWeight: 600 }}>
                        {tx.remaining_balance > 0 ? fmt(tx.remaining_balance) : '✓ Paid'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab 3: Payment History Logs ── */}
        {activeTab === 'payments' && (
          <div className="table-wrap">
            {logsLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : paymentLogs.length === 0 ? (
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                </svg>
                <h3>No payment logs recorded yet</h3>
                <p>Payments recorded upfront or via balance settlement will appear here.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Amount Paid</th>
                    <th>Payment Mode</th>
                    <th>Notes / Description</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentLogs.map((log) => (
                    <tr key={log._id}>
                      <td style={{ color: 'var(--gray-600)' }}>
                        {format(new Date(log.date), 'dd MMM yyyy, hh:mm a')}
                      </td>
                      <td className="td-bold" style={{ color: 'var(--success)', fontSize: 14 }}>
                        {fmt(log.amount)}
                      </td>
                      <td>
                        <span className="badge badge-gray" style={{ textTransform: 'uppercase' }}>
                          {log.payment_mode || 'cash'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--gray-700)' }}>
                        {log.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* ── Modal for Paying Balance ── */}
      <Modal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={`Pay / Settle Balance for ${contact.name}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPayModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handlePayBalanceSubmit} disabled={paySubmitting}>
              {paySubmitting ? 'Recording Payment…' : 'Submit Balance Payment'}
            </button>
          </>
        }
      >
        <form onSubmit={handlePayBalanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13 }}>
            Total Remaining Balance Due: <strong style={{ color: 'var(--danger)', fontSize: 16 }}>{fmt(stats.remainingBalance)}</strong>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Payment Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={stats.remainingBalance}
              className="form-input"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Payment Mode *</label>
            <select
              className="form-select"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
            >
              <option value="cash">💵 Cash</option>
              <option value="online">📱 Online / UPI / Bank Transfer</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Payment Notes / Reference</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. UPI Ref #123456 or Receipt #001"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </>
  );
}
