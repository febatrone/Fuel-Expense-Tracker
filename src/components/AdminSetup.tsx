import React, { useState } from 'react';
import { Shield, KeyRound, AlertTriangle, CheckCircle, Copy } from 'lucide-react';
import { hashPassword } from '../utils/crypto';
import { saveLocalAdminConfig } from '../utils/auth';
import { motion } from 'motion/react';

interface AdminSetupProps {
  onComplete: () => void;
}

export default function AdminSetup({ onComplete }: AdminSetupProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedHash, setGeneratedHash] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const pHash = await hashPassword(password);
      setGeneratedHash(pHash);
      saveLocalAdminConfig(username.trim(), pHash);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to hash password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    const text = `VITE_ADMIN_USERNAME="${username}"\nVITE_ADMIN_PASSWORD_HASH="${generatedHash}"`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow decorative banner */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />

        {!success ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">Admin Setup Wizard</h1>
                <p className="text-xs text-slate-400 font-mono">STEP 1: CONFIGURATION</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              Welcome to your personal Fuel Expense Tracker. Since this is a secure single-user app, please configure your admin credentials to protect your mileage data.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Admin Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. driver1"
                  className="w-full h-12 px-4 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-12 px-4 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full h-12 px-4 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 mt-2 bg-emerald-500 hover:bg-emerald-450 text-white font-medium rounded-xl text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
              >
                {loading ? 'Generating Secures Hashes...' : 'Establish Security Profile'}
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl">
                <CheckCircle className="w-12 h-12" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Setup Succeeded!</h2>
            <p className="text-sm text-slate-400 mb-6 px-2">
              Your credentials have been securely stored in your local browser cache. You can now use them to log into this applet.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left mb-6 text-xs font-mono relative">
              <button
                onClick={copyToClipboard}
                title="Copy environment variables"
                className="absolute top-3 right-3 p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {copied ? <span className="text-[10px] text-emerald-400 font-sans">Copied!</span> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <div className="text-emerald-400 font-bold mb-2">// Netlify / .env integration keys:</div>
              <div className="text-slate-300 break-all select-all">VITE_ADMIN_USERNAME="{username}"</div>
              <div className="text-slate-300 break-all select-all mt-1">VITE_ADMIN_PASSWORD_HASH="{generatedHash}"</div>
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs text-left mb-6 leading-relaxed">
              <strong>Optional Tip:</strong> Copy and store the above environment variables! Paste them into your Netlify deployment configuration or local <code>.env</code> file to persist admin logins globally, even if you clean your browser cookies.
            </div>

            <button
              onClick={onComplete}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-450 text-white font-medium rounded-xl text-sm transition-all shadow-md active:scale-98 cursor-pointer"
            >
              Enter Fuel Tracker Dashboard
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
