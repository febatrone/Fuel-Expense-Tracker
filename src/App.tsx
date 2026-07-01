import React, { useState, useEffect } from 'react';
import { FuelEntry, CalculatedEntry, DateFilter, Vehicle, DailyRunLog, SavedRoute } from './types';
import { DbService, isSupabaseConfigured } from './utils/db';
import { calculateEntries, getPresetDateRange } from './utils/calc';
import { getAdminConfig, isSessionAuthenticated, clearAuthSession, updateActivityTimestamp, getSessionUsername } from './utils/auth';

// Component imports
import AdminSetup from './components/AdminSetup';
import Login from './components/Login';
import FuelEntryForm from './components/FuelEntryForm';
import DashboardTab from './components/DashboardTab';
import DailyTrackerTab from './components/DailyTrackerTab';
import EntriesTab from './components/EntriesTab';
import SettingsTab from './components/SettingsTab';
import { getDemoData } from './utils/demoData';
import { ConfirmModal } from './components/ConfirmModal';

// Lucid Icons
import { LayoutDashboard, BarChart2, Compass, Settings, LogOut, Radio, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Authentication states
  const [hasAdminConfig, setHasAdminConfig] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<string>('');

  // Primary operational states
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyRunLog[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    const saved = localStorage.getItem('fuel_tracker_vehicles');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      { id: 'vehicle_1', name: 'Honda Civic', model: 'Sedan', capacity: 50, fuelType: 'Petrol' },
      { id: 'vehicle_2', name: 'Yamaha MT-15', model: 'Bike', capacity: 10, fuelType: 'Petrol' },
      { id: 'vehicle_3', name: 'Tata Nexon', model: 'CNG SUV', capacity: 60, fuelType: 'CNG' },
    ];
  });
  const [activeVehicleId, setActiveVehicleId] = useState<string>(() => {
    return localStorage.getItem('fuel_tracker_active_vehicle') || 'vehicle_1';
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'daily_tracker' | 'entries' | 'settings'>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Synchronize dynamic lists to storage
  useEffect(() => {
    localStorage.setItem('fuel_tracker_vehicles', JSON.stringify(vehicles));
    if (vehicles.length > 0 && !vehicles.some(v => v.id === activeVehicleId)) {
      setActiveVehicleId(vehicles[0].id);
    }
  }, [vehicles, activeVehicleId]);

  useEffect(() => {
    localStorage.setItem('fuel_tracker_active_vehicle', activeVehicleId);
  }, [activeVehicleId]);

  const vehiclesEntries = React.useMemo(() => {
    return entries.filter(e => (e.vehicle_id || 'vehicle_1') === activeVehicleId);
  }, [entries, activeVehicleId]);

  const calculatedEntries = React.useMemo(() => {
    return calculateEntries(vehiclesEntries);
  }, [vehiclesEntries]);

  // Filter criteria defaulting to "current_year" for beautiful historic data view
  const [filter, setFilter] = useState<DateFilter>(() => {
    const today = new Date();
    const format = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${r}`;
    };
    const firstDay = format(new Date(today.getFullYear(), 0, 1));
    const lastDay = format(new Date(today.getFullYear(), 11, 31));
    return {
      preset: 'current_year',
      startDate: firstDay,
      endDate: lastDay
    };
  });

  // Modal dialog triggers
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FuelEntry | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Synchronize on mount: Check config and session existence securely
  useEffect(() => {
    const checkSecurityState = () => {
      const config = getAdminConfig();
      setHasAdminConfig(!!config);

      const sess = isSessionAuthenticated();
      setIsAuthenticated(sess);
      if (sess) {
        const username = getSessionUsername() || config?.username || 'admin';
        setCurrentUser(username);
        loadData(username);
      } else {
        setLoading(false);
      }
    };

    checkSecurityState();
  }, []);

  // Secure activity watchdog for the 30-minute auto-logout rule
  useEffect(() => {
    if (!isAuthenticated) return;

    // Reset timer on key user interactions
    const resetTimer = () => {
      updateActivityTimestamp();
    };

    const docEvents = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    docEvents.forEach((evt) => {
      window.addEventListener(evt, resetTimer);
    });

    // Check timer every 10 seconds of session lifespan
    const intervalId = setInterval(() => {
      const isStillValid = isSessionAuthenticated();
      if (!isStillValid) {
        setIsAuthenticated(false);
        setCurrentUser('');
        setEntries([]);
        alert('Your admin session has automatically expired after 30 minutes of inactivity. Please sign in again.');
      }
    }, 10000);

    return () => {
      docEvents.forEach((evt) => {
        window.removeEventListener(evt, resetTimer);
      });
      clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  // Load database and execute chronological metrics calculation loop
  const loadData = async (user?: string) => {
    const activeUser = user || currentUser;
    if (!activeUser) return;
    setLoading(true);
    setIsSyncing(true);
    try {
      const dbRecords = await DbService.getEntries(activeUser);
      setEntries(dbRecords);
      const dbVehicles = await DbService.getVehicles(activeUser);
      setVehicles(dbVehicles);
      
      const dbDailyLogs = await DbService.getDailyLogs(activeUser);
      setDailyLogs(dbDailyLogs);

      const dbRoutes = await DbService.getSavedRoutes(activeUser);
      if (dbRoutes.length > 0) {
        setSavedRoutes(dbRoutes);
      } else {
        // Preset default routes if database has none
        const defaults = [
          { id: 'route_1', name: 'Office Commute', distance: 18.5, isRoundTrip: true, vehicle_id: activeVehicleId },
          { id: 'route_2', name: 'University Campus', distance: 12.0, isRoundTrip: true, vehicle_id: activeVehicleId },
        ];
        setSavedRoutes(defaults);
        await DbService.saveSavedRoutes(defaults, activeUser);
      }
    } catch (e) {
      console.error('Error loading fuel logs database:', e);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  const handleUpdateVehicles = async (updatedList: Vehicle[]) => {
    setVehicles(updatedList);
    setIsSyncing(true);
    try {
      await DbService.saveVehicles(updatedList, currentUser);
    } catch (e) {
      console.error('Error saving vehicles:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateDailyLogs = async (updatedLogs: DailyRunLog[]) => {
    setDailyLogs(updatedLogs);
    setIsSyncing(true);
    try {
      await DbService.saveDailyLogs(updatedLogs, currentUser);
    } catch (e) {
      console.error('Error saving daily runs:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateSavedRoutes = async (updatedRoutes: SavedRoute[]) => {
    setSavedRoutes(updatedRoutes);
    setIsSyncing(true);
    try {
      await DbService.saveSavedRoutes(updatedRoutes, currentUser);
    } catch (e) {
      console.error('Error saving routes:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSetupComplete = () => {
    setHasAdminConfig(true);
    setIsAuthenticated(true);
    const username = getAdminConfig()?.username || 'admin';
    setCurrentUser(username);
    loadData(username);
  };

  const handleLoginSuccess = (usr: string) => {
    setIsAuthenticated(true);
    setCurrentUser(usr);
    loadData(usr);
  };

  const handleLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  const handleConfirmLogout = () => {
    clearAuthSession();
    setIsAuthenticated(false);
    setCurrentUser('');
    setEntries([]);
  };

  // CRUD operation: ADD or EDIT Save handlers
  const handleSaveEntry = async (entryData: Omit<FuelEntry, 'id' | 'price_per_liter'> & { id?: string }) => {
    setIsSyncing(true);
    try {
      if (entryData.id) {
        // EDIT: Update existing entry
        const existing = entries.find(e => e.id === entryData.id);
        if (!existing) throw new Error('Target record not found.');
        const finalEntry: FuelEntry = {
          ...existing,
          date: entryData.date,
          odometer: entryData.odometer,
          liters: entryData.liters,
          amount_paid: entryData.amount_paid,
          notes: entryData.notes,
          vehicle_id: entryData.vehicle_id || existing.vehicle_id || activeVehicleId,
          price_per_liter: Number((entryData.amount_paid / entryData.liters).toFixed(3))
        };
        await DbService.updateEntry(finalEntry, currentUser);
      } else {
        // ADD: Append new entry
        const finalEntry = {
          ...entryData,
          vehicle_id: activeVehicleId,
        };
        await DbService.addEntry(finalEntry, currentUser);
      }
    } catch (e) {
      console.error('Error saving entry:', e);
    } finally {
      setIsSyncing(false);
    }
    // Adheres strictly to: Recalculate everything from scratch on edit state changes
    await loadData();
  };

  // CRUD Operation: delete transaction ID
  const handleDeleteEntry = async (id: string) => {
    setIsSyncing(true);
    try {
      await DbService.deleteEntry(id, currentUser);
    } catch (e) {
      console.error('Error deleting entry:', e);
    } finally {
      setIsSyncing(false);
    }
    // Adheres strictly to: Recalculate everything from scratch on delete state changes
    await loadData();
  };

  // CRUD Operation: JSON manual file restore
  const handleImportBackup = async (importedList: FuelEntry[]) => {
    setIsSyncing(true);
    try {
      await DbService.importBackup(importedList, currentUser);
    } catch (e) {
      console.error('Error importing backup:', e);
    } finally {
      setIsSyncing(false);
    }
    // Recalculate everything
    await loadData();
  };

  const handleLoadDemoData = async () => {
    setIsSyncing(true);
    try {
      const data = getDemoData(currentUser);
      
      // 1. Bulk import entries
      await DbService.importBackup(data.entries, currentUser);
      
      // 2. Save vehicle garage
      await DbService.saveVehicles(data.vehicles, currentUser);
      
      // 3. Save daily commute runs & routes
      await DbService.saveDailyLogs(data.dailyLogs, currentUser);
      
      const defaultRoutes = [
        { id: 'route_1', name: 'Office Commute', distance: 18.5, isRoundTrip: true, vehicle_id: activeVehicleId },
        { id: 'route_2', name: 'University Campus', distance: 12.0, isRoundTrip: true, vehicle_id: activeVehicleId },
      ];
      await DbService.saveSavedRoutes(defaultRoutes, currentUser);
      
      // Recalculate and load
      await loadData();
    } catch (e) {
      console.error('Error loading demo data:', e);
      throw e;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingEntry(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (e: FuelEntry) => {
    setEditingEntry(e);
    setIsFormOpen(true);
  };

  // Guard 1: On-boarding wizard trigger
  if (!hasAdminConfig) {
    return <AdminSetup onComplete={handleSetupComplete} />;
  }

  // Guard 2: Login form barrier
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* BACKGROUND DECORATIVE GLOW */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.04),transparent_50%)] pointer-events-none z-0" />

      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/10">
              <Compass className="w-4.5 h-4.5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-white tracking-tight">FUEL TRACKER</span>
                {isSyncing && isSupabaseConfigured && (
                  <span className="inline-flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full text-[9px] font-mono leading-none animate-pulse">
                    <span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
                    <span>Syncing...</span>
                  </span>
                )}
              </div>
              <p className="text-[9px] text-slate-500 mt-0.5 leading-none uppercase font-mono font-bold">Mileage Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick status badge */}
            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 font-semibold pr-1 select-all">
              @{currentUser}
            </span>

            {/* Logout trigger */}
            <button
              onClick={handleLogout}
              title="Lock Admin Control"
              className="p-2 bg-slate-950 border border-slate-800 hover:border-rose-900 rounded-xl text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT BODY CONTAINER */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-24 z-10 overflow-y-auto">
        {loading ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
            <span className="text-xs text-slate-500 font-mono">Synthesizing logs...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* VEHICLE PICKER RAIL */}
            <div className="bg-slate-900 border border-slate-800/80 p-1 rounded-2xl flex gap-1.5 overflow-x-auto scrollbar-none snap-x relative z-10 scroll-smooth">
              {vehicles.map((v) => {
                const isSelected = v.id === activeVehicleId;
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveVehicleId(v.id)}
                    className={`flex-shrink-0 w-[110px] snap-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 select-none ${
                      isSelected
                        ? 'bg-gradient-to-br from-cyan-500 to-teal-500 text-white font-bold shadow-md shadow-cyan-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850 bg-slate-950/20'
                    }`}
                  >
                    <span className="text-[11px] font-black truncate w-full px-1 text-center leading-tight">{v.name}</span>
                    <span className={`text-[8px] font-mono tracking-wider transition-colors ${isSelected ? 'text-cyan-200' : 'text-slate-500'}`}>
                      {v.model || 'Other'} ({v.capacity}L)
                    </span>
                    <span className={`text-[8px] uppercase font-bold px-1 rounded scale-90 ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-950/60 text-slate-400'}`}>
                      {v.fuelType}
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'dashboard' && (
                  <DashboardTab
                    entries={vehiclesEntries}
                    calculatedEntries={calculatedEntries}
                    allEntries={entries}
                    vehicles={vehicles}
                    dailyLogs={dailyLogs}
                    filter={filter}
                    setFilter={setFilter}
                    onOpenAddModal={handleOpenAddModal}
                    activeVehicleId={activeVehicleId}
                  />
                )}
                {activeTab === 'daily_tracker' && (
                  <DailyTrackerTab
                    entries={entries}
                    calculatedEntries={calculatedEntries}
                    vehicles={vehicles}
                    activeVehicleId={activeVehicleId}
                    setActiveVehicleId={setActiveVehicleId}
                    username={currentUser}
                    dailyLogs={dailyLogs}
                    onUpdateDailyLogs={handleUpdateDailyLogs}
                    savedRoutes={savedRoutes}
                    onUpdateSavedRoutes={handleUpdateSavedRoutes}
                  />
                )}
                {activeTab === 'entries' && (
                  <EntriesTab
                    entries={vehiclesEntries}
                    calculatedEntries={calculatedEntries}
                    onEditEntry={handleEditClick}
                    onDeleteEntry={handleDeleteEntry}
                    onOpenAddModal={handleOpenAddModal}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsTab
                    entries={entries}
                    calculatedEntries={calculatedEntries}
                    onImportBackup={handleImportBackup}
                    username={currentUser}
                    vehicles={vehicles}
                    onUpdateVehicles={handleUpdateVehicles}
                    onLoadDemoData={handleLoadDemoData}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* FLOAT POPUP OR DRAWER DIALOG PANEL */}
      <FuelEntryForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveEntry}
        editingEntry={editingEntry}
        existingEntries={vehiclesEntries}
      />

      {/* BOTTOM NAVIGATION TAB BAR */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/80 pb-safe-offset">
        <div className="max-w-5xl mx-auto grid grid-cols-4 h-[64px] items-center text-center px-4">
          {/* Tab 1: Console */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === 'dashboard' ? 'text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            <span className="text-[10px] mt-1 tracking-wide">Console</span>
          </button>

          {/* Tab 2: Daily Tracker */}
          <button
            onClick={() => setActiveTab('daily_tracker')}
            className={`flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === 'daily_tracker' ? 'text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Navigation className="w-5 h-5 shrink-0 rotate-45" />
            <span className="text-[10px] mt-1 tracking-wide">Daily Run</span>
          </button>

          {/* Tab 4: ReceiptsLog */}
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === 'entries' ? 'text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Compass className="w-5 h-5 shrink-0" />
            <span className="text-[10px] mt-1 tracking-wide">History</span>
          </button>

          {/* Tab 5: Database/Settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center h-full transition-all cursor-pointer ${
              activeTab === 'settings' ? 'text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span className="text-[10px] mt-1 tracking-wide">System</span>
          </button>
        </div>
      </nav>

      {/* Safe dialog replacement for iframe controls */}
      <ConfirmModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Lock Console"
        message="Are you sure you want to lock the control panel and end your active admin session?"
        confirmText="Lock Session"
        cancelText="Keep Logged In"
        type="warning"
      />
    </div>
  );
}
