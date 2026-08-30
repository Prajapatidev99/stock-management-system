'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import TopNav from '@/components/TopNav';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useDebounce } from '@/lib/useDebounce';

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [typeFilter, setTypeFilter]   = useState('all');
  const [search, setSearch]           = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [deleteId, setDeleteId]       = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await api.get('/contacts', { params });
      setContacts(res.data);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, debouncedSearch]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const openAdd = () => {
    setEditing(null);
    reset({ name: '', type: 'wholesaler', phone: '', address: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (contact, e) => {
    e?.stopPropagation();
    setEditing(contact);
    reset({ name: contact.name, type: contact.type, phone: contact.phone || '', address: contact.address || '' });
    setError('');
    setModalOpen(true);
  };

  const goToProfile = (contactId) => {
    router.push(`/contacts/${contactId}`);
  };

  const onSubmit = async (data) => {
    setSubmitting(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/contacts/${editing._id}`, data);
      } else {
        await api.post('/contacts', data);
      }
      setModalOpen(false);
      fetchContacts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    setDeleteError('');
    try {
      await api.delete(`/contacts/${id}`);
      setDeleteId(null);
      fetchContacts();
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete contact');
    }
  };

  return (
    <>
      <TopNav
        title="Contacts"
        subtitle="Manage your wholesalers and retailers"
        actions={
          <button id="add-contact-btn" className="btn btn-primary" onClick={openAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Contact
          </button>
        }
      />

      <div className="page-content">
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-input-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="form-input"
              placeholder="Search contacts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', gap: 4 }}>
            {['all','wholesaler','retailer'].map((t) => (
              <button
                key={t}
                className={`tab-btn ${typeFilter === t ? 'active' : ''}`}
                style={{ borderBottom: '2px solid', borderColor: typeFilter === t ? 'var(--gray-900)' : 'transparent' }}
                onClick={() => setTypeFilter(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : contacts.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <h3>No contacts found</h3>
              <p>Add your first wholesaler or retailer to get started.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c._id} style={{ cursor: 'pointer' }} onClick={() => goToProfile(c._id)}>
                    <td className="td-bold">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: c.type === 'wholesaler' ? '#eff6ff' : '#f0fdf4',
                          color: c.type === 'wholesaler' ? '#2563eb' : '#16a34a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14
                        }}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div>{c.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>Click to open full profile</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${c.type}`}>
                        {c.type.charAt(0).toUpperCase() + c.type.slice(1)}
                      </span>
                    </td>
                    <td>{c.phone || <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                    <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.address || <span style={{ color: 'var(--gray-400)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--gray-500)' }}>{format(new Date(c.createdAt), 'dd MMM yyyy')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); goToProfile(c._id); }}>
                          Full Profile →
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={(e) => openEdit(c, e)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDeleteId(c._id); }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Contact' : 'Add Contact'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit(onSubmit)} disabled={submitting}>
              {submitting ? <><span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />Saving…</> : 'Save Contact'}
            </button>
          </>
        }
      >
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-group">
          <label className="form-label">Full Name *</label>
          <input className={`form-input ${errors.name ? 'error' : ''}`} placeholder="e.g. Sharma Wholesale" {...register('name', { required: 'Name is required' })} />
          {errors.name && <span className="form-error">{errors.name.message}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Contact Type *</label>
          <select className="form-select" {...register('type', { required: true })}>
            <option value="wholesaler">Wholesaler</option>
            <option value="retailer">Retailer</option>
          </select>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-input" placeholder="+91 98765 43210" {...register('phone')} />
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" placeholder="City, State" {...register('address')} />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => { setDeleteId(null); setDeleteError(''); }}
        title="Delete Contact"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setDeleteId(null); setDeleteError(''); }}>Cancel</button>
            <button className="btn btn-danger" onClick={(e) => handleDelete(deleteId, e)}>Yes, Delete</button>
          </>
        }
      >
        {deleteError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{deleteError}</div>}
        <p>Are you sure you want to delete this contact? This action will soft-delete the record and it won't appear in future transactions.</p>
      </Modal>
    </>
  );
}
