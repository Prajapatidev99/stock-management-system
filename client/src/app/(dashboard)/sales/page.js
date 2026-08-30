'use client';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import TopNav from '@/components/TopNav';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { format } from 'date-fns';
import { fmt } from '@/lib/utils';

function SalesContent() {
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get('contact_id') || '';

  const [txMode, setTxMode]         = useState('sale'); // 'sale' or 'sales_return'
  const [sales, setSales]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [retailers, setRetailers]   = useState([]);
  const [products, setProducts]     = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  // Void Modal state
  const [voidTx, setVoidTx]                 = useState(null);
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError]           = useState('');

  // Retailer State (Direct Type or Select)
  const [selectedRetailerId, setSelectedRetailerId]   = useState(initialContactId);
  const [retailerInput, setRetailerInput]             = useState('');
  const [showRetailerDropdown, setShowRetailerDropdown] = useState(false);

  // Product State (Direct Type or Select)
  const [selectedProductId, setSelectedProductId]     = useState('');
  const [productInput, setProductInput]               = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Form Fields
  const [quantity, setQuantity]       = useState('1');
  const [price, setPrice]             = useState('');
  const [paymentMode, setPaymentMode] = useState('cash'); // 'cash', 'online', 'credit'
  const [amountPaid, setAmountPaid]   = useState('');
  const [date, setDate]               = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes]             = useState('');

  const productRef = useRef(null);
  const retailerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes, txRes] = await Promise.all([
        api.get('/contacts?type=retailer'),
        api.get('/products'),
        api.get('/transactions?limit=30'),
      ]);
      setRetailers(rRes.data || []);
      setProducts(pRes.data || []);

      const saleTxList = (txRes.data.transactions || []).filter(
        t => t.type === 'sale' || t.type === 'sales_return'
      );
      setSales(saleTxList);

      if (initialContactId) {
        const foundR = (rRes.data || []).find(r => r._id === initialContactId);
        if (foundR) {
          setSelectedRetailerId(foundR._id);
          setRetailerInput(foundR.name);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [initialContactId]);

  useEffect(() => {
    load();
  }, [load]);

  // Find currently matched product
  const matchedProduct = products.find(p => p._id === selectedProductId) ||
    products.find(p => p.name.toLowerCase() === productInput.trim().toLowerCase());

  // Auto-fill price when product changes
  const handleProductSelect = (prod) => {
    setSelectedProductId(prod._id);
    setProductInput(prod.name);
    setShowProductDropdown(false);
    setPrice(prod.selling_price ? String(prod.selling_price) : '');
  };

  const handleProductInputChange = (e) => {
    const val = e.target.value;
    setProductInput(val);
    setSelectedProductId('');
    setShowProductDropdown(true);

    const exactMatch = products.find(p => p.name.toLowerCase() === val.trim().toLowerCase());
    if (exactMatch) {
      setSelectedProductId(exactMatch._id);
      setPrice(exactMatch.selling_price ? String(exactMatch.selling_price) : '');
    }
  };

  // Retailer select handler
  const handleRetailerSelect = (r) => {
    setSelectedRetailerId(r._id);
    setRetailerInput(r.name);
    setShowRetailerDropdown(false);
  };

  const handleRetailerInputChange = (e) => {
    const val = e.target.value;
    setRetailerInput(val);
    setSelectedRetailerId('');
    setShowRetailerDropdown(true);

    const exactMatch = retailers.find(r => r.name.toLowerCase() === val.trim().toLowerCase());
    if (exactMatch) {
      setSelectedRetailerId(exactMatch._id);
    }
  };

  // Filtered dropdown lists
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productInput.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(productInput.toLowerCase()))
  );

  const filteredRetailers = retailers.filter(r =>
    r.name.toLowerCase().includes(retailerInput.toLowerCase())
  );

  const parsedQty = parseInt(quantity, 10) || 0;
  const parsedPrice = parseFloat(price) || 0;
  const totalCost = parsedQty * parsedPrice;

  // Compute default paid amount
  const actualPaid = amountPaid !== '' ? (parseFloat(amountPaid) || 0) : (paymentMode === 'credit' ? 0 : totalCost);
  const remainingBalance = Math.max(0, totalCost - actualPaid);

  // Submit Sale or Sales Return
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!retailerInput.trim()) {
      setError('Please select or type a retailer/customer name.');
      return;
    }
    if (!productInput.trim()) {
      setError('Please select or type a product name.');
      return;
    }
    if (parsedQty <= 0) {
      setError('Quantity must be at least 1.');
      return;
    }



    setSubmitting(true);
    try {
      const endpoint = txMode === 'sales_return' ? '/transactions/sales-return' : '/transactions/sale';
      const payload = {
        contact_id: selectedRetailerId || undefined,
        retailer_name: retailerInput.trim(),
        product_id: selectedProductId || undefined,
        product_name: productInput.trim(),
        quantity: parsedQty,
        price: parsedPrice,
        payment_mode: paymentMode,
        amount_paid: actualPaid,
        date,
        notes,
      };

      const res = await api.post(endpoint, payload);
      const tx = res.data;

      if (txMode === 'sales_return') {
        setSuccess(`✓ Sales Return Recorded! ${tx.quantity} unit(s) of "${tx.product_id?.name || productInput}" returned by customer. Stock restored to inventory!`);
      } else {
        setSuccess(`✓ Sale Recorded! ${tx.quantity} unit(s) of "${tx.product_id?.name || productInput}" sold. Stock deducted.`);
      }

      // Clear form
      setProductInput('');
      setSelectedProductId('');
      setPrice('');
      setAmountPaid('');
      setQuantity('1');
      setNotes('');
      setShowProductDropdown(false);
      setShowRetailerDropdown(false);

      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process sale transaction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopNav
        title="Retailers & Sales"
        subtitle="Manage sales, customer returns, cash/online payments & customer balances"
      />
      <div className="page-content">

        {/* Mode Selector Tabs: Sale vs Sales Return */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            className={`btn ${txMode === 'sale' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTxMode('sale'); setError(''); setSuccess(''); }}
          >
            🛒 Record New Sale (Stock Out)
          </button>
          <button
            className={`btn ${txMode === 'sales_return' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ background: txMode === 'sales_return' ? 'var(--warning)' : '', borderColor: txMode === 'sales_return' ? 'var(--warning)' : '' }}
            onClick={() => { setTxMode('sales_return'); setError(''); setSuccess(''); }}
          >
            ↩️ Record Customer Return (Stock In to Inventory)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── Form Card ── */}
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>
                {txMode === 'sale' ? 'Record Retail Sale' : 'Customer Sales Return'}
              </h2>
              <span className={`badge ${txMode === 'sale' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 11, padding: '4px 8px' }}>
                {txMode === 'sale' ? '⚡ Stock Deducted' : '↩️ Stock Restored'}
              </span>
            </div>

            {error   && <div className="alert alert-error"   style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Retailer Input */}
              <div className="form-group" style={{ position: 'relative' }} ref={retailerRef}>
                <label className="form-label" style={{ fontWeight: 600 }}>Retailer / Customer *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type customer name or select existing..."
                  value={retailerInput}
                  onChange={handleRetailerInputChange}
                  onFocus={() => setShowRetailerDropdown(true)}
                />
                {showRetailerDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)',
                    maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4
                  }}>
                    {filteredRetailers.length > 0 && filteredRetailers.map(r => (
                      <div
                        key={r._id}
                        onClick={() => handleRetailerSelect(r)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid var(--gray-100)',
                          background: selectedRetailerId === r._id ? '#e6f7ff' : 'transparent'
                        }}
                      >
                        <strong>{r.name}</strong> {r.phone ? `(${r.phone})` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Input */}
              <div className="form-group" style={{ position: 'relative' }} ref={productRef}>
                <label className="form-label" style={{ fontWeight: 600 }}>Product Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type product name..."
                  value={productInput}
                  onChange={handleProductInputChange}
                  onFocus={() => setShowProductDropdown(true)}
                />

                {showProductDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)',
                    maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4
                  }}>
                    {filteredProducts.length > 0 && filteredProducts.map(p => (
                      <div
                        key={p._id}
                        onClick={() => handleProductSelect(p)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid var(--gray-100)',
                          background: selectedProductId === p._id ? '#e6f7ff' : 'transparent',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}
                      >
                        <div>
                          <strong>{p.name}</strong>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                          Stock: {p.stock} units
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Stock Projection */}
              {matchedProduct && (
                <div style={{ background: txMode === 'sale' ? '#e6f7ff' : '#f6ffed', border: `1px solid ${txMode === 'sale' ? '#91d5ff' : '#b7eb8f'}`, borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>Product: {matchedProduct.name}</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>
                    Available Stock: <strong>{matchedProduct.stock} units</strong>
                    {parsedQty > 0 && (
                      <span> ➔ {txMode === 'sale' ? 'Remaining Stock After Sale: ' : 'Stock After Return: '}
                        <strong style={{ color: txMode === 'sale' ? '#1890ff' : 'var(--success)', fontSize: 14 }}>
                          {txMode === 'sale' ? matchedProduct.stock - parsedQty : matchedProduct.stock + parsedQty} units
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Quantity & Price */}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    placeholder="e.g. 1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="e.g. 650"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Payment Method *</label>
                  <select
                    className="form-select"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                  >
                    <option value="cash">💵 Cash</option>
                    <option value="online">📱 Online / UPI / Bank</option>
                    <option value="credit">⏳ Credit / Pending</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Amount Received (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder={paymentMode === 'credit' ? '0' : String(totalCost)}
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                  />
                </div>
              </div>

              {/* Cost & Balance Summary */}
              {totalCost > 0 && (
                <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '12px 14px', border: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--gray-600)' }}>Total Sale Amount:</span>
                    <strong style={{ fontSize: 16 }}>{fmt(totalCost)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--gray-600)' }}>Amount Paid ({paymentMode.toUpperCase()}):</span>
                    <strong style={{ color: 'var(--success)' }}>{fmt(actualPaid)}</strong>
                  </div>
                  {remainingBalance > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px dashed var(--gray-300)', paddingTop: 6 }}>
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Remaining Due Balance:</span>
                      <strong style={{ color: 'var(--danger)', fontSize: 15 }}>{fmt(remainingBalance)}</strong>
                    </div>
                  )}
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Optional notes…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14,
                  background: txMode === 'sales_return' ? 'var(--warning)' : '',
                  borderColor: txMode === 'sales_return' ? 'var(--warning)' : ''
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Processing…</>
                ) : (
                  txMode === 'sale' ? 'Record Sale & Deduct Stock' : 'Record Sales Return & Restore Stock'
                )}
              </button>
            </form>
          </div>

          {/* ── Sales & Returns History Table ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>Sales Transactions & Returns History</h2>
              <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
            </div>

            <div className="table-wrap">
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              ) : sales.length === 0 ? (
                <div className="empty-state">
                  <h3>No sales transactions recorded yet</h3>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Product</th>
                      <th>Retailer</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th>Mode</th>
                      <th>Paid / Due</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((tx) => (
                      <tr key={tx._id}>
                        <td style={{ color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{format(new Date(tx.date), 'dd MMM yyyy')}</td>
                        <td>
                          <span className={`badge ${tx.type === 'sales_return' ? 'badge-warning' : 'badge-success'}`}>
                            {tx.type === 'sales_return' ? 'Return ↩️' : 'Sale 🛒'}
                          </span>
                        </td>
                        <td className="td-bold">{tx.product_id?.name || 'N/A'}</td>
                        <td>{tx.contact_id?.name || 'N/A'}</td>
                        <td style={{ fontWeight: 700, color: tx.type === 'sales_return' ? 'var(--warning)' : 'var(--primary)' }}>
                          {tx.type === 'sales_return' ? '+' : '-'}{tx.quantity} units
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmt(tx.total_amount)}</td>
                        <td>
                          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--gray-100)' }}>
                            {tx.payment_mode === 'cash' ? '💵 Cash' : tx.payment_mode === 'online' ? '📱 Online' : '⏳ Credit'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--success)', fontWeight: 600 }}>{fmt(tx.amount_paid)} paid</span>
                          {tx.remaining_balance > 0 && (
                            <span style={{ display: 'block', color: 'var(--danger)', fontWeight: 600 }}>{fmt(tx.remaining_balance)} due</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setVoidError('');
                              setVoidTx(tx);
                            }}
                          >
                            Void
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Void Confirmation Modal */}
      {voidTx && (
        <Modal
          isOpen={!!voidTx}
          onClose={() => setVoidTx(null)}
          title={`Void ${voidTx.type === 'sales_return' ? 'Sales Return' : 'Sale'} Transaction`}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setVoidTx(null)} disabled={voidSubmitting}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  setVoidSubmitting(true);
                  setVoidError('');
                  try {
                    await api.delete(`/transactions/${voidTx._id}`);
                    setVoidTx(null);
                    load();
                  } catch (err) {
                    setVoidError(err.response?.data?.message || 'Failed to void transaction');
                  } finally {
                    setVoidSubmitting(false);
                  }
                }}
                disabled={voidSubmitting}
              >
                {voidSubmitting ? <><span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Voiding…</> : 'Yes, Void Transaction'}
              </button>
            </>
          }
        >
          {voidError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{voidError}</div>}
          <p>Are you sure you want to void this sales transaction? Inventory stock will be adjusted automatically.</p>
        </Modal>
      )}
    </>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading sales…</div>}>
      <SalesContent />
    </Suspense>
  );
}
