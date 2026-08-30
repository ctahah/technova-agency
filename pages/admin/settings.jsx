// pages/admin/settings.js
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [formData, setFormData] = useState({
    companyName: '',
    availabilityStatus: '',
    tagline: '',
    subheading: '',
    whatsappNumber: '',
    contactEmail: '',
    officeAddress: ''
  });

  // Page load hone par settings fetch karo
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings', {
        method: 'GET',
        credentials: 'include' // Cookie bhejo
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      const s = data.settings || data.data || data;
      
      setFormData({
        companyName: s.companyName || '',
        availabilityStatus: s.availabilityStatus || '',
        tagline: s.tagline || '',
        subheading: s.subheading || '',
        whatsappNumber: s.whatsappNumber || '',
        contactEmail: s.contactEmail || '',
        officeAddress: s.officeAddress || ''
      });
    } catch (error) {
      console.error('Fetch error:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    console.log('📤 Sending data:', formData); // Yeh dekho

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      console.log('📥 Response status:', res.status); // Yeh dekho

      const data = await res.json();
      console.log('📥 Response data:', data); // Yeh dekho

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to save');
      }

      setMessage({ type: 'success', text: '✅ Settings saved successfully!' });
      
      // 3 second baad message hata do
      setTimeout(() => setMessage(null), 3500);
    } catch (error) {
      console.error('Save error:', error);
      setMessage({ type: 'error', text: '❌ ' + error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05050A] text-white flex items-center justify-center font-sans">
        <div className="flex items-center gap-3 text-cyan-400">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl"></i>
          <span className="text-sm font-mono tracking-wider">Loading settings from MongoDB...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Settings & Contact | TechNova Admin</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </Head>

      <div className="min-h-screen bg-[#05050A] text-white p-6 md:p-10 font-sans">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono mb-1 uppercase tracking-wider">
                <i className="fa-solid fa-sliders"></i> Admin Control Panel
              </div>
              <h1 className="text-3xl font-bold text-white font-['Space_Grotesk']">Settings & Contact</h1>
              <p className="text-gray-400 text-sm mt-1">Manage MongoDB records for settings, services, projects, team, and reviews.</p>
            </div>
            
            <a href="/admin" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition">
              <i className="fa-solid fa-arrow-left text-xs"></i> Back to Dashboard
            </a>
          </div>

          {/* Success/Error Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-2xl text-sm font-medium flex items-center gap-3 transition-all ${
              message.type === 'success' 
                ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              <i className={`fa-solid ${message.type === 'success' ? 'fa-circle-check text-base' : 'fa-circle-exclamation text-base'}`}></i>
              <span>{message.text}</span>
            </div>
          )}

          {/* Settings Form Card */}
          <form onSubmit={handleSave} className="bg-[#0F0F16]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl space-y-8">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <h2 className="text-xl font-bold text-white font-['Space_Grotesk']">General & Branding Settings</h2>
                <p className="text-gray-400 text-xs mt-0.5">Update your company branding, headlines, and public contact information</p>
              </div>

              <button 
                type="submit" 
                disabled={saving}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 text-sm"
              >
                {saving ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-floppy-disk"></i>
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>

            {/* Grid 1: Company & Status */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">COMPANY NAME *</label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  required
                  placeholder="TechNova"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">AVAILABILITY STATUS</label>
                <input
                  type="text"
                  name="availabilityStatus"
                  value={formData.availabilityStatus}
                  onChange={handleChange}
                  placeholder="Available for new projects"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
                />
              </div>
            </div>

            {/* Tagline */}
            <div>
              <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">TAGLINE / HEADLINE *</label>
              <input
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                required
                placeholder="We Build Digital Experiences That Matter"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
              />
            </div>

            {/* Subheading */}
            <div>
              <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">SUBHEADING DESCRIPTION</label>
              <textarea
                name="subheading"
                value={formData.subheading}
                onChange={handleChange}
                rows={3}
                placeholder="Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition resize-none"
              />
            </div>

            {/* Grid 3: Contact Details */}
            <div className="grid md:grid-cols-3 gap-6 pt-2">
              <div>
                <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">PRIMARY WHATSAPP NUMBER</label>
                <input
                  type="text"
                  name="whatsappNumber"
                  value={formData.whatsappNumber}
                  onChange={handleChange}
                  placeholder="923001234567"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">CONTACT EMAIL</label>
                <input
                  type="email"
                  name="contactEmail"
                  value={formData.contactEmail}
                  onChange={handleChange}
                  placeholder="chtaha033@gmail.com"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">OFFICE ADDRESS</label>
                <input
                  type="text"
                  name="officeAddress"
                  value={formData.officeAddress}
                  onChange={handleChange}
                  placeholder="Your office address"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
                />
              </div>
            </div>

          </form>

        </div>
      </div>
    </>
  );
}
