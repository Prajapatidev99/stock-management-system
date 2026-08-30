import axios from 'axios';

let API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').trim().replace(/\/$/, '');
if (!API_BASE.endsWith('/api')) {
  API_BASE += '/api';
}

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // Sends the httpOnly cookie on every request — no localStorage token needed
  timeout: 10000,        // 10s global timeout — prevents requests from hanging forever
});

// NOTE: No Authorization header interceptor here.
// Auth is handled purely via the httpOnly cookie set by the server on login.
// This eliminates the XSS token-theft vector (no token ever in JavaScript).

// Handle 401 globally — clear user state and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        // Only redirect if NOT already on /login page to prevent infinite reload loop
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
