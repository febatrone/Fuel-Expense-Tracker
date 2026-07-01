import React, { useState, useMemo, useEffect } from 'react';
import { Vehicle, FuelEntry, CalculatedEntry, DailyRunLog, SavedRoute } from '../types';
import { calculateOverallMetrics } from '../utils/calc';
import { 
  Navigation, 
  MapPin, 
  Calculator, 
  Calendar, 
  Plus, 
  Trash2, 
  History, 
  TrendingUp, 
  Gauge, 
  Coins, 
  ArrowRight, 
  CheckCircle, 
  Droplets, 
  Car, 
  Info,
  Route
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const PRESET_CATEGORIES = ['Office', 'University', 'Personal', 'Business', 'Grocery'];

interface DailyTrackerTabProps {
  entries: FuelEntry[];
  calculatedEntries: CalculatedEntry[];
  vehicles: Vehicle[];
  activeVehicleId: string;
  setActiveVehicleId: (id: string) => void;
  username: string;
  dailyLogs: DailyRunLog[];
  onUpdateDailyLogs: (logs: DailyRunLog[]) => void;
  savedRoutes: SavedRoute[];
  onUpdateSavedRoutes: (routes: SavedRoute[]) => void;
}

export default function DailyTrackerTab({
  entries,
  calculatedEntries,
  vehicles,
  activeVehicleId,
  setActiveVehicleId,
  username,
  dailyLogs,
  onUpdateDailyLogs,
  savedRoutes,
  onUpdateSavedRoutes,
}: DailyTrackerTabProps) {
  // Current date in YYYY-MM-DD
  const todayStr = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const r = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  }, []);

  // savedRoutes and onUpdateSavedRoutes are received from props to enable automatic database synchronization

  // Form states for adding a saved route
  const [showAddRouteForm, setShowAddRouteForm] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteDistance, setNewRouteDistance] = useState('');
  const [newRouteIsRoundTrip, setNewRouteIsRoundTrip] = useState(true);
  const [newRouteVehicleId, setNewRouteVehicleId] = useState(activeVehicleId);
  const [newRouteCategory, setNewRouteCategory] = useState('Office');
  const [customRouteCategory, setCustomRouteCategory] = useState('');
  const [showCustomRouteCategory, setShowCustomRouteCategory] = useState(false);

  // Form states for adding a daily run
  const [logMode, setLogMode] = useState<'odometer' | 'distance'>('distance');
  const [logDate, setLogDate] = useState(todayStr);
  const [logVehicleId, setLogVehicleId] = useState(activeVehicleId);
  const [directDistance, setDirectDistance] = useState('');
  const [startOdo, setStartOdo] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logCategory, setLogCategory] = useState('Office');
  const [customLogCategory, setCustomLogCategory] = useState('');
  const [showCustomLogCategory, setShowCustomLogCategory] = useState(false);
  const [isAdvancedMode, setIsAdvancedMode] = useState<boolean>(false);
  const [customMileage, setCustomMileage] = useState<string>('');
  const [customFuelPrice, setCustomFuelPrice] = useState<string>('');

  // Auto-categorize historical logs that lack a category based on their notes
  useEffect(() => {
    let migrated = false;
    const updatedLogs = dailyLogs.map(log => {
      if (!log.category) {
        migrated = true;
        const noteLower = log.notes.toLowerCase();
        if (noteLower.includes('office')) {
          return { ...log, category: 'Office' };
        } else if (noteLower.includes('university') || noteLower.includes('college') || noteLower.includes('campus')) {
          return { ...log, category: 'University' };
        } else if (noteLower.includes('grocery') || noteLower.includes('shop') || noteLower.includes('store')) {
          return { ...log, category: 'Grocery' };
        } else if (noteLower.includes('work') || noteLower.includes('business')) {
          return { ...log, category: 'Business' };
        } else {
          return { ...log, category: 'Personal' };
        }
      }
      return log;
    });

    if (migrated) {
      onUpdateDailyLogs(updatedLogs);
    }
  }, [dailyLogs, onUpdateDailyLogs]);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync route vehicle selection when active vehicle changes
  useEffect(() => {
    setNewRouteVehicleId(activeVehicleId);
    setLogVehicleId(activeVehicleId);
  }, [activeVehicleId]);

  // --- DERIVE VEHICLE METRICS ---
  // Get active vehicle's average mileage (KM/L) and last fuel price
  const vehicleStatsMap = useMemo(() => {
    const stats: Record<string, { averageMileage: number; lastFuelPrice: number; defaultMileage: number; defaultPrice: number; isEstimated: boolean }> = {};

    vehicles.forEach(v => {
      // Filter entries for this specific vehicle
      const vehicleEntries = entries.filter(e => (e.vehicle_id || 'vehicle_1') === v.id);
      const vehicleCalcs = calculatedEntries.filter(e => (e.vehicle_id || 'vehicle_1') === v.id);
      
      // Calculate average mileage from actual receipts
      const metrics = calculateOverallMetrics(vehicleCalcs);
      let avgMil = metrics.averageMileage;

      // Calculate last fuel price from actual receipts
      let lastPrice = 0;
      if (vehicleEntries.length > 0) {
        const sortedEntries = [...vehicleEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        lastPrice = sortedEntries[0].price_per_liter || 0;
      }

      // Check default fallback values based on fuel type/vehicle model
      let defaultMil = v.default_mileage || 15.0; // default 15 km/L
      if (!v.default_mileage) {
        if (v.model.toLowerCase().includes('bike') || v.model.toLowerCase().includes('scoot')) {
          defaultMil = 45.0;
        } else if (v.model.toLowerCase().includes('sedan') || v.name.toLowerCase().includes('civic')) {
          defaultMil = 12.5;
        } else if (v.fuelType === 'CNG') {
          defaultMil = 22.0;
        }
      }

      const defaultPrice = v.default_fuel_price || 103.5; // default fallback fuel price in Rupees

      stats[v.id] = {
        averageMileage: avgMil > 0 ? avgMil : defaultMil,
        lastFuelPrice: lastPrice > 0 ? lastPrice : defaultPrice,
        defaultMileage: defaultMil,
        defaultPrice: defaultPrice,
        isEstimated: avgMil === 0 || lastPrice === 0
      };
    });

    return stats;
  }, [vehicles, entries, calculatedEntries]);

  // Find the last logged odometer for a vehicle from BOTH Fuel Entries and Daily Logs
  const lastOdometerForVehicle = useMemo(() => {
    const lastOdos: Record<string, number> = {};

    vehicles.forEach(v => {
      // 1. Get from fuel entries
      const vehicleFuelEntries = entries.filter(e => (e.vehicle_id || 'vehicle_1') === v.id);
      let maxFuelOdo = 0;
      if (vehicleFuelEntries.length > 0) {
        maxFuelOdo = Math.max(...vehicleFuelEntries.map(e => e.odometer));
      }

      // 2. Get from daily odo logs
      const vehicleDailyLogs = dailyLogs.filter(l => l.vehicle_id === v.id);
      let maxDailyOdo = 0;
      vehicleDailyLogs.forEach(l => {
        if (l.endOdometer) maxDailyOdo = Math.max(maxDailyOdo, l.endOdometer);
        if (l.startOdometer) maxDailyOdo = Math.max(maxDailyOdo, l.startOdometer);
      });

      lastOdos[v.id] = Math.max(maxFuelOdo, maxDailyOdo);
    });

    return lastOdos;
  }, [vehicles, entries, dailyLogs]);

  // Update start odo input when vehicle changes
  useEffect(() => {
    const lastOdo = lastOdometerForVehicle[logVehicleId];
    if (lastOdo > 0) {
      setStartOdo(String(lastOdo));
    } else {
      setStartOdo('');
    }
  }, [logVehicleId, lastOdometerForVehicle]);

  // --- CALCULATORS ---
  const currentVehicleStats = vehicleStatsMap[logVehicleId] || { averageMileage: 15, lastFuelPrice: 100, isEstimated: true };

  // Sync custom inputs when vehicle stats or logVehicleId changes
  useEffect(() => {
    if (currentVehicleStats) {
      setCustomMileage(String(currentVehicleStats.averageMileage));
      setCustomFuelPrice(String(currentVehicleStats.lastFuelPrice));
    }
  }, [logVehicleId, vehicleStatsMap]);

  // Calculate live estimates for the manual daily run form
  const liveCalculation = useMemo(() => {
    let distance = 0;
    if (logMode === 'distance') {
      distance = Number(directDistance) || 0;
    } else {
      const s = Number(startOdo) || 0;
      const e = Number(endOdo) || 0;
      distance = Math.max(0, e - s);
    }

    const avgMil = isAdvancedMode ? (Number(customMileage) || 0) : currentVehicleStats.averageMileage;
    const price = isAdvancedMode ? (Number(customFuelPrice) || 0) : currentVehicleStats.lastFuelPrice;

    const estimatedLiters = avgMil > 0 ? Number((distance / avgMil).toFixed(3)) : 0;
    const estimatedCost = Number((estimatedLiters * price).toFixed(2));

    return {
      distance,
      estimatedLiters,
      estimatedCost,
      avgMil,
      price
    };
  }, [logMode, directDistance, startOdo, endOdo, currentVehicleStats, isAdvancedMode, customMileage, customFuelPrice]);

  // --- ACTIONS ---
  // Save a new custom route
  const handleAddRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteName.trim() || !newRouteDistance || Number(newRouteDistance) <= 0) {
      setErrorMsg('Please enter a valid route name and distance.');
      return;
    }

    const finalCategory = showCustomRouteCategory ? customRouteCategory.trim() : newRouteCategory;
    const route: SavedRoute = {
      id: `route_${Date.now()}`,
      name: newRouteName.trim(),
      distance: Number(newRouteDistance),
      isRoundTrip: newRouteIsRoundTrip,
      vehicle_id: newRouteVehicleId,
      category: finalCategory || 'Other'
    };

    onUpdateSavedRoutes([...savedRoutes, route]);
    setNewRouteName('');
    setNewRouteDistance('');
    setCustomRouteCategory('');
    setShowCustomRouteCategory(false);
    setShowAddRouteForm(false);
    triggerSuccess('Saved route added successfully!');
  };

  // Delete a saved route
  const handleDeleteRoute = (id: string) => {
    onUpdateSavedRoutes(savedRoutes.filter(r => r.id !== id));
    triggerSuccess('Route deleted.');
  };

  // Log a trip directly from the saved route fast list
  const handleLogRouteRun = (route: SavedRoute) => {
    const stats = vehicleStatsMap[route.vehicle_id] || { averageMileage: 15, lastFuelPrice: 100 };
    const distance = route.isRoundTrip ? route.distance * 2 : route.distance;
    const estLiters = stats.averageMileage > 0 ? Number((distance / stats.averageMileage).toFixed(3)) : 0;
    const estCost = Number((estLiters * stats.lastFuelPrice).toFixed(2));

    const newLog: DailyRunLog = {
      id: `run_${Date.now()}`,
      date: todayStr,
      vehicle_id: route.vehicle_id,
      mode: 'distance',
      distance: distance,
      estimatedLiters: estLiters,
      estimatedCost: estCost,
      notes: `${route.name} (${route.isRoundTrip ? 'Round Trip' : 'One Way'})`,
      category: route.category || 'Office',
      created_at: new Date().toISOString()
    };

    onUpdateDailyLogs([newLog, ...dailyLogs]);
    triggerSuccess(`Logged ${distance} km run for ${route.name}!`);
  };

  // Save custom daily mileage run
  const handleSaveDailyLog = (e: React.FormEvent) => {
    e.preventDefault();

    const dist = liveCalculation.distance;
    if (dist <= 0) {
      setErrorMsg('Please enter a valid distance run greater than 0.');
      return;
    }

    if (logMode === 'odometer') {
      const s = Number(startOdo) || 0;
      const e = Number(endOdo) || 0;
      if (e <= s) {
        setErrorMsg('Ending odometer must be strictly greater than starting odometer.');
        return;
      }
    }

    const finalCategory = showCustomLogCategory ? customLogCategory.trim() : logCategory;
    const newLog: DailyRunLog = {
      id: `run_${Date.now()}`,
      date: logDate,
      vehicle_id: logVehicleId,
      mode: logMode,
      startOdometer: logMode === 'odometer' ? Number(startOdo) : undefined,
      endOdometer: logMode === 'odometer' ? Number(endOdo) : undefined,
      distance: dist,
      estimatedLiters: liveCalculation.estimatedLiters,
      estimatedCost: liveCalculation.estimatedCost,
      notes: logNotes.trim() || 'Daily Driving Run',
      customMileage: isAdvancedMode ? (Number(customMileage) || undefined) : undefined,
      customFuelPrice: isAdvancedMode ? (Number(customFuelPrice) || undefined) : undefined,
      category: finalCategory || 'Other',
      created_at: new Date().toISOString()
    };

    onUpdateDailyLogs([newLog, ...dailyLogs]);
    
    // Reset form fields
    setDirectDistance('');
    setEndOdo('');
    setLogNotes('');
    setCustomLogCategory('');
    setShowCustomLogCategory(false);
    
    // Auto update start odo to the new end odo for seamless next logging
    if (logMode === 'odometer') {
      setStartOdo(endOdo);
    }

    triggerSuccess('Daily driving run logged successfully!');
  };

  // Delete a daily log entry
  const handleDeleteLog = (id: string) => {
    onUpdateDailyLogs(dailyLogs.filter(l => l.id !== id));
    triggerSuccess('Daily log deleted.');
  };

  // Helper trigger for alerts
  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // --- HISTORIC TOTALS CALCULATIONS ---
  const totals = useMemo(() => {
    let totalKm = 0;
    let totalL = 0;
    let totalSpent = 0;

    dailyLogs.forEach(log => {
      totalKm += log.distance;
      totalL += log.estimatedLiters;
      totalSpent += log.estimatedCost;
    });

    return {
      totalDistance: Number(totalKm.toFixed(1)),
      totalLiters: Number(totalL.toFixed(2)),
      totalCost: Number(totalSpent.toFixed(2)),
    };
  }, [dailyLogs]);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wider font-mono">Commute & Route Tracker</span>
          <h1 className="text-2xl font-black text-white mt-0.5 tracking-tight">Daily Runs & Trip Cost Calculator</h1>
          <p className="text-xs text-slate-400 mt-1">
            Calculate exactly how much fuel and money is spent on regular trips (office, university) and log daily odometer coordinates dynamically.
          </p>
        </div>
      </div>

      {/* FEEDBACK MESSAGES */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl text-xs flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2"
          >
            <Info className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BENTO STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-cyan-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Logged Commute Run</p>
              <p className="text-2xl font-black text-white mt-1">{totals.totalDistance} <span className="text-xs text-slate-400 font-normal">km</span></p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-teal-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Est. Fuel Consumed</p>
              <p className="text-2xl font-black text-white mt-1">{totals.totalLiters} <span className="text-xs text-slate-400 font-normal">Liters</span></p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Est. Money Spent</p>
              <p className="text-2xl font-black text-white mt-1">₹{totals.totalCost}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: SAVED ROUTES & FASTRACK ACTIONS */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Route className="w-4.5 h-4.5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">Saved Routes / Trips</h3>
              </div>
              <button
                onClick={() => setShowAddRouteForm(!showAddRouteForm)}
                className="text-[10px] bg-slate-950 hover:bg-slate-800 text-cyan-400 font-bold font-mono py-1 px-2.5 rounded-lg border border-slate-800 hover:border-cyan-500/30 transition-all flex items-center gap-1 cursor-pointer"
              >
                {showAddRouteForm ? 'Close' : 'Add Trip'}
              </button>
            </div>

            {/* ADD ROUTE FORM */}
            <AnimatePresence>
              {showAddRouteForm && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleAddRoute}
                  className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-3 overflow-hidden text-xs"
                >
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Route Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Office, University, Gym"
                      value={newRouteName}
                      onChange={(e) => setNewRouteName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">One-Way Distance (km)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 15"
                        value={newRouteDistance}
                        onChange={(e) => setNewRouteDistance(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Log Distance As</label>
                      <select
                        value={newRouteIsRoundTrip ? 'true' : 'false'}
                        onChange={(e) => setNewRouteIsRoundTrip(e.target.value === 'true')}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="true">Round Trip (2x km)</option>
                        <option value="false">One Way (1x km)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Default Vehicle</label>
                    <select
                      value={newRouteVehicleId}
                      onChange={(e) => setNewRouteVehicleId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.name} ({v.model})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Trip Category</label>
                    {showCustomRouteCategory ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Type custom category..."
                          value={customRouteCategory}
                          onChange={(e) => setCustomRouteCategory(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowCustomRouteCategory(false);
                            setCustomRouteCategory('');
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {PRESET_CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewRouteCategory(cat)}
                            className={`text-[9px] px-2 py-1 rounded transition-colors border cursor-pointer select-none ${
                              newRouteCategory === cat
                                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setShowCustomRouteCategory(true)}
                          className="text-[9px] px-2 py-1 rounded bg-slate-900 border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 cursor-pointer select-none"
                        >
                          + Custom
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Save Trip Route
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* ROUTE LIST & COST ESTIMATORS */}
            <div className="space-y-3">
              {savedRoutes.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 font-mono">
                  No saved routes yet. Add custom trip to quick-calculate.
                </div>
              ) : (
                savedRoutes.map((route) => {
                  const rVehicle = vehicles.find(v => v.id === route.vehicle_id) || vehicles[0] || { name: 'Vehicle' };
                  const stats = vehicleStatsMap[route.vehicle_id] || { averageMileage: 15, lastFuelPrice: 100, isEstimated: true };
                  const actualDistance = route.isRoundTrip ? route.distance * 2 : route.distance;
                  const fuelRequired = stats.averageMileage > 0 ? actualDistance / stats.averageMileage : 0;
                  const estimatedCost = fuelRequired * stats.lastFuelPrice;

                  return (
                    <div 
                      key={route.id}
                      className="bg-slate-950 p-3 rounded-xl border border-slate-850/80 hover:border-slate-805 transition-all flex flex-col justify-between gap-2.5 relative group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-xs font-black text-white">{route.name}</h4>
                          <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                            <Car className="w-3 h-3 text-cyan-500" />
                            {rVehicle.name} • {actualDistance} km ({route.isRoundTrip ? 'Round Trip' : 'One Way'})
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteRoute(route.id)}
                          className="p-1 text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                          title="Delete route"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* ESTIMATED TRIP REFILL COST DISPLAY */}
                      <div className="bg-slate-900 px-2 py-1.5 rounded-lg grid grid-cols-2 text-center text-[10px] border border-slate-850">
                        <div className="border-r border-slate-800">
                          <p className="text-[8px] font-mono font-bold uppercase text-slate-500">Est. Fuel Used</p>
                          <p className="font-bold text-slate-300 mt-0.5">{fuelRequired.toFixed(2)} Liters</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-mono font-bold uppercase text-slate-500">Est. Cost</p>
                          <p className="font-bold text-amber-400 mt-0.5">₹{estimatedCost.toFixed(2)}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleLogRouteRun(route)}
                        className="w-full py-1.5 px-2 bg-cyan-950/40 hover:bg-cyan-500/20 text-[10px] text-cyan-400 hover:text-white border border-cyan-500/20 hover:border-cyan-500/50 rounded-lg font-bold font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Navigation className="w-3 h-3 shrink-0" />
                        Log Commute Done Today
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 text-[10px] text-slate-400 flex gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-300">How is this calculated?</p>
                <p className="mt-0.5 leading-relaxed">
                  Based on each vehicle's actual past average mileage (KM/L) from fuel log entries, multiplied by the latest recorded price per liter. If no logs exist, it falls back to a smart vehicle default mileage and price.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: MANUAL DAILY ODOMETER / MILEAGE RUN LOGGER */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-4.5 h-4.5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">Log Daily Run (Manual Entry)</h3>
            </div>

            <form onSubmit={handleSaveDailyLog} className="space-y-4 text-xs">
              
              {/* VEHICLE & DATE SELECTORS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Select Vehicle</label>
                  <select
                    value={logVehicleId}
                    onChange={(e) => setLogVehicleId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  >
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.fuelType})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Run Date</label>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* LOGGING MODE TABS */}
              <div>
                <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1.5">Logging Mode</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                  <button
                    type="button"
                    onClick={() => setLogMode('distance')}
                    className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      logMode === 'distance'
                        ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Direct Distance (km Run)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogMode('odometer')}
                    className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      logMode === 'odometer'
                        ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Daily Odometer Readings
                  </button>
                </div>
              </div>

              {/* DYNAMIC INPUTS BASED ON MODE */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-850/80">
                {logMode === 'distance' ? (
                  <div>
                    <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Direct Distance Run (km)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Enter how many km vehicle was run"
                      value={directDistance}
                      onChange={(e) => setDirectDistance(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">E.g., enter 24 to log a 24 km daily university run directly.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Start Odometer (km)</label>
                        <input
                          type="number"
                          placeholder="e.g. 10245"
                          value={startOdo}
                          onChange={(e) => setStartOdo(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                        <p className="text-[9px] text-slate-500 mt-0.5">Defaults to last known odometer.</p>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">End Odometer (km)</label>
                        <input
                          type="number"
                          placeholder="e.g. 10285"
                          value={endOdo}
                          onChange={(e) => setEndOdo(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    {Number(endOdo) > 0 && Number(startOdo) > 0 && (
                      <div className="text-[10px] text-cyan-400 font-mono flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5" />
                        Calculated distance run: {Math.max(0, Number(endOdo) - Number(startOdo))} km
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ADVANCED MODE TOGGLE */}
              <div className="flex items-center justify-between bg-slate-950/40 border border-slate-850 p-3 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-white tracking-tight">Advanced Calculation Mode</span>
                  <p className="text-[10px] text-slate-500 font-medium">Manually override fuel mileage and price for this specific run.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAdvancedMode}
                    onChange={(e) => setIsAdvancedMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-focus:ring-1 peer-focus:ring-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-white" />
                </label>
              </div>

              {/* ADVANCED MODE INPUTS */}
              {isAdvancedMode && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Custom Mileage (km/L)</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 15.0"
                        value={customMileage}
                        onChange={(e) => setCustomMileage(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Custom Fuel Price (₹/L)</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 100.0"
                        value={customFuelPrice}
                        onChange={(e) => setCustomFuelPrice(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TRIP CATEGORY SELECTION */}
              <div>
                <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1.5">Trip Category</label>
                {showCustomLogCategory ? (
                  <div className="flex gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                    <input
                      type="text"
                      required
                      placeholder="Type custom category..."
                      value={customLogCategory}
                      onChange={(e) => setCustomLogCategory(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomLogCategory(false);
                        setCustomLogCategory('');
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {PRESET_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setLogCategory(cat)}
                        className={`text-xs px-3.5 py-1.5 rounded-xl transition-all border cursor-pointer select-none ${
                          logCategory === cat
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomLogCategory(true)}
                      className="text-xs px-3.5 py-1.5 rounded-xl bg-slate-950 border border-dashed border-slate-700 text-slate-450 hover:text-slate-200 hover:border-slate-500 cursor-pointer select-none"
                    >
                      + Custom
                    </button>
                  </div>
                )}
              </div>

              {/* PURPOSE / NOTES */}
              <div>
                <label className="block text-[10px] text-slate-400 font-mono font-bold uppercase mb-1">Notes / Trip Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Office run, college trip, personal leisure drive"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['Office Commute', 'University Trip', 'Personal Drive', 'Grocery Run'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLogNotes(preset)}
                      className="text-[9px] bg-slate-950 hover:bg-slate-805 text-slate-400 hover:text-white px-2 py-0.5 rounded border border-slate-850 transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* LIVE ESTIMATION PREVIEW PANEL */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-2 text-xs">
                <p className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">Live Travel Estimate Calculation</p>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-850">
                    <p className="text-[8px] text-slate-500 uppercase font-mono">Distance</p>
                    <p className="font-bold text-white text-sm mt-0.5">{liveCalculation.distance} km</p>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-850">
                    <p className="text-[8px] text-slate-500 uppercase font-mono">Avg Mileage</p>
                    <p className="font-bold text-cyan-400 text-sm mt-0.5">{liveCalculation.avgMil.toFixed(1)} km/L</p>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-850">
                    <p className="text-[8px] text-slate-500 uppercase font-mono">Est. Fuel</p>
                    <p className="font-bold text-emerald-400 text-sm mt-0.5">{liveCalculation.estimatedLiters.toFixed(2)} L</p>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-850">
                    <p className="text-[8px] text-slate-500 uppercase font-mono">Est. Cost</p>
                    <p className="font-bold text-amber-400 text-sm mt-0.5">₹{liveCalculation.estimatedCost.toFixed(2)}</p>
                  </div>
                </div>

                <p className="text-[9px] text-slate-500 font-mono italic leading-normal text-center pt-1">
                  {currentVehicleStats.isEstimated 
                    ? `* No fuel receipts yet for this vehicle. Using smart default average (${currentVehicleStats.defaultMileage} km/L) and price (₹${currentVehicleStats.defaultPrice}/L).` 
                    : `* Using real past average mileage (${liveCalculation.avgMil.toFixed(2)} km/L) & last price (₹${liveCalculation.price}/L) from fuel receipts.`
                  }
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-bold rounded-xl shadow-md shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all cursor-pointer text-center text-xs"
              >
                Log Daily Commute Run
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* BOTTOM SECTION: DAILY LOG HISTORY */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
          <History className="w-4.5 h-4.5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">Daily Driving Runs Log History</h3>
        </div>

        {dailyLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs font-mono">
            No daily logs added yet. Add a manual run above or log a saved route to track past averages.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-2">Date</th>
                  <th className="py-2.5 px-2">Vehicle</th>
                  <th className="py-2.5 px-2">Distance</th>
                  <th className="py-2.5 px-2">Est. Fuel Used</th>
                  <th className="py-2.5 px-2">Est. Rupees Spent</th>
                  <th className="py-2.5 px-2">Notes/Trip</th>
                  <th className="py-2.5 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {dailyLogs.map((log) => {
                  const logVehicle = vehicles.find(v => v.id === log.vehicle_id) || { name: 'Unknown' };
                  return (
                    <tr key={log.id} className="hover:bg-slate-950/40 transition-colors text-slate-300">
                      <td className="py-2.5 px-2 font-mono whitespace-nowrap">{log.date}</td>
                      <td className="py-2.5 px-2 font-semibold text-white">{logVehicle.name}</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-cyan-400">{log.distance} km</td>
                      <td className="py-2.5 px-2 font-mono text-emerald-400">{log.estimatedLiters.toFixed(2)} L</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-amber-400">
                        <div>₹{log.estimatedCost}</div>
                        {(log.customMileage || log.customFuelPrice) && (
                          <div className="text-[9px] text-slate-500 font-normal mt-0.5">
                            using {log.customMileage && `${log.customMileage} km/L`} {log.customFuelPrice && `@ ₹${log.customFuelPrice}`}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 max-w-[200px]" title={log.notes}>
                        <div className="flex items-center gap-1.5">
                          {log.category && (
                            <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded text-[8.5px] font-mono leading-none lowercase shrink-0">
                              {log.category}
                            </span>
                          )}
                          <span className="truncate">{log.notes}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-1 text-slate-600 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
