import React, { useState } from 'react';
import { FuelEntry, CalculatedEntry } from '../types';
import { Plus, Edit2, Trash2, Calendar, Compass, Droplets, CreditCard, Tag, Sparkles, Search, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';

interface EntriesTabProps {
  entries: FuelEntry[];
  calculatedEntries: CalculatedEntry[];
  onEditEntry: (entry: FuelEntry) => void;
  onDeleteEntry: (id: string) => void;
  onOpenAddModal: () => void;
}

export default function EntriesTab({
  entries,
  calculatedEntries,
  onEditEntry,
  onDeleteEntry,
  onOpenAddModal,
}: EntriesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; date: string } | null>(null);

  // Filter entries based on search keywords
  const filteredEntries = React.useMemo(() => {
    let result = [...calculatedEntries];

    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      result = result.filter(e => 
        (e.notes && e.notes.toLowerCase().includes(query)) ||
        e.date.includes(query) ||
        e.odometer.toString().includes(query)
      );
    }

    // Sort: default to latest first (descending)
    return result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      
      if (timeA !== timeB) {
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      }
      return sortOrder === 'desc' ? b.odometer - a.odometer : a.odometer - b.odometer;
    });
  }, [calculatedEntries, searchTerm, sortOrder]);

  const handleDeleteClick = (id: string, date: string) => {
    setDeleteTarget({ id, date });
  };

  return (
    <div className="space-y-4">
      {/* Search and Quick Action Header row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider pl-1">Fuel Log Timeline ({filteredEntries.length})</h2>
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="text-xs text-cyan-400 font-semibold cursor-pointer py-1 px-2.5 rounded bg-slate-900 border border-slate-800"
          >
            Sort: {sortOrder === 'desc' ? 'Latest First' : 'Oldest First'}
          </button>
        </div>

        {/* Search bar input with icons */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search notes, station location, dates..."
            className="w-full h-12 pl-10 pr-4 bg-slate-900 border border-slate-850 rounded-2xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-slate-950 rounded-xl flex items-center justify-center border border-slate-800 text-slate-500">
            <Compass className="w-5 h-5 line-through" />
          </div>
          <p className="text-xs text-slate-400">
            {searchTerm.trim() !== ''
              ? "No fuel transactions match your query keyword."
              : "No fuel fill-ups captured yet in historical logs."}
          </p>
          {searchTerm.trim() === '' && (
            <button
              onClick={onOpenAddModal}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-semibold text-xs rounded-lg shadow-sm cursor-pointer"
            >
              Add Your First Record
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence initial={false}>
            {filteredEntries.map((entry, idx) => {
              const hasStats = entry.distanceTravelled !== undefined && entry.mileage !== undefined;

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-3.5 relative overflow-hidden"
                >
                  {/* Decorative glow indicators for fuel efficiency */}
                  {hasStats && entry.mileage! > 0 && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500" />
                  )}

                  {/* High level date and controls row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-slate-950 text-slate-300 rounded-xl border border-slate-800/80">
                        <Calendar className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        {/* Format date gracefully */}
                        <span className="font-extrabold text-sm text-white select-all">
                          {new Date(entry.date).toLocaleDateString('default', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-500 block font-mono">
                            ID: {entry.id.substring(0, 8)}
                          </span>
                          {entry.is_partial ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8.5px] font-extrabold uppercase tracking-wide">
                              Top-up
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[8.5px] font-extrabold uppercase tracking-wide">
                              Full Tank
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons with absolute touch friendly alignment */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onEditEntry(entry)}
                        title="Edit transaction"
                        className="p-2.5 bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(entry.id, entry.date)}
                        title="Delete transaction"
                        className="p-2.5 bg-slate-950 border border-slate-850 hover:border-rose-900 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stats Grid of values paid and litters filled */}
                  <div className="grid grid-cols-3 gap-2.5 text-xs">
                    <div className="bg-slate-950 border border-slate-850/60 p-2.5 rounded-xl">
                      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-lighter flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-cyan-500" />
                        Amount (₹)
                      </span>
                      <span className="font-bold text-white block mt-0.5 font-mono select-all">
                        ₹{entry.amount_paid.toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-850/60 p-2.5 rounded-xl">
                      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-lighter flex items-center gap-1">
                        <Droplets className="w-3 h-3 text-cyan-500" />
                        Filled (L)
                      </span>
                      <span className="font-bold text-white block mt-0.5 font-mono select-all">
                        {entry.liters.toFixed(2)}L
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-850/60 p-2.5 rounded-xl">
                      <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-lighter flex items-center gap-1">
                        <Compass className="w-3 h-3 text-cyan-500" />
                        Odo (KM)
                      </span>
                      <span className="font-bold text-white block mt-0.5 font-mono select-all">
                        {entry.odometer.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Calculations breakdown strip (Mileage results) */}
                  {hasStats ? (
                    <div className="bg-cyan-500/5 border border-cyan-500/10 p-3 rounded-2xl grid grid-cols-3 gap-2 text-xs font-semibold">
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-sans">Distance Covered</span>
                        <span className="font-bold font-mono text-slate-200 block">
                          + {entry.distanceTravelled!.toLocaleString()} km
                        </span>
                      </div>
                      <div className="space-y-0.5 border-l border-cyan-500/10 pl-3">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-sans">Exact Trip Avg</span>
                        <span className={`font-black font-mono text-sm inline-flex items-center gap-1 ${
                          entry.mileage! >= 12 ? 'text-emerald-400' : 'text-cyan-400'
                        }`} title="Exact average mileage between this and previous refuel">
                          {entry.mileage!.toFixed(2)} km/l
                        </span>
                      </div>
                      <div className="space-y-0.5 border-l border-cyan-500/10 pl-3 text-right">
                        <span className="text-[9px] text-slate-100 uppercase tracking-wider block font-sans inline-flex items-center gap-1 text-right justify-end w-full">
                          <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                          Running Avg (All)
                        </span>
                        <span className="font-black font-mono text-sm text-amber-400 block">
                          {entry.runningAverageMileage ? `${entry.runningAverageMileage.toFixed(2)} km/l` : '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl text-center text-[10px] text-slate-500 font-mono">
                      // Initial log benchmark (No mileage calculated yet)
                    </div>
                  )}

                  {/* Driving Range predicted on this entry */}
                  {entry.estimatedRange !== undefined && entry.estimatedRange > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl flex items-center justify-between text-[10px] font-sans">
                      <span className="text-slate-400 flex items-center gap-1 font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        Estimated driving range on this refill:
                      </span>
                      <span className="font-mono text-emerald-400 font-black text-xs">
                        ~ {Math.round(entry.estimatedRange)} km
                      </span>
                    </div>
                  )}

                  {/* Optional Notes display */}
                  {entry.notes && (
                    <div className="p-2.5 bg-slate-950/80 border border-slate-850/80 rounded-xl text-xs text-slate-400 flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <p className="italic shrink-0 break-all select-all pr-4">{entry.notes}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Popups and interactive states */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteEntry(deleteTarget.id);
          }
        }}
        title="Delete Fuel Entry"
        message={`Are you sure you want to delete the fuel record on ${
          deleteTarget
            ? new Date(deleteTarget.date).toLocaleDateString('default', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : ''
        }? This will immediately recalculate all distance steps and active average mileages.`}
        confirmText="Yes, Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
