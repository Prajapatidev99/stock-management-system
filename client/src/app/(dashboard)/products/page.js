'use client';
import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import TopNav from '@/components/TopNav';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useDebounce } from '@/lib/useDebounce';

function stockClass(stock) {
  if (stock === 0) return 'stock-low';
  if (stock < 10)  return 'stock-mid';
  return 'stock-ok';
}

function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ProductsPage() {
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [deleteId, setDeleteId]   = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await api.get('/products', { params });
      setProducts(res.data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const openAdd = () => {
    setEditing(null);
    reset({ name: '', category: '', purchase_price: '', selling_price: '', stock: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    reset({ name: p.name, category: p.category || '', purchase_price: p.purchase_price, selling_price: p.selling_price });
    setError('');
    setModalOpen(true);
  };

  const onSubmit = async (data) => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...data,
        purchase_price: parseFloat(data.purchase_price),
        selling_price:  parseFloat(data.selling_price),
        ...(editing ? {} : { stock: parseInt(data.stock) || 0 }),
      };
      if (editing) {
        await api.put(`/products/${editing._id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/products/${id}`);
      setDeleteId(null);
      fetchProducts();
    } catch {
      alert('Failed to delete product');
    }
  };

  return (
    <>
      <TopNav
        title="Products"
        subtitle="Manage your inventory items"
        actions={
          <button id="add-product-btn" className="btn btn-primary" onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Product
          </button>
        }
      />

      <div className="page-content">
        <div className="filter-bar">
          <div className="search-input-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="form-input" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              <h3>No products yet</h3>
              <p>Add your first product to start tracking inventory.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Purchase Price</th>
                  <th>Selling Price</th>
                  <th>Margin</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const margin = p.purchase_price > 0
                    ? (((p.selling_price - p.purchase_price) / p.purchase_price) * 100).toFixed(1)
                    : '—';
                  return (
                    <tr key={p._id}>
                      <td className="td-bold">{p.name}</td>
                      <td>
                        {p.category
                          ? <span className="badge badge-gray">{p.category}</span>
                          : <span style={{ color: 'var(--gray-400)' }}>—</span>}
                      </td>
                      <td className={stockClass(p.stock)}>
                        {p.stock === 0
                          ? '⚠ Out of stock'
                          : p.stock < 10
                          ? `⚡ ${p.stock} units`
                          : `${p.stock} units`}
                      </td>
                      <td>{fmt(p.purchase_price)}</td>
                      <td>{fmt(p.selling_price)}</td>
                      <td>
                        {p.purchase_price > 0 ? (
                          <span style={{ color: parseFloat(margin) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                            {margin}%
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ color: 'var(--gray-500)' }}>{format(new Date(p.createdAt), 'dd MMM yyyy')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(p._id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Product' : 'Add Product'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit(onSubmit)} disabled={submitting}>
              {submitting ? <><span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />Saving…</> : 'Save Product'}
            </button>
          </>
        }
      >
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Product Name *</label>
            <input className={`form-input ${errors.name ? 'error' : ''}`} placeholder="e.g. Rice 5kg Bag" {...register('name', { required: 'Name is required' })} />
            {errors.name && <span className="form-error">{errors.name.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <input className="form-input" placeholder="e.g. Groceries" {...register('category')} />
          </div>
          {!editing && (
            <div className="form-group">
              <label className="form-label">Opening Stock</label>
              <input className="form-input" type="number" min="0" placeholder="0" {...register('stock')} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Purchase Price (₹) *</label>
            <input className={`form-input ${errors.purchase_price ? 'error' : ''}`} type="number" step="0.01" min="0" placeholder="0.00"
              {...register('purchase_price', { required: 'Required', min: { value: 0, message: 'Must be positive' } })} />
            {errors.purchase_price && <span className="form-error">{errors.purchase_price.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Selling Price (₹) *</label>
            <input className={`form-input ${errors.selling_price ? 'error' : ''}`} type="number" step="0.01" min="0" placeholder="0.00"
              {...register('selling_price', { required: 'Required', min: { value: 0, message: 'Must be positive' } })} />
            {errors.selling_price && <span className="form-error">{errors.selling_price.message}</span>}
          </div>
        </div>
        {editing && (
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
            ⓘ Stock is updated automatically through purchases and sales. To adjust stock, create a transaction.
          </p>
        )}
      </Modal>

      {/* Delete Confirm */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Product"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDelete(deleteId)}>Yes, Delete</button>
          </>
        }
      >
        <p>Are you sure you want to delete this product? Transaction history will be preserved.</p>
      </Modal>
    </>
  );
}
