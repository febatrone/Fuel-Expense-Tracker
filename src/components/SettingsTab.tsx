import React, { useRef, useState } from 'react';
import { FuelEntry, CalculatedEntry, Vehicle } from '../types';
import { isSupabaseConfigured, DbService, getLocalEntries, getLocalVehicles } from '../utils/db';
import { getAdminConfig, removeUserAccount, getAllUsers, registerUser, UserAccount } from '../utils/auth';
import { hashPassword } from '../utils/crypto';
import { Download, Upload, ShieldAlert, CheckCircle, Database, HelpCircle, FileSpreadsheet, Copy, Code, HelpCircle as HelpIcon, Radio, Wrench, Fuel, Plus, Trash2, Users, UserPlus, Lock, User, UserMinus, ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';

interface SettingsTabProps {
  entries: FuelEntry[];
  calculatedEntries: CalculatedEntry[];
  onImportBackup: (imported: FuelEntry[]) => Promise<void>;
  username: string;
  vehicles: Vehicle[];
  onUpdateVehicles: (vehicles: Vehicle[]) => void;
  onLoadDemoData: () => Promise<void>;
}

export default function SettingsTab({
  entries,
  calculatedEntries,
  onImportBackup,
  username,
  vehicles,
  onUpdateVehicles,
  onLoadDemoData,
}: SettingsTabProps) {
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [isClearEntriesConfirmOpen, setIsClearEntriesConfirmOpen] = useState(false);
  const [isFactoryResetConfirmOpen, setIsFactoryResetConfirmOpen] = useState(false);
  const [activeEditVehicle, setActiveEditVehicle] = useState<string>(() => {
    return vehicles[0]?.id || 'vehicle_1';
  });
  
  // User Management State
  const [allUsers, setAllUsers] = useState<UserAccount[]>(() => getAllUsers());
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [createUserError, setCreateUserError] = useState('');
  const [createUserSuccess, setCreateUserSuccess] = useState('');
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleVehicleChange = (id: string, field: keyof Vehicle, value: string | number) => {
    const updated = vehicles.map(v => {
      if (v.id === id) {
        return {
          ...v,
          [field]: (field === 'capacity' || field === 'default_mileage' || field === 'default_fuel_price') 
            ? Number(value) || 0 
            : value,
        };
      }
      return v;
    });
    onUpdateVehicles(updated);
  };

  const handleAddVehicle = () => {
    const newId = `vehicle_${Date.now()}`;
    const newVehicle: Vehicle = {
      id: newId,
      name: `Vehicle ${vehicles.length + 1}`,
      model: 'Sedan',
      capacity: 45,
      fuelType: 'Petrol'
    };
    onUpdateVehicles([...vehicles, newVehicle]);
    setActiveEditVehicle(newId);
    setSuccessMsg('Added a new vehicle to the garage successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDeleteVehicle = (id: string) => {
    if (vehicles.length <= 1) {
      setErrorMsg('Cannot delete last vehicle. Build at least one profile.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    const filtered = vehicles.filter(v => v.id !== id);
    onUpdateVehicles(filtered);
    
    // Select another active vehicle
    const remaining = filtered[0]?.id || '';
    setActiveEditVehicle(remaining);
    setSuccessMsg('Vehicle profile deleted.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // 1. Export JSON complete database backup
  const handleExportJSON = () => {
    try {
      const dataStr = JSON.stringify(entries, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `fuel_expense_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setSuccessMsg('Complete JSON database backup downloaded successfully.');
    } catch (e) {
      setErrorMsg('Failed to generate JSON backup.');
    }
  };

  // 2. Export CSV fully compatible with Microsoft Excel (with UTF-8 BOM)
  const handleExportCSV = () => {
    try {
      const headers = [
        'ID',
        'Fill-up Date',
        'Odometer Reading (KM)',
        'Liters Filled',
        'Amount Paid (₹)',
        'Price Per Liter (₹/L)',
        'Distance Traveled (KM)',
        'Computed Mileage (KM/L)',
        'Notes / Comments'
      ];

      const rows = calculatedEntries.map(e => [
        `"${e.id}"`,
        `"${e.date}"`,
        e.odometer,
        e.liters,
        e.amount_paid,
        e.price_per_liter,
        e.distanceTravelled !== undefined ? e.distanceTravelled : '',
        e.mileage !== undefined ? e.mileage : '',
        `"${(e.notes || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      // UTF-8 BOM to make Excel open files with correct special character encoding instantly
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `fuel_tracker_mileage_report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMsg('CSV sheet report downloaded successfully. Fully compatible with Excel.');
    } catch (e) {
      setErrorMsg('Failed to compile CSV report sheet.');
    }
  };

  // 3. Import JSON backup database merges
  const handleImportJSONClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMsg('');
    setSuccessMsg('');

    const file = files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          setErrorMsg('Invalid backup file. Must be a JSON array of fuel log records.');
          return;
        }

        // Simple item check
        if (parsed.length > 0) {
          const first = parsed[0];
          if (first.odometer === undefined || first.liters === undefined || first.amount_paid === undefined) {
            setErrorMsg('Invalid schema. Log records are missing required properties.');
            return;
          }
        }

        await onImportBackup(parsed as FuelEntry[]);
        setSuccessMsg(`Restored and merged ${parsed.length} database entries. Mileage stats fully updated.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
        setErrorMsg('Failed to parse file. Please verify valid formatted JSON content.');
      }
    };

    reader.readAsText(file);
  };

  // Copy helpers
  const handleCopySQL = () => {
    navigator.clipboard.writeText(DbService.getSQLSchema());
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleCopyEnv = () => {
    const config = getAdminConfig();
    const txt = `VITE_ADMIN_USERNAME="${config?.username || username}"\nVITE_ADMIN_PASSWORD_HASH="${config?.passwordHash || ''}"`;
    navigator.clipboard.writeText(txt);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  // Administrative tasks handlers
  const handleRegisterUserFromAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserError('');
    setCreateUserSuccess('');

    const normName = newUsername.trim();
    if (!normName) {
      setCreateUserError('Username is required.');
      return;
    }

    if (newPassword.length < 6) {
      setCreateUserError('Password must be at least 6 characters.');
      return;
    }

    try {
      const pHash = await hashPassword(newPassword);
      const success = registerUser(normName, pHash);
      if (success) {
        setCreateUserSuccess(`User "${normName}" registered successfully!`);
        setNewUsername('');
        setNewPassword('');
        setAllUsers(getAllUsers());
      } else {
        setCreateUserError(`Username "${normName}" is already registered.`);
      }
    } catch (err: any) {
      setCreateUserError(err?.message || 'Error creating user account.');
    }
  };

  const handleDeleteUserConfirm = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      // 1. Fetch user's local entries & vehicles and delete them from local & cloud
      await DbService.deleteUserEntries(userToDelete);
      await DbService.deleteUserVehicles(userToDelete);
      
      // 2. Clear credentials
      removeUserAccount(userToDelete);
      
      // 3. Reload list
      setAllUsers(getAllUsers());
      setUserToDelete(null);
      setSuccessMsg(`Account for "${userToDelete}" was successfully deleted along with all vehicle profiles and fuel records.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to delete user account.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const currentAdminConfig = getAdminConfig();

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider pl-1">Configuration panel</h2>

      {/* Message alerts */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs flex items-start gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{successMsg}</div>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* SECTION 1: STORAGE CONTEXT (SUPABASE CLOUD CODES) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Database Engine</h3>
          </div>
          <span className={`text-[10px] uppercase font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold ${
            isSupabaseConfigured
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-orange-500/10 border border-orange-500/20 text-orange-400'
          }`}>
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            {isSupabaseConfigured ? 'Supabase Connected' : 'Offline LocalStorage'}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          {isSupabaseConfigured
            ? 'The app is successfully connected to your Supabase Cloud cluster. All data operations are securely synced directly in real-time.'
            : 'Operational in client-side Sandbox mode. Data is stored in your secure local web storage. To build a cloud database backend, click copy SQL schema and supply the environment keys.'}
        </p>

        {/* SQL Script Accordion style button */}
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4.5 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="font-bold font-sans tracking-wide">// Supabase table SQL setup:</span>
            <button
              onClick={handleCopySQL}
              className="p-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer text-[11px] font-sans"
            >
              <Copy className="w-3 h-3" />
              {copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 leading-normal font-sans">
            Paste this setup script directly inside your Supabase SQL editor to instantiate the structured <code>fuel_entries</code> table with native price-calculation schemas.
          </p>
        </div>
      </div>

      {/* SECTION: MULTI-VEHICLE GARAGE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-0.5">
          <Wrench className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-white text-sm">Garage & Vehicles Setup</h3>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Configure profiles for any number of vehicles. Switching active vehicles from the headers updates mileage predictions, fuel capacities, and dashboard statistics dynamically.
        </p>

        {/* Selected vehicle slot tabs & Add Button */}
        <div className="flex flex-col gap-2.5 bg-slate-950 p-3 rounded-2xl border border-slate-850">
          <div className="flex items-center justify-between pb-1 border-b border-slate-900">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold">Active Profiles ({vehicles.length})</span>
            <button
              type="button"
              onClick={handleAddVehicle}
              className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 text-[10px] uppercase font-bold bg-cyan-400/10 hover:bg-cyan-400/20 px-2.5 py-1 rounded-lg cursor-pointer select-none"
            >
              <Plus className="w-3 h-3" />
              Add Vehicle
            </button>
          </div>
          
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-0.5 scrollbar-thin">
            {vehicles.map((v, index) => {
              const isEditing = activeEditVehicle === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setActiveEditVehicle(v.id)}
                  className={`flex-1 min-w-[100px] py-1.5 px-2.5 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    isEditing
                      ? 'bg-slate-900 text-cyan-400 font-bold border border-slate-800'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/40 border border-transparent'
                  }`}
                >
                  <span className="text-[8px] uppercase tracking-wider font-mono text-slate-500">Slot {index + 1}</span>
                  <span className="text-[11px] font-semibold truncate max-w-[120px]">
                    {v.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form elements for selected slot */}
        {vehicles.map((vh) => {
          if (vh.id !== activeEditVehicle) return null;
          return (
            <div key={vh.id} className="p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-850/60 pb-2">
                <span className="text-xs font-bold text-cyan-400 font-mono">Profile Details</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-500 uppercase bg-slate-900 px-1.5 py-0.5 rounded font-bold">{vh.fuelType} Profile</span>
                  {vehicles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVehicle(vh.id)}
                      className="text-red-400 hover:text-red-350 transition-colors flex items-center gap-0.5 text-[9px] uppercase font-bold bg-red-500/10 hover:bg-red-500/20 px-2 py-0.5 rounded cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 font-sans">
                {/* Vehicle Name input */}
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">Vehicle Label / Name</label>
                  <input
                    type="text"
                    value={vh.name}
                    onChange={(e) => handleVehicleChange(vh.id, 'name', e.target.value)}
                    placeholder="e.g. Hyundai Tucson, Honda City"
                    className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>

                {/* Sub-type / Model */}
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">Model / Body Style</label>
                  <input
                    type="text"
                    value={vh.model}
                    onChange={(e) => handleVehicleChange(vh.id, 'model', e.target.value)}
                    placeholder="e.g. Cruiser, Hatchback, SUV"
                    className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>

                {/* Capacity & Fuel Type grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">Capacity (Liters)</label>
                    <input
                      type="number"
                      step="any"
                      value={vh.capacity || ''}
                      onChange={(e) => handleVehicleChange(vh.id, 'capacity', e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">Fuel Class</label>
                    <select
                      value={vh.fuelType}
                      onChange={(e) => handleVehicleChange(vh.id, 'fuelType', e.target.value)}
                      className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors cursor-pointer"
                    >
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="LPG">LPG</option>
                      <option value="Electric">Electric</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>

                {/* Default Mileage & Price grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">Default Mileage (km/L)</label>
                    <input
                      type="number"
                      step="any"
                      value={vh.default_mileage || ''}
                      onChange={(e) => handleVehicleChange(vh.id, 'default_mileage', e.target.value)}
                      placeholder="e.g. 15"
                      className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">Default Fuel Price (₹/L)</label>
                    <input
                      type="number"
                      step="any"
                      value={vh.default_fuel_price || ''}
                      onChange={(e) => handleVehicleChange(vh.id, 'default_fuel_price', e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* SECTION 2: EXPORTS & IMPORT SHEETS (CSV, JSON BACKUP) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-0.5">
          <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-white text-sm">Backup & Document Exports</h3>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Create immediate offline records or transfer your data history securely using portable formats.
        </p>

        <div className="grid grid-cols-1 gap-2.5">
          {/* Download CSV */}
          <button
            onClick={handleExportCSV}
            className="w-full h-12 bg-slate-950 hover:bg-slate-850 text-white font-medium rounded-xl text-xs transition-all border border-slate-850 flex items-center justify-between px-4 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Export CSV (Excel Sheet compatible)</span>
            </span>
            <Download className="w-4 h-4 text-slate-500" />
          </button>

          {/* Download JSON */}
          <button
            onClick={handleExportJSON}
            className="w-full h-12 bg-slate-950 hover:bg-slate-850 text-white font-medium rounded-xl text-xs transition-all border border-slate-850 flex items-center justify-between px-4 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Code className="w-4 h-4 text-cyan-400" />
              <span>Download JSON Database Backup</span>
            </span>
            <Download className="w-4 h-4 text-slate-500" />
          </button>

          {/* Upload JSON backup */}
          <button
            onClick={handleImportJSONClick}
            className="w-full h-12 bg-slate-950 hover:bg-slate-850 text-white font-medium rounded-xl text-xs transition-all border border-slate-850 flex items-center justify-between px-4 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-violet-400" />
              <span>Import JSON Database Backup</span>
            </span>
            <Upload className="w-4 h-4 text-slate-500" />
          </button>

          {/* Load Premium Demo Data */}
          <button
            onClick={async () => {
              try {
                await onLoadDemoData();
                setSuccessMsg('Successfully loaded comprehensive 6-month historical demo data across all vehicles!');
              } catch (e: any) {
                setErrorMsg('Failed to load demo data.');
              }
            }}
            className="w-full h-12 bg-gradient-to-r from-cyan-950 to-teal-950 hover:from-cyan-900 hover:to-teal-900 text-cyan-400 hover:text-cyan-300 font-bold rounded-xl text-xs transition-all border border-cyan-900/50 flex items-center justify-between px-4 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Load Premium Demo / Sample Data (6 Months)</span>
            </span>
            <ChevronRight className="w-4 h-4 text-cyan-500" />
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>

      {/* SECTION 3: NETLIFY SECRETS GUIDE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Deployment & Variables</h3>
          </div>
          <button
            onClick={handleCopyEnv}
            className="p-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer text-[10px] font-mono leading-none"
          >
            <Copy className="w-3.5 h-3.5" />
            {copiedEnv ? 'Copied Env!' : 'Copy env config'}
          </button>
        </div>

        <div className="space-y-3.5 text-xs text-slate-400 font-sans">
          <p className="leading-relaxed">
            Protect your admin session permanently in production (Netlify or Cloud environments). Set these dynamic configuration settings in your Netlify admin dashboard configuration panel (Site Settings &gt; Environment Variables):
          </p>

          <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl font-mono text-[10px] space-y-1 text-slate-300">
            <div className="text-emerald-500 font-bold">// Active Admin credentials script:</div>
            <div>VITE_ADMIN_USERNAME="{currentAdminConfig?.username || username}"</div>
            <div className="break-all">VITE_ADMIN_PASSWORD_HASH="{currentAdminConfig?.passwordHash || ''}"</div>
            <div className="text-slate-500 pt-2 shrink-0 font-sans tracking-wide leading-normal font-bold">
              // Setup Supabase link (optional)
            </div>
            <div>VITE_SUPABASE_URL="https://your-supabase-app.supabase.co"</div>
            <div>VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."</div>
          </div>
        </div>
      </div>

      {/* SECTION 3.5: ADMIN CONTROL PANEL (USER & DRIVER MANAGEMENT) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div id="admin-user-management" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Admin Control Panel (Drivers & Users)</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsCreateUserOpen(!isCreateUserOpen);
              setCreateUserError('');
              setCreateUserSuccess('');
            }}
            className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5 text-[10px] uppercase font-bold bg-cyan-400/10 hover:bg-cyan-400/20 px-3 py-1.5 rounded-xl cursor-pointer select-none"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isCreateUserOpen ? 'Close Form' : 'Register Driver'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
          Manage all driver profiles registered in the system. Authorized administrators can view user metrics, add new drivers, or delete driver accounts with all of their records.
        </p>

        {/* Expandable User Registration section */}
        {isCreateUserOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-3.5 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-850/60 pb-2">
              <span className="text-xs font-bold text-cyan-400 font-mono">Register New Driver Profile</span>
              <span className="text-[9px] text-slate-500 uppercase bg-slate-900 px-1.5 py-0.5 rounded font-bold font-mono">Secure SHA-256 Credentials</span>
            </div>

            {createUserError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2 font-sans">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{createUserError}</span>
              </div>
            )}

            {createUserSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-2 font-sans">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{createUserSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRegisterUserFromAdmin} className="space-y-3 font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider font-mono">Driver Username</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. alex_driver_2"
                    className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider font-mono">Secure Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full h-10 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                Create Driver Profile
              </button>
            </form>
          </motion.div>
        )}

        {/* Users List Grid */}
        <div className="space-y-2 bg-slate-950 p-3 rounded-2xl border border-slate-850">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-905/60">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold">Active Profiles / Drivers ({allUsers.length})</span>
            <span className="text-[9px] text-slate-500 font-mono uppercase font-bold">Metrics Scoped</span>
          </div>

          <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-0.5 scrollbar-thin">
            {allUsers.map((userGroup) => {
              const isCurrentUser = userGroup.username.toLowerCase() === username.toLowerCase();
              
              // Count vehicles and entries for visual richness
              const entryCount = getLocalEntries(userGroup.username).length;
              const vehicleCount = getLocalVehicles(userGroup.username).length;

              // Check if user is from Vite env vars
              const isEnvClass = !localStorage.getItem('fuel_tracker_bypass_env_creds') && 
                (import.meta as any).env.VITE_ADMIN_USERNAME && 
                userGroup.username.toLowerCase() === ((import.meta as any).env.VITE_ADMIN_USERNAME as string).toLowerCase();

              return (
                <div
                  key={userGroup.username}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrentUser
                      ? 'bg-slate-900 border-cyan-500/20 text-white'
                      : 'bg-slate-900/60 border-slate-850 text-slate-300 hover:bg-slate-900/95'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isCurrentUser ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold font-sans tracking-tight text-slate-100">{userGroup.username}</span>
                        {isCurrentUser && (
                          <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full text-[8.5px] font-mono leading-none lowercase">
                            active driver
                          </span>
                        )}
                        {isEnvClass && (
                          <span className="bg-slate-850 border border-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full text-[8.5px] font-mono leading-none flex items-center gap-1.5 lowercase">
                            <Lock className="w-2.5 h-2.5" />
                            Read-Only Env
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                        Garage: <span className="text-slate-400 font-bold">{vehicleCount}</span> {vehicleCount === 1 ? 'vehicle' : 'vehicles'} | Records: <span className="text-slate-400 font-bold">{entryCount}</span> {entryCount === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                  </div>

                  {!isCurrentUser && !isEnvClass ? (
                    <button
                      type="button"
                      onClick={() => setUserToDelete(userGroup.username)}
                      className="p-1.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] uppercase font-bold font-mono"
                      title={`Delete driver account "${userGroup.username}"`}
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-600 italic px-2 font-semibold">
                      {isCurrentUser ? '(Self)' : 'Protected'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 4: DANGER ZONE & SANDBOX RESET */}
      <div className="bg-slate-900 border border-red-500/10 rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <h3 className="font-bold text-white text-sm">Danger Zone / Sandbox Controls</h3>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Use these options to wipe records or reset the local environment to test features from a clean state.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Option A: Wipe logged stats only */}
          <button
            onClick={() => setIsClearEntriesConfirmOpen(true)}
            className="h-12 bg-slate-950 hover:bg-red-950/10 text-slate-300 hover:text-red-400 font-medium rounded-xl text-xs transition-all border border-slate-850 hover:border-red-900/30 text-left px-4 cursor-pointer flex items-center justify-between"
          >
            <span>Clear Fuel Entry Records</span>
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-tighter">Entries only</span>
          </button>

          {/* Option B: Reset My Account (Onboard Fresh) */}
          <button
            onClick={() => setIsFactoryResetConfirmOpen(true)}
            className="h-12 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 font-semibold rounded-xl text-xs transition-all border border-red-500/10 text-left px-4 cursor-pointer flex items-center justify-between"
          >
            <span>Reset My Account</span>
            <span className="text-[10px] text-red-500 uppercase font-mono tracking-tighter font-bold">Reset Profile</span>
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <div className="text-center text-[10px] text-slate-600 font-mono py-1">
        Consolidated Driver Terminal | Active Session: {username}
      </div>

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={isClearEntriesConfirmOpen}
        onClose={() => setIsClearEntriesConfirmOpen(false)}
        onConfirm={async () => {
          await DbService.deleteUserEntries(username);
          localStorage.removeItem(`fuel_tracker_daily_runs_${username}`);
          window.location.reload();
        }}
        title="Clear Fuel Entries"
        message="Are you sure you want to delete all local & cloud fuel expense logs? This retains your admin security credentials and vehicle garage but wipes all recorded historical entries and commutes."
        confirmText="Yes, Clear"
        cancelText="Cancel"
        type="warning"
      />

      <ConfirmModal
        isOpen={isFactoryResetConfirmOpen}
        onClose={() => setIsFactoryResetConfirmOpen(false)}
        onConfirm={async () => {
          await DbService.deleteUserEntries(username);
          await DbService.deleteUserVehicles(username);
          localStorage.removeItem(`fuel_tracker_daily_runs_${username}`);
          removeUserAccount(username);
          sessionStorage.removeItem('admin_fuel_tracker_session_state');
          sessionStorage.removeItem('admin_fuel_tracker_last_activity');
          window.location.reload();
        }}
        title="Reset My Account"
        message="CRITICAL: This option completely clears only your local & cloud database entries, wipes your custom vehicle profile, and purges your account credentials. Other drivers' profiles and expense data remain completely untouched. Proceed?"
        confirmText="Yes, Reset My Account"
        cancelText="Cancel"
        type="danger"
      />

      <ConfirmModal
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleDeleteUserConfirm}
        title="Delete Driver Account"
        message={`CRITICAL ACTION: Are you sure you want to permanently delete the driver account "${userToDelete}"? This will purge all of their custom vehicle profiles, credentials, and fuel expense logs across both your local sandbox and Supabase Cloud. This action cannot be undone.`}
        confirmText={isDeletingUser ? 'Deleting...' : 'Yes, Delete Account'}
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
