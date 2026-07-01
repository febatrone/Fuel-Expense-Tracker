import React, { useState, useEffect } from 'react';
import { X, Calendar, Compass, Droplets, CreditCard, Clipboard, Loader2, Sparkles } from 'lucide-react';
import { FuelEntry } from '../types';
import { validateOdometer, calculateEntries } from '../utils/calc';
import { motion, AnimatePresence } from 'motion/react';

interface FuelEntryFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entryData: Omit<FuelEntry, 'id' | 'price_per_liter'> & { id?: string }) => Promise<void>;
  editingEntry?: FuelEntry | null;
  existingEntries: FuelEntry[];
}

export default function FuelEntryForm({
  isOpen,
  onClose,
  onSave,
  editingEntry,
  existingEntries,
}: FuelEntryFormProps) {
  const [date, setDate] = useState('');
  const [odometer, setOdometer] = useState('');
  const [liters, setLiters] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [isPartial, setIsPartial] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hydrate form fields if editing
  useEffect(() => {
    if (editingEntry) {
      setDate(editingEntry.date);
      setOdometer(editingEntry.odometer.toString());
      setLiters(editingEntry.liters.toString());
      setAmountPaid(editingEntry.amount_paid.toString());
      setNotes(editingEntry.notes || '');
      setIsPartial(editingEntry.is_partial || false);
    } else {
      // Default to today's date in local time
      const today = new Date().toISOString().split('T')[0];
      setDate(today);
      setOdometer('');
      setLiters('');
      setAmountPaid('');
      setNotes('');
      setIsPartial(false);
    }
    setError('');
  }, [editingEntry, isOpen]);

  // Calculate past average mileage dynamically from existing entries
  const pastAvg = React.useMemo(() => {
    if (existingEntries.length === 0) return 12.5; // fallback
    const computed = calculateEntries(existingEntries);
    if (computed.length === 0) return 12.5;
    // Find the last computed entry with a valid running average
    const lastWithAvg = [...computed].reverse().find(e => e.runningAverageMileage && e.runningAverageMileage > 0);
    return lastWithAvg?.runningAverageMileage || 12.5;
  }, [existingEntries]);

  // Calculate dynamic range preview
  const enteredLiters = parseFloat(liters) || 0;
  const estimatedRefillRange = enteredLiters * pastAvg;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const odoNum = parseInt(odometer, 10);
    const litNum = parseFloat(liters);
    const amountNum = parseFloat(amountPaid);

    // 1. Basic validation
    if (isNaN(odoNum) || odoNum < 0) {
      setError('Please provide a valid, non-negative odometer reading.');
      return;
    }
    if (isNaN(litNum) || litNum <= 0) {
      setError('Liters filled must be greater than zero.');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount paid must be greater than zero.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }

    // 2. Advanced odometer validation (must be greater than previous chrono entry)
    const validation = validateOdometer(odoNum, date, editingEntry?.id, existingEntries);
    if (!validation.isValid) {
      setError(validation.error || 'Odometer reading is chronological out of bounds.');
      return;
    }

    setLoading(true);
    try {
      await onSave({
        id: editingEntry?.id,
        date,
        odometer: odoNum,
        liters: litNum,
        amount_paid: amountNum,
        notes: notes.trim(),
        is_partial: isPartial,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save entry. Please check storage status.');
    } finally {
      setLoading(false);
    }
  };

  const calculatedPricePerLiter = parseFloat(amountPaid) > 0 && parseFloat(liters) > 0
    ? (parseFloat(amountPaid) / parseFloat(liters)).toFixed(2)
    : '0.00';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Form panel body */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-white">
                {editingEntry ? 'Edit Fuel Record' : 'Record Fuel Fill-up'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {editingEntry ? 'Update transaction details' : 'Enter a new cash or card refill'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form scrollable container */}
          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1 pb-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs leading-relaxed">
                {error}
              </div>
            )}

            {/* Date input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                Fill-up Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

             {/* Odometer reading */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                Odometer Reading (KM)
              </label>
              <input
                type="number"
                pattern="[0-9]*"
                inputMode="numeric"
                required
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="e.g. 52400"
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Must be higher than preceding entries. Helps calculate travel distance.
              </span>
            </div>

            {/* Refill Type Toggle (Full Tank vs Top-up) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Refill Type
              </label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPartial(false)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !isPartial
                      ? 'bg-cyan-500 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Full Tank
                </button>
                <button
                  type="button"
                  onClick={() => setIsPartial(true)}
                  className={`h-9 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isPartial
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Top-up / Partial
                </button>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">
                {!isPartial 
                  ? 'Fills tank fully to calculate exact segment mileage.' 
                  : 'Does not fill tank fully; exact block averages are resolved on your next Full refill.'}
              </span>
            </div>

            {/* Double grid for Liters and Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  Liters Filled
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="e.g. 35.5"
                  className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                  Amount Paid (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="e.g. 3450"
                  className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Price-per-liter prediction */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 py-2 text-xs flex items-center justify-between text-slate-400 shrink-0">
              <span>Calculated Fuel Rate:</span>
              <span className="font-mono text-cyan-400 font-bold text-sm">
                ₹{calculatedPricePerLiter}/L
              </span>
            </div>

            {/* Live estimated range prediction banner */}
            {enteredLiters > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-slate-200 space-y-1"
              >
                <div className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                  Estimated Vehicle Range
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-white font-mono">
                    ~ {Math.round(estimatedRefillRange)} km
                  </span>
                  <span className="text-[10px] text-emerald-400">possible drive distance</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Based on your historical average mileage of <span className="text-emerald-400 font-bold font-mono">{pastAvg.toFixed(2)} km/l</span>.
                </p>
              </motion.div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Clipboard className="w-3.5 h-3.5 text-cyan-400" />
                Notes / Fuel Station (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Indian Oil, highway gas bar, full tank"
                rows={1.5}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 mt-2 bg-cyan-500 hover:bg-cyan-450 text-white font-semibold rounded-xl text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingEntry ? 'Update Fuel Record' : 'Save Fuel Record'}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
