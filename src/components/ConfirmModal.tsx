import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info, LogOut, Trash2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
}: ConfirmModalProps) {
  // Determine color theme based on type
  const theme = {
    danger: {
      bg: 'bg-rose-500/10 border-rose-500/20',
      text: 'text-rose-400',
      btn: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-700',
      icon: <Trash2 className="w-5 h-5 text-rose-400" />,
    },
    warning: {
      bg: 'bg-amber-500/10 border-amber-500/20',
      text: 'text-amber-400',
      btn: 'bg-amber-600 hover:bg-amber-500 text-white border-amber-700',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
    info: {
      bg: 'bg-cyan-500/10 border-cyan-500/20',
      text: 'text-cyan-400',
      btn: 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-700',
      icon: <Info className="w-5 h-5 text-cyan-400" />,
    },
  }[type];

  // Global escape and scroll locking
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="confirm-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop blur with real reactive dimming */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl relative z-10 overflow-hidden"
          >
            {/* Top decorative badge */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${theme.bg}`}>
                {theme.icon}
              </div>
              <h3 className="font-extrabold text-white text-base tracking-tight">{title}</h3>
            </div>

            {/* Content text */}
            <p className="mt-3.5 text-xs text-slate-300 leading-relaxed font-sans pr-1">
              {message}
            </p>

            {/* Action footer */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-white font-medium rounded-xl text-xs transition-colors border border-slate-850 cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`h-10 px-4 font-bold rounded-xl text-xs transition-colors cursor-pointer border ${theme.btn}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
