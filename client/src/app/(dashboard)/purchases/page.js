'use client';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import TopNav from '@/components/TopNav';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { format } from 'date-fns';
import { fmt } from '@/lib/utils';

function PurchasesContent() {
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get('contact_id') || '';

  const [txMode, setTxMode]             = useState('purchase'); // 'purchase' or 'purchase_return'
  const [purchases, setPurchases]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [wholesalers, setWholesalers] = useState([]);
  const [products, setProducts]       = useState([]);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  // Void Modal state
  const [voidTx, setVoidTx]                 = useState(null);
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError]           = useState('');

  // Wholesaler State (Direct Type or Select)
  const [selectedWholesalerId, setSelectedWholesalerId] = useState(initialContactId);
  const [wholesalerInput, setWholesalerInput]           = useState('');
  const [showWholesalerDropdown, setShowWholesalerDropdown] = useState(false);

  // Product State (Direct Type or Select)
  const [selectedProductId, setSelectedProductId]     = useState('');
  const [productInput, setProductInput]               = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [sellingPrice, setSellingPrice]               = useState('');

  // Common Form Fields
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice]       = useState('');
  const [paymentMode, setPaymentMode] = useState('cash'); // 'cash', 'online', 'credit'
  const [amountPaid, setAmountPaid]   = useState('');
  const [date, setDate]         = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes]       = useState('');

  const productRef = useRef(null);
  const wholesalerRef = useRef(null);

  // Load Wholesalers, Products, Transactions
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wsRes, pRes, txRes] = await Promise.all([
        api.get('/contacts?type=wholesaler'),
        api.get('/products'),
        api.get('/transactions?limit=30'),
      ]);
      setWholesalers(wsRes.data || []);
      setProducts(pRes.data || []);

      const purchaseTxList = (txRes.data.transactions || []).filter(
        t => t.type === 'purchase' || t.type === 'purchase_return'
      );
      setPurchases(purchaseTxList);

      if (initialContactId) {
        const foundW = (wsRes.data || []).find(w => w._id === initialContactId);
        if (foundW) {
          setSelectedWholesalerId(foundW._id);
          setWholesalerInput(foundW.name);
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

  const isNewProduct = productInput.trim().length > 0 && !matchedProduct && txMode === 'purchase';

  // Auto-fill price when product changes
  const handleProductSelect = (prod) => {
    setSelectedProductId(prod._id);
    setProductInput(prod.name);
    setShowProductDropdown(false);
    setPrice(prod.purchase_price ? String(prod.purchase_price) : '');
    setSellingPrice(prod.selling_price ? String(prod.selling_price) : '');
  };

  const handleProductInputChange = (e) => {
    const val = e.target.value;
    setProductInput(val);
    setSelectedProductId('');
    setShowProductDropdown(true);

    const exactMatch = products.find(p => p.name.toLowerCase() === val.trim().toLowerCase());
    if (exactMatch) {
      setSelectedProductId(exactMatch._id);
      setPrice(exactMatch.purchase_price ? String(exactMatch.purchase_price) : '');
      setSellingPrice(exactMatch.selling_price ? String(exactMatch.selling_price) : '');
    }
  };

  // Wholesaler select handler
  const handleWholesalerSelect = (w) => {
    setSelectedWholesalerId(w._id);
    setWholesalerInput(w.name);
    setShowWholesalerDropdown(false);
  };

  const handleWholesalerInputChange = (e) => {
    const val = e.target.value;
    setWholesalerInput(val);
    setSelectedWholesalerId('');
    setShowWholesalerDropdown(true);

    const exactMatch = wholesalers.find(w => w.name.toLowerCase() === val.trim().toLowerCase());
    if (exactMatch) {
      setSelectedWholesalerId(exactMatch._id);
    }
  };

  // Filtered dropdown lists
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productInput.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(productInput.toLowerCase()))
  );

  const filteredWholesalers = wholesalers.filter(w =>
    w.name.toLowerCase().includes(wholesalerInput.toLowerCase())
  );

  const parsedQty = parseInt(quantity, 10) || 0;
  const parsedPrice = parseFloat(price) || 0;
  const totalCost = parsedQty * parsedPrice;

  // Compute default paid amount
  const actualPaid = amountPaid !== '' ? (parseFloat(amountPaid) || 0) : (paymentMode === 'credit' ? 0 : totalCost);
  const remainingBalance = Math.max(0, totalCost - actualPaid);

  // Submit Purchase or Return
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!wholesalerInput.trim()) {
      setError('Please select or type a wholesaler name.');
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
      const endpoint = txMode === 'purchase_return' ? '/transactions/purchase-return' : '/transactions/purchase';
      const payload = {
        contact_id: selectedWholesalerId || undefined,
        wholesaler_name: wholesalerInput.trim(),
        product_id: selectedProductId || undefined,
        product_name: productInput.trim(),
        quantity: parsedQty,
        price: parsedPrice,
        selling_price: sellingPrice ? parseFloat(sellingPrice) : undefined,
        payment_mode: paymentMode,
        amount_paid: actualPaid,
        date,
        notes,
      };

      const res = await api.post(endpoint, payload);
      const tx = res.data;

      if (txMode === 'purchase_return') {
        setSuccess(`✓ Return Recorded! ${tx.quantity} unit(s) of "${tx.product_id?.name || productInput}" returned to wholesaler. Stock reduced.`);
      } else {
        setSuccess(`✓ Success! Purchase of ${tx.quantity} unit(s) for "${tx.product_id?.name || productInput}" recorded. Stock added directly!`);
      }

      // Clear form
      setProductInput('');
      setSelectedProductId('');
      setPrice('');
      setSellingPrice('');
      setAmountPaid('');
      setQuantity('1');
      setNotes('');
      setShowProductDropdown(false);
      setShowWholesalerDropdown(false);

      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process transaction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopNav
        title="Wholesalers & Purchases"
        subtitle="Manage stock purchases, wholesaler returns, cash/online payments & balances"
      />
      <div className="page-content">

        {/* Mode Selector Tabs: Purchase vs Purchase Return */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            className={`btn ${txMode === 'purchase' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTxMode('purchase'); setError(''); setSuccess(''); }}
          >
            📦 Record New Purchase (Stock In)
          </button>
          <button
            className={`btn ${txMode === 'purchase_return' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ background: txMode === 'purchase_return' ? 'var(--warning)' : '', borderColor: txMode === 'purchase_return' ? 'var(--warning)' : '' }}
            onClick={() => { setTxMode('purchase_return'); setError(''); setSuccess(''); }}
          >
            ↩️ Record Purchase Return (Stock Out to Wholesaler)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── Form Card ── */}
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>
                {txMode === 'purchase' ? 'Direct Wholesaler Purchase' : 'Purchase Return to Wholesaler'}
              </h2>
              <span className={`badge ${txMode === 'purchase' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 11, padding: '4px 8px' }}>
                {txMode === 'purchase' ? '⚡ Auto Stock Add' : '↩️ Stock Return'}
              </span>
            </div>

            {error   && <div className="alert alert-error"   style={{ marginBottom: 12 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Wholesaler Input */}
              <div className="form-group" style={{ position: 'relative' }} ref={wholesalerRef}>
                <label className="form-label" style={{ fontWeight: 600 }}>Wholesaler / Supplier *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type wholesaler name or select existing..."
                  value={wholesalerInput}
                  onChange={handleWholesalerInputChange}
                  onFocus={() => setShowWholesalerDropdown(true)}
                />
                {showWholesalerDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)',
                    maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4
                  }}>
                    {filteredWholesalers.length > 0 && filteredWholesalers.map(w => (
                      <div
                        key={w._id}
                        onClick={() => handleWholesalerSelect(w)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid var(--gray-100)',
                          background: selectedWholesalerId === w._id ? '#e6f7ff' : 'transparent'
                        }}
                      >
                        <strong>{w.name}</strong> {w.phone ? `(${w.phone})` : ''}
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
                <div style={{ background: txMode === 'purchase' ? '#e6f7ff' : '#fffbe6', border: `1px solid ${txMode === 'purchase' ? '#91d5ff' : '#ffe58f'}`, borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>Product: {matchedProduct.name}</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>
                    Current Stock: <strong>{matchedProduct.stock} units</strong>
                    {parsedQty > 0 && (
                      <span> ➔ {txMode === 'purchase' ? 'New Projected Stock: ' : 'Stock After Return: '}
                        <strong style={{ color: txMode === 'purchase' ? '#1890ff' : 'var(--warning)', fontSize: 14 }}>
                          {txMode === 'purchase' ? matchedProduct.stock + parsedQty : matchedProduct.stock - parsedQty} units
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
                    placeholder="e.g. 10"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Purchase Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="e.g. 500"
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
                  <label className="form-label" style={{ fontWeight: 600 }}>Amount Paid Today (₹)</label>
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
                    <span style={{ color: 'var(--gray-600)' }}>Total Transaction Amount:</span>
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
                  background: txMode === 'purchase_return' ? 'var(--warning)' : '',
                  borderColor: txMode === 'purchase_return' ? 'var(--warning)' : ''
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Processing…</>
                ) : (
                  txMode === 'purchase' ? 'Record Purchase & Update Stock' : 'Record Purchase Return & Reduce Stock'
                )}
              </button>
            </form>
          </div>

          {/* ── Purchases & Returns Table ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>Wholesaler Transactions & History</h2>
              <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
            </div>

            <div className="table-wrap">
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              ) : purchases.length === 0 ? (
                <div className="empty-state">
                  <h3>No purchase transactions recorded yet</h3>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Product</th>
                      <th>Wholesaler</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th>Mode</th>
                      <th>Paid / Due</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((tx) => (
                      <tr key={tx._id}>
                        <td style={{ color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{format(new Date(tx.date), 'dd MMM yyyy')}</td>
                        <td>
                          <span className={`badge ${tx.type === 'purchase_return' ? 'badge-warning' : 'badge-success'}`}>
                            {tx.type === 'purchase_return' ? 'Return ↩️' : 'Purchase 📦'}
                          </span>
                        </td>
                        <td className="td-bold">{tx.product_id?.name || 'N/A'}</td>
                        <td>{tx.contact_id?.name || 'N/A'}</td>
                        <td style={{ fontWeight: 700, color: tx.type === 'purchase_return' ? 'var(--warning)' : 'var(--success)' }}>
                          {tx.type === 'purchase_return' ? '-' : '+'}{tx.quantity} units
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
          title={`Void ${voidTx.type === 'purchase_return' ? 'Purchase Return' : 'Purchase'} Transaction`}
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
          <p>Are you sure you want to void this purchase transaction? Inventory stock will be adjusted automatically.</p>
        </Modal>
      )}
    </>
  );
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading wholesaler purchases…</div>}>
      <PurchasesContent />
    </Suspense>
  );
}
