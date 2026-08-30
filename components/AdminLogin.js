// components/AdminLogin.js
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Client-side quick validation
    if (!email || !password) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          email: email.trim(), 
          password,
          captchaToken 
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Generic error message - prevent user enumeration
        setError(data.message || 'Invalid email or password');
        return;
      }

      // Store auth session
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('technova_admin_token', data.token);
      }
      if (data.admin) {
        localStorage.setItem('technova_admin_user', JSON.stringify(data.admin));
      }

      // Smooth transition to dashboard
      router.push('/admin');
    } catch (err) {
      console.error('Login error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>TechNova | Secure Admin Login</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-[#05050A] text-white font-sans p-4 relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-[-100px] left-[-100px] w-96 h-96 bg-[#00F0FF]/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-[#7000FF]/20 rounded-full blur-[120px] pointer-events-none" />

        {/* 3D Glassmorphism Card */}
        <div className="w-full max-w-md bg-[#0F0F16]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/80 z-10">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <i className="fa-solid fa-bolt text-white text-lg"></i>
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-wider uppercase font-['Space_Grotesk']">TechNova</span>
              <p className="text-[10px] text-gray-500 font-mono uppercase">Control Center</p>
            </div>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 font-['Space_Grotesk']">Admin Portal</h1>
          <p className="text-gray-400 text-sm mb-6">Sign in to manage agency database and settings</p>

          {/* Development Notice */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-5 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs flex items-center gap-2">
              <i className="fa-solid fa-code"></i>
              <span><strong>Dev Mode:</strong> Credentials secured in <code>.env.local</code></span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2.5 animate-shake">
              <i className="fa-solid fa-triangle-exclamation text-base"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">
                Admin Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-gray-300 text-xs uppercase tracking-wider font-semibold mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:border-cyan-400 focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3.5 text-gray-500 hover:text-cyan-400 transition"
                  aria-label="Toggle password"
                >
                  <i className={`fa-regular ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {/* Optional Google reCAPTCHA placeholder */}
            {process.env.NEXT_PUBLIC_RECAPTCHA_KEY && (
              <div className="my-4 flex justify-center">
                {/* <ReCAPTCHA sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_KEY} onChange={setCaptchaToken} /> */}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold py-3.5 px-6 rounded-xl hover:shadow-[0_0_25px_rgba(0,240,255,0.4)] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-shield-halved"></i>
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/" className="text-gray-400 hover:text-cyan-400 text-xs transition inline-flex items-center gap-1.5">
              <i className="fa-solid fa-arrow-left text-[10px]"></i> Return to Main Website
            </a>
          </div>

        </div>
      </div>
    </>
  );
}
