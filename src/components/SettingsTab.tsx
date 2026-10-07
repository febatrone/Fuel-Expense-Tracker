import React, { useRef, useState } from 'react';
import { FuelEntry, CalculatedEntry, Vehicle } from '../types';
import { isExpressApiConfigured, isSupabaseConfigured, DbService, getLocalEntries, getLocalVehicles } from '../utils/db';
import { getAdminConfig, removeUserAccount, getAllUsers, registerUser, UserAccount } from '../utils/auth';
import { hashPassword } from '../utils/crypto';
import { Download, Upload, ShieldAlert, CheckCircle, Database, HelpCircle, FileSpreadsheet, Copy, Code, HelpCircle as HelpIcon, Radio, Wrench, Fuel, Plus, Trash2, Users, UserPlus, Lock, User, UserMinus, ChevronRight, Sparkles, Printer } from 'lucide-react';
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

  // 2.5 Printable PDF Summary Report Generator
  const handlePrintPDFReport = () => {
    try {
      const totalCost = calculatedEntries.reduce((sum, e) => sum + e.amount_paid, 0);
      const totalLiters = calculatedEntries.reduce((sum, e) => sum + e.liters, 0);
      const validMileageEntries = calculatedEntries.filter(e => e.mileage !== undefined);
      const avgMileage = validMileageEntries.length > 0
        ? validMileageEntries.reduce((sum, e) => sum + (e.mileage || 0), 0) / validMileageEntries.length
        : 0;
      const totalDistance = calculatedEntries.reduce((sum, e) => sum + (e.distanceTravelled || 0), 0);
      const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
      const avgPricePerLiter = totalLiters > 0 ? totalCost / totalLiters : 0;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setErrorMsg('Please allow popups to generate and print PDF reports.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Fuel Expense & Mileage Report - ${username}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
            h1 { color: #0f172a; margin-bottom: 5px; font-size: 24px; }
            .subtitle { color: #64748b; font-size: 13px; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 10px; }
            .metric-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
            .metric-value { font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #0f172a; color: #fff; text-align: left; padding: 10px; font-weight: 600; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h1>⛽ Fuel Expense Tracker Summary</h1>
              <div class="subtitle">Generated for Driver Profile: <strong>${username}</strong> | Date: ${new Date().toLocaleDateString()}</div>
            </div>
            <button onclick="window.print()" class="no-print" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Print / Save PDF</button>
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">Total Refills</div>
              <div class="metric-value">${calculatedEntries.length}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Total Fuel Cost</div>
              <div class="metric-value">₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Total Liters</div>
              <div class="metric-value">${totalLiters.toFixed(2)} L</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Avg Mileage</div>
              <div class="metric-value">${avgMileage.toFixed(2)} km/L</div>
            </div>
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">Total Distance</div>
              <div class="metric-value">${totalDistance.toLocaleString()} km</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Cost Per KM</div>
              <div class="metric-value">₹${costPerKm.toFixed(2)}/km</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Avg Price / Liter</div>
              <div class="metric-value">₹${avgPricePerLiter.toFixed(2)}/L</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Active Vehicles</div>
              <div class="metric-value">${vehicles.length}</div>
            </div>
          </div>

          <h2>Fuel Fill-Up Log Details</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Odometer (KM)</th>
                <th>Liters</th>
                <th>Amount (₹)</th>
                <th>Price/L (₹)</th>
                <th>Distance (KM)</th>
                <th>Mileage (KM/L)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${calculatedEntries.map(e => `
                <tr>
                  <td>${e.date}</td>
                  <td>${e.odometer.toLocaleString()}</td>
                  <td>${e.liters.toFixed(2)}</td>
                  <td>₹${e.amount_paid.toFixed(2)}</td>
                  <td>₹${e.price_per_liter.toFixed(2)}</td>
                  <td>${e.distanceTravelled !== undefined ? e.distanceTravelled + ' km' : '-'}</td>
                  <td>${e.mileage !== undefined ? e.mileage.toFixed(2) + ' km/L' : '-'}</td>
                  <td>${e.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            Fuel Expense Tracker Consolidated Report • Generated via Netlify & Express PostgreSQL System
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 500);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
      setSuccessMsg('Opened Printable PDF Report dialog window.');
    } catch (e) {
      setErrorMsg('Failed to generate printable PDF report.');
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

      {/* SECTION 1: STORAGE CONTEXT (RENDER EXPRESS + POSTGRESQL) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Database Engine</h3>
          </div>
          <span className={`text-[10px] uppercase font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold ${
            isExpressApiConfigured
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-orange-500/10 border border-orange-500/20 text-orange-400'
          }`}>
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            {isExpressApiConfigured ? 'Render PostgreSQL Connected' : 'Offline LocalStorage'}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          {isExpressApiConfigured
            ? 'The app is successfully connected to your Express + PostgreSQL REST API backend hosted on Render. All fuel records, vehicles, and daily runs are stored directly in your PostgreSQL database.'
            : 'Operational in client-side Sandbox mode. Data is stored in your secure local web storage. To connect to your Render PostgreSQL backend, set VITE_API_URL in your Netlify environment variables.'}
        </p>

        {/* SQL Script Accordion style button */}
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4.5 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="font-bold font-sans tracking-wide">// Render PostgreSQL DDL setup (server/schema.sql):</span>
            <button
              onClick={handleCopySQL}
              className="p-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer text-[11px] font-sans"
            >
              <Copy className="w-3 h-3" />
              {copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 leading-normal font-sans">
            Paste this DDL setup script inside your Render PostgreSQL database query editor to instantiate the structured <code>vehicles</code>, <code>fuel_entries</code>, <code>daily_runs</code>, and <code>saved_routes</code> tables.
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
          {/* Printable PDF Summary Report */}
          <button
            onClick={handlePrintPDFReport}
            className="w-full h-12 bg-gradient-to-r from-slate-950 to-slate-900 hover:from-slate-900 hover:to-slate-850 text-white font-medium rounded-xl text-xs transition-all border border-cyan-500/30 flex items-center justify-between px-4 cursor-pointer shadow-lg shadow-cyan-950/20"
          >
            <span className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-cyan-300">Generate Printable PDF Summary Report</span>
            </span>
            <Printer className="w-4 h-4 text-cyan-400" />
          </button>

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

      {/* SECTION 3.5: SUPER ADMIN ACCESS CONTROL */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div id="admin-user-management" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Super Admin Security & Access Control</h3>
          </div>
          <span className="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <User className="w-3.5 h-3.5" />
            Exclusive Super Admin Mode
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
          System is configured for exclusive single-tenant Super Admin operation. All vehicle profiles, fuel entries, daily logs, and database metrics are strictly managed under your primary Super Admin account (<span className="text-cyan-300 font-bold">{username}</span>).
        </p>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3 font-sans">
          <div className="flex items-center justify-between text-xs border-b border-slate-900 pb-2">
            <span className="text-slate-400 font-mono text-[10px] uppercase font-bold">Active Security Status</span>
            <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              Protected & Authenticated
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase font-mono font-bold">Super Admin Profile</span>
              <span className="text-sm font-bold text-white mt-0.5 block">{username}</span>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase font-mono font-bold">Access Level</span>
              <span className="text-sm font-bold text-cyan-400 mt-0.5 block">Full System Authority</span>
            </div>
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
