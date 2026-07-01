import React, { useState } from 'react';
import { ShieldAlert, LogIn, Lock, User, AlertCircle, UserPlus, Info } from 'lucide-react';
import { verifyCredentials, setSessionAuthenticated, registerUser } from '../utils/auth';
import { hashPassword } from '../utils/crypto';
import { motion } from 'motion/react';

interface LoginProps {
  onLoginSuccess: (username: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    const trimmedUser = username.trim();
    if (!trimmedUser || !password.trim()) {
      setError('Please provide both username and password.');
      return;
    }

    if (isRegister) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegister) {
        // REGISTER MODE
        const pHash = await hashPassword(password);
        const registered = registerUser(trimmedUser, pHash);
        if (registered) {
          setSuccess('Account created successfully! Logging you in...');
          setTimeout(() => {
            setSessionAuthenticated(trimmedUser);
            onLoginSuccess(trimmedUser);
          }, 1200);
        } else {
          setError('Username already exists. Please choose another username.');
        }
      } else {
        // SIGN-IN MODE
        const isValid = await verifyCredentials(trimmedUser, password);
        if (isValid) {
          setSessionAuthenticated(trimmedUser);
          onLoginSuccess(trimmedUser);
        } else {
          setError('Invalid credentials. If you are a new driver, register an account below.');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Authentication process failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      {/* Background radial subtle accents */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(6,182,212,0.03),transparent_40%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.03),transparent_40%)] pointer-events-none" />

      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-500" />

        <motion.div
          key={isRegister ? 'register' : 'login'}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Header area */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 p-3 bg-gradient-to-br from-cyan-500/10 to-teal-500/10 text-cyan-400 rounded-2xl mb-3 border border-cyan-500/10">
              {isRegister ? (
                <UserPlus className="w-5 h-5 text-teal-400" />
              ) : (
                <Lock className="w-5 h-5 text-cyan-400" />
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {isRegister ? 'Create Driver Console' : 'Security Sign In'}
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {isRegister 
                ? 'Register a secure workspace for your fuel logs & vehicle profiles' 
                : 'Personal Fuel Expense Tracker & Mileage Analytics'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-xs flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  className="w-full h-12 pl-10 pr-4 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/10 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter security password"
                  autoComplete="current-password"
                  className="w-full h-12 pl-10 pr-4 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/10 transition-all"
                />
              </div>
            </div>

            {isRegister && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required={isRegister}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Verify security password"
                    autoComplete="new-password"
                    className="w-full h-12 pl-10 pr-4 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/10 transition-all"
                  />
                </div>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 mt-4 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-450 hover:to-teal-450 text-white font-medium rounded-xl text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isRegister ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Creating Console...' : 'Register Driver'}
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {loading ? 'Authenticating...' : 'Unlock Console'}
                </>
              )}
            </button>
          </form>

          {/* Toggle Register state */}
          <div className="mt-5 p-3 bg-slate-950/40 border border-slate-850 rounded-2xl text-center">
            <button
              type="button"
              onClick={() => {
                setError('');
                setIsRegister(!isRegister);
              }}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors inline-block underline cursor-pointer"
            >
              {isRegister 
                ? 'Already have an account? Sign In' 
                : 'New driver? Register Here'}
            </button>
          </div>

          {/* Footer warning */}
          <div className="mt-5 pt-3.5 border-t border-slate-800 text-center">
            <span className="text-[11px] text-slate-500 block leading-normal">
              Closed environment. Unauthenticated operations are automatically rejected.
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
