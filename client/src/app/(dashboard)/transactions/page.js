'use client';
import { useEffect, useState, useCallback } from 'react';
import TopNav from '@/components/TopNav';
import api from '@/lib/api';
import { format } from 'date-fns';

function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [contacts, setContacts]         = useState([]);
  const [products, setProducts]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [total, setTotal]               = useState(0);

  // Filters
  const [typeFilter, setTypeFilter]       = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [fromDate, setFromDate]           = useState('');
  const [toDate, setToDate]               = useState('');
  const [page, setPage]                   = useState(1);
  const [pages, setPages]                 = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 30 };
      if (typeFilter)    params.type       = typeFilter;
      if (contactFilter) params.contact_id = contactFilter;
      if (productFilter) params.product_id = productFilter;
      if (fromDate)      params.from       = fromDate;
      if (toDate)        params.to         = toDate;

      const res = await api.get('/transactions', { params });
      setTransactions(res.data.transactions || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, contactFilter, productFilter, fromDate, toDate, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([api.get('/contacts'), api.get('/products')]).then(([c, p]) => {
      setContacts(c.data);
      setProducts(p.data);
    });
  }, []);

  const resetFilters = () => {
    setTypeFilter('');
    setContactFilter('');
    setProductFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      // Fetch all transactions for export (no pagination)
      const params = { limit: 10000 };
      if (typeFilter)    params.type       = typeFilter;
      if (contactFilter) params.contact_id = contactFilter;
      if (productFilter) params.product_id = productFilter;
      if (fromDate)      params.from       = fromDate;
      if (toDate)        params.to         = toDate;

      const res = await api.get('/transactions', { params });
      const allTx = res.data.transactions || [];

      // Dynamic import to avoid SSR issues
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      // Import autotable — it attaches itself to the jsPDF prototype
      await import('jspdf-autotable');

      const doc = new jsPDF();

      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Transaction History', 14, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, 14, 28);
      doc.text(`Total records: ${allTx.length}`, 14, 34);

      const formatTxType = (t) => {
        if (t === 'purchase') return 'Purchase';
        if (t === 'sale') return 'Sale';
        if (t === 'purchase_return') return 'Purchase Return';
        if (t === 'sales_return') return 'Sales Return';
        return t || '—';
      };

      const totalPurchases = allTx.filter(t => t.type === 'purchase').reduce((s, t) => s + t.total_amount, 0) -
                             allTx.filter(t => t.type === 'purchase_return').reduce((s, t) => s + t.total_amount, 0);
      const totalSales     = allTx.filter(t => t.type === 'sale').reduce((s, t) => s + t.total_amount, 0) -
                             allTx.filter(t => t.type === 'sales_return').reduce((s, t) => s + t.total_amount, 0);
      doc.text(`Net Purchases: ${fmt(Math.max(0, totalPurchases))}    Net Sales: ${fmt(Math.max(0, totalSales))}    Profit: ${fmt(totalSales - totalPurchases)}`, 14, 40);

      doc.setTextColor(0);

      doc.autoTable({
        startY: 48,
        head: [['Date', 'Type', 'Product', 'Contact', 'Qty', 'Price', 'Total']],
        body: allTx.map(tx => [
          format(new Date(tx.date), 'dd/MM/yyyy'),
          formatTxType(tx.type),
          tx.product_id?.name || '—',
          tx.contact_id?.name || '—',
          tx.quantity,
          fmt(tx.price),
          fmt(tx.total_amount),
        ]),
        headStyles: { fillColor: [17, 24, 39], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 30 },
          4: { cellWidth: 14, halign: 'center' },
          5: { cellWidth: 28, halign: 'right' },
          6: { cellWidth: 28, halign: 'right' },
        },
      });

      doc.save(`transactions_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <TopNav
        title="Transaction History"
        subtitle={`${total} transactions found`}
        actions={
          <button className="btn btn-secondary" onClick={exportPDF} disabled={exporting}>
            {exporting
              ? <><span className="spinner" style={{ width: 12, height: 12 }} />Exporting…</>
              : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export PDF
                </>
            }
          </button>
        }
      />

      <div className="page-content">
        {/* ── Filters ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
                <option value="">All Types</option>
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
                <option value="purchase_return">Purchase Return</option>
                <option value="sales_return">Sales Return</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Contact</label>
              <select className="form-select" value={contactFilter} onChange={e => { setContactFilter(e.target.value); setPage(1); }}>
                <option value="">All Contacts</option>
                {contacts.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Product</label>
              <select className="form-select" value={productFilter} onChange={e => { setProductFilter(e.target.value); setPage(1); }}>
                <option value="">All Products</option>
                {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">From Date</label>
              <input type="date" className="form-input" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} />
            </div>
            <div className="form-group">
              <label className="form-label">To Date</label>
              <input type="date" className="form-input" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={resetFilters} style={{ width: '100%', justifyContent: 'center' }}>
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto', width: 28, height: 28 }} /></div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <h3>No transactions found</h3>
              <p>Try adjusting your filters.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th>Contact</th>
                  <th>Qty</th>
                  <th>Price/Unit</th>
                  <th>Total Amount</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx._id}>
                    <td style={{ color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{format(new Date(tx.date), 'dd MMM yyyy')}</td>
                    <td>
                      <span className={`badge badge-${tx.type}`}>
                        {tx.type === 'purchase' ? '↓ Purchase'
                          : tx.type === 'sale' ? '↑ Sale'
                          : tx.type === 'purchase_return' ? '↩ Purchase Return'
                          : '↩ Sales Return'}
                      </span>
                    </td>
                    <td className="td-bold">{tx.product_id?.name || '—'}</td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-900)' }}>{tx.contact_id?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{tx.contact_id?.type}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{tx.quantity}</td>
                    <td>{fmt(tx.price)}</td>
                    <td style={{ fontWeight: 700, color: tx.type === 'purchase' ? 'var(--warning)' : 'var(--success)' }}>
                      {fmt(tx.total_amount)}
                    </td>
                    <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{tx.notes || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={async () => {
                          if (confirm(`Are you sure you want to void this ${tx.type.replace('_', ' ')}? Inventory will be automatically adjusted.`)) {
                            try {
                              const res = await api.delete(`/transactions/${tx._id}`);
                              alert(res.data.message || 'Transaction voided');
                              load();
                            } catch (err) {
                              alert(err.response?.data?.message || 'Failed to void transaction');
                            }
                          }
                        }}
                      >
                        Void / Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>Page {page} of {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </>
  );
}
