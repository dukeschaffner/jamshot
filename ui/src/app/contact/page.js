'use client';
import { useState } from 'react';
import api from '../../lib/api';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    try {
      await api.post('/contact', form);
      setStatus('success');
      setForm({ name: '', email: '', message: '' });
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Contact Us</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded mt-1"
            />
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded mt-1"
            />
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message
            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded mt-1"
              rows={4}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Sending...' : 'Send'}
        </button>
        {status === 'success' && (
          <p className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded text-center">Message sent!</p>
        )}
        {status === 'error' && (
          <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-center">Something went wrong. Please try again.</p>
        )}
      </form>
    </div>
  );
} 