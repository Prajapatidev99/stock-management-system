'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from '@/components/Modal';
import api from '@/lib/api';

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  const newPassword = watch('newPassword', '');

  const handleClose = () => {
    reset();
    setError('');
    setSuccess('');
    onClose();
  };

  const onSubmit = async (data) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.put('/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setSuccess(res.data.message || 'Password changed successfully!');
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      footer={
        <>
          <button className="btn btn-secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Updating…</> : 'Update Password'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="currentPassword">Current Password *</label>
          <input
            id="currentPassword"
            type="password"
            className={`form-input ${errors.currentPassword ? 'error' : ''}`}
            placeholder="••••••••"
            {...register('currentPassword', { required: 'Current password is required' })}
          />
          {errors.currentPassword && <span className="form-error">{errors.currentPassword.message}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="newPassword">New Password *</label>
          <input
            id="newPassword"
            type="password"
            className={`form-input ${errors.newPassword ? 'error' : ''}`}
            placeholder="At least 6 characters"
            {...register('newPassword', {
              required: 'New password is required',
              minLength: { value: 6, message: 'Password must be at least 6 characters long' },
            })}
          />
          {errors.newPassword && <span className="form-error">{errors.newPassword.message}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="confirmPassword">Confirm New Password *</label>
          <input
            id="confirmPassword"
            type="password"
            className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
            placeholder="Repeat new password"
            {...register('confirmPassword', {
              required: 'Please confirm your new password',
              validate: (val) => val === newPassword || 'Passwords do not match',
            })}
          />
          {errors.confirmPassword && <span className="form-error">{errors.confirmPassword.message}</span>}
        </div>
      </form>
    </Modal>
  );
}
