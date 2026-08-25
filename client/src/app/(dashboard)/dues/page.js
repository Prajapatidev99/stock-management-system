'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TopNav from '@/components/TopNav';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { format } from 'date-fns';

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DuesPage() {
  const router = useRouter();
  const [data, setData]       = useState({ totalPayable: 0, totalReceivable: 0, wholesalers: [], retailers: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('receivable'); // 'receivable' (retailers owe you) or 'payable' (you owe wholesalers)

  // Payment modal state
  const [payContact, setPayContact] = useState(null);
  const [payAmount, setPayAmount]   = useState('');
  const [payMode, setPayMode]     = useState('cash');
  const [payNotes, setPayNotes]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError]   = useState('');
  const [paySuccess, setPaySuccess] = useState('');

  const fetchDues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/transactions/dues');
      setData(res.data);
    } catch {
      setData({ totalPayable: 0, totalReceivable: 0, wholesalers: [], retailers: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDues();
  }, [fetchDues]);

  const openPayModal = (item, e) => {
    e?.stopPropagation();
    setPayContact(item);
    setPayAmount(item.totalDue.toString());
    setPayMode('cash');
    setPayNotes('');
    setPayError('');
    setPaySuccess('');
  };

  const handlePayment = async () => {
    if (!payAmount || isNaN(parseFloat(payAmount)) || parseFloat(payAmount) <= 0) {
      setPayError('Please enter a valid payment amount');
      return;
    }

    setSubmitting(true);
    setPayError('');
    setPaySuccess('');

    try {
      const res = await api.post('/transactions/pay-balance', {
        contact_id: payContact.contact._id,
        amount: parseFloat(payAmount),
        payment_mode: payMode,
        notes: payNotes,
      });

      setPaySuccess(res.data.message || 'Payment recorded successfully!');
      setTimeout(() => {
        setPayContact(null);
        fetchDues();
      }, 1200);
    } catch (err) {
      setPayError(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const currentList = activeTab === 'receivable' ? data.retailers : data.wholesalers;

  return (
    <>
      <TopNav
        title="Dues & Balances"
        subtitle="Track outstanding receivables from retailers and payables to wholesalers"
      />

      <div className="page-content">
        {/* KPI Cards */}
        <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <div className="stat-card-label">Owed to You (Receivables)</div>
            <div className="stat-card-value money-positive">{fmt(data.totalReceivable)}</div>
            <div className="stat-card-sub">{data.retailers.length} Retailer(s) with pending balance</div>
          </div>

          <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <div className="stat-card-label">You Owe (Payables)</div>
            <div className="stat-card-value money-negative">{fmt(data.totalPayable)}</div>
            <div className="stat-card-sub">{data.wholesalers.length} Wholesaler(s) pending payment</div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
            <button
              className={`tab-btn ${activeTab === 'receivable' ? 'active' : ''}`}
              onClick={() => setActiveTab('receivable')}
            >
              Retailers (Receivable: {fmt(data.totalReceivable)})
            </button>
            <button
              className={`tab-btn ${activeTab === 'payable' ? 'active' : ''}`}
              onClick={() => setActiveTab('payable')}
            >
              Wholesalers (Payable: {fmt(data.totalPayable)})
            </button>
          </div>
        </div>

        {/* Dues Table */}
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : currentList.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <h3>All clear! No pending {activeTab === 'receivable' ? 'receivables' : 'payables'}</h3>
              <p>All accounts under this category are fully settled.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Contact Name</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Pending Txns</th>
                  <th>Oldest Unpaid Date</th>
                  <th>Total Due</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map((item) => (
                  <tr
                    key={item.contact._id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/contacts/${item.contact._id}`)}
                  >
                    <td className="td-bold">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: item.contact.type === 'wholesaler' ? '#eff6ff' : '#f0fdf4',
                          color: item.contact.type === 'wholesaler' ? '#2563eb' : '#16a34a',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 14,
                        }}>
                          {item.contact.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div>{item.contact.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Click to view profile</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${item.contact.type}`}>
                        {item.contact.type.charAt(0).toUpperCase() + item.contact.type.slice(1)}
                      </span>
                    </td>
                    <td>{item.contact.phone || '—'}</td>
                    <td><span className="badge badge-gray">{item.transactionCount} bill(s)</span></td>
                    <td style={{ color: 'var(--gray-500)' }}>
                      {item.oldestDate ? format(new Date(item.oldestDate), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={{ fontSize: 15, fontWeight: 700, color: activeTab === 'receivable' ? 'var(--success)' : 'var(--danger)' }}>
                      {fmt(item.totalDue)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`btn ${activeTab === 'receivable' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={(e) => openPayModal(item, e)}
                      >
                        {activeTab === 'receivable' ? 'Receive Payment' : 'Pay Wholesaler'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pay Modal */}
      {payContact && (
        <Modal
          isOpen={!!payContact}
          onClose={() => setPayContact(null)}
          title={`Settle Balance — ${payContact.contact.name}`}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPayContact(null)} disabled={submitting}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handlePayment} disabled={submitting}>
                {submitting ? <><span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Processing…</> : 'Confirm Payment'}
              </button>
            </>
          }
        >
          {payError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{payError}</div>}
          {paySuccess && <div className="alert alert-success" style={{ marginBottom: 14 }}>{paySuccess}</div>}

          <div style={{ background: 'var(--gray-50)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Total Outstanding Balance</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)' }}>{fmt(payContact.totalDue)}</div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Payment Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="Enter amount to settle"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Payment Mode *</label>
            <select className="form-select" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="online">Online / UPI / Bank Transfer</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (Optional)</label>
            <input
              className="form-input"
              placeholder="e.g. Received via GPay, Ref #12345"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
