import React, { useState } from 'react';
import { FuelEntry, CalculatedEntry, DateFilter, OverallMetrics, SmartInsight, DailyRunLog, Vehicle } from '../types';
import { calculateOverallMetrics, generateSmartInsights, generateMonthlyMetrics, generateYearlyMetrics } from '../utils/calc';
import { Calendar, Droplets, Gauge, CreditCard, Flame, TrendingUp, AlertCircle, Sparkles, ChevronRight, Filter, Layers, Hash, Navigation, BarChart2, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface DashboardTabProps {
  entries: FuelEntry[];
  calculatedEntries: CalculatedEntry[];
  allEntries: FuelEntry[];
  vehicles: Vehicle[];
  dailyLogs: DailyRunLog[];
  filter: DateFilter;
  setFilter: (f: DateFilter) => void;
  onOpenAddModal: () => void;
  activeVehicleId: string;
}

export default function DashboardTab({
  entries,
  calculatedEntries,
  allEntries,
  vehicles,
  dailyLogs,
  filter,
  setFilter,
  onOpenAddModal,
  activeVehicleId,
}: DashboardTabProps) {
  const [dashboardMode, setDashboardMode] = React.useState<'refills' | 'commutes' | 'consolidated' | 'trips'>('consolidated');

  // Filter daily runs by vehicle
  const vehicleDailyLogs = React.useMemo(() => {
    return dailyLogs.filter(l => l.vehicle_id === activeVehicleId);
  }, [dailyLogs, activeVehicleId]);

  // Filter daily runs by date range
  const filteredDailyLogs = React.useMemo(() => {
    return vehicleDailyLogs.filter(l => l.date >= filter.startDate && l.date <= filter.endDate);
  }, [vehicleDailyLogs, filter]);

  // Compute sums for filtered daily logs
  const dailyMetrics = React.useMemo(() => {
    const distance = filteredDailyLogs.reduce((sum, l) => sum + l.distance, 0);
    const liters = filteredDailyLogs.reduce((sum, l) => sum + l.estimatedLiters, 0);
    const cost = filteredDailyLogs.reduce((sum, l) => sum + l.estimatedCost, 0);
    return { distance, liters, cost };
  }, [filteredDailyLogs]);

  // Compute sums for all-time daily logs
  const overallDailyMetrics = React.useMemo(() => {
    const distance = vehicleDailyLogs.reduce((sum, l) => sum + l.distance, 0);
    const liters = vehicleDailyLogs.reduce((sum, l) => sum + l.estimatedLiters, 0);
    const cost = vehicleDailyLogs.reduce((sum, l) => sum + l.estimatedCost, 0);
    return { distance, liters, cost };
  }, [vehicleDailyLogs]);

  // --- REFILLS MONTHLY TRENDS ---
  const monthlyMetrics = React.useMemo(() => {
    return generateMonthlyMetrics(calculatedEntries);
  }, [calculatedEntries]);

  const filteredMonthlyMetrics = React.useMemo(() => {
    const startMonth = filter.startDate.substring(0, 7);
    const endMonth = filter.endDate.substring(0, 7);
    return monthlyMetrics.filter(m => m.monthKey >= startMonth && m.monthKey <= endMonth);
  }, [monthlyMetrics, filter]);

  // --- COMMUTES CATEGORY ANALYSIS ---
  const categoriesList = React.useMemo(() => {
    const cats = new Set<string>();
    dailyLogs.forEach(log => {
      if (log.category) {
        cats.add(log.category);
      }
    });
    ['Office', 'University', 'Personal', 'Business', 'Grocery'].forEach(c => cats.add(c));
    return Array.from(cats);
  }, [dailyLogs]);

  const [selectedAnalyticsCategory, setSelectedAnalyticsCategory] = useState<string>('Office');

  // Filter logs for this specific category and date filter
  const categoryLogs = React.useMemo(() => {
    return dailyLogs.filter(log => 
      log.category && 
      log.category.toLowerCase() === selectedAnalyticsCategory.toLowerCase() &&
      log.date >= filter.startDate && 
      log.date <= filter.endDate
    );
  }, [dailyLogs, selectedAnalyticsCategory, filter]);

  const categoryTotals = React.useMemo(() => {
    const cost = categoryLogs.reduce((sum, log) => sum + log.estimatedCost, 0);
    const liters = categoryLogs.reduce((sum, log) => sum + log.estimatedLiters, 0);
    const distance = categoryLogs.reduce((sum, log) => sum + log.distance, 0);
    const runs = categoryLogs.length;
    return { cost, liters, distance, runs };
  }, [categoryLogs]);

  const categoryVehicleStats = React.useMemo(() => {
    const stats: Record<string, { cost: number; liters: number; distance: number; runs: number }> = {};
    vehicles.forEach(v => {
      stats[v.id] = { cost: 0, liters: 0, distance: 0, runs: 0 };
    });
    categoryLogs.forEach(log => {
      if (stats[log.vehicle_id]) {
        stats[log.vehicle_id].cost += log.estimatedCost;
        stats[log.vehicle_id].liters += log.estimatedLiters;
        stats[log.vehicle_id].distance += log.distance;
        stats[log.vehicle_id].runs += 1;
      }
    });
    return Object.entries(stats)
      .map(([vehicleId, data]) => {
        const vehicle = vehicles.find(v => v.id === vehicleId) || { name: 'Unknown', model: 'Unknown' };
        return {
          vehicleId,
          name: vehicle.name,
          model: vehicle.model,
          ...data
        };
      })
      .filter(item => item.runs > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [categoryLogs, vehicles]);

  // Overall categories spend share
  const allCategoriesSpend = React.useMemo(() => {
    const spendMap: Record<string, number> = {};
    dailyLogs.forEach(log => {
      if (log.date >= filter.startDate && log.date <= filter.endDate) {
        const cat = log.category || 'Other';
        spendMap[cat] = (spendMap[cat] || 0) + log.estimatedCost;
      }
    });
    return Object.entries(spendMap)
      .map(([category, cost]) => ({ category, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [dailyLogs, filter]);

  // Stacked monthly commutes data per vehicle
  const categoryMonthlyData = React.useMemo(() => {
    const monthlyGroups: Record<string, Record<string, number>> = {};
    const vehicleCommutes = dailyLogs.filter(log => log.date >= filter.startDate && log.date <= filter.endDate);

    vehicleCommutes.forEach(log => {
      const monthKey = log.date.substring(0, 7);
      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = {};
      }
      if (!monthlyGroups[monthKey][log.vehicle_id]) {
        monthlyGroups[monthKey][log.vehicle_id] = 0;
      }
      monthlyGroups[monthKey][log.vehicle_id] += log.estimatedCost;
    });

    return Object.entries(monthlyGroups)
      .map(([monthKey, vehicleCosts]) => {
        const dateObj = new Date(monthKey + '-02');
        const label = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
        const item: any = { monthKey, label };
        vehicles.forEach(v => {
          item[v.id] = vehicleCosts[v.id] || 0;
        });
        return item;
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [dailyLogs, vehicles, filter]);

  // --- CONSOLIDATED REFILLS VS COMMUTES MONTHLY DATA ---
  const consolidatedMonthlyData = React.useMemo(() => {
    const refillMap: Record<string, number> = {};
    const refillLitersMap: Record<string, number> = {};
    calculatedEntries.forEach(e => {
      const monthKey = e.date.substring(0, 7);
      refillMap[monthKey] = (refillMap[monthKey] || 0) + e.amount_paid;
      refillLitersMap[monthKey] = (refillLitersMap[monthKey] || 0) + e.liters;
    });

    const commuteMap: Record<string, number> = {};
    const commuteLitersMap: Record<string, number> = {};
    dailyLogs.forEach(l => {
      const monthKey = l.date.substring(0, 7);
      commuteMap[monthKey] = (commuteMap[monthKey] || 0) + l.estimatedCost;
      commuteLitersMap[monthKey] = (commuteLitersMap[monthKey] || 0) + l.estimatedLiters;
    });

    const allMonths = new Set([...Object.keys(refillMap), ...Object.keys(commuteMap)]);
    return Array.from(allMonths)
      .map(monthKey => {
        const dateObj = new Date(monthKey + '-02');
        const label = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
        return {
          monthKey,
          label,
          refillsCost: refillMap[monthKey] || 0,
          commutesCost: commuteMap[monthKey] || 0,
          refillsLiters: refillLitersMap[monthKey] || 0,
          commutesLiters: commuteLitersMap[monthKey] || 0
        };
      })
      .filter(item => item.monthKey >= filter.startDate.substring(0, 7) && item.monthKey <= filter.endDate.substring(0, 7))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [calculatedEntries, dailyLogs, filter]);

  const vehicleColors = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6'];

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl text-xs font-mono text-left">
          <p className="text-slate-400 mb-1 font-sans font-semibold">{label}</p>
          {payload.map((p: any, idx: number) => (
            <p key={idx} style={{ color: p.color || p.fill }} className="font-bold">
              {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };
  // Compute overall KPI counters (all-time or default ranges)
  const today = new Date();
  const curMonthStr = today.toISOString().substring(0, 7); // "YYYY-MM"
  const curYearStr = today.getFullYear().toString(); // "YYYY"

  // 1. Calculate This Month absolute total spending
  const thisMonthEntries = entries.filter(e => e.date.substring(0, 7) === curMonthStr);
  const thisMonthTotalCost = thisMonthEntries.reduce((sum, e) => sum + e.amount_paid, 0);

  // 2. Calculate This Year absolute total spending
  const thisYearEntries = entries.filter(e => e.date.substring(0, 4) === curYearStr);
  const thisYearTotalCost = thisYearEntries.reduce((sum, e) => sum + e.amount_paid, 0);

  // 3. Compute active slice metrics based on the current filter selection
  const filteredCalculations = calculatedEntries.filter(
    e => e.date >= filter.startDate && e.date <= filter.endDate
  );
  
  const overallMetrics = calculateOverallMetrics(calculatedEntries);
  const filteredMetrics = calculateOverallMetrics(filteredCalculations);

  const latestEntry = React.useMemo(() => {
    if (calculatedEntries.length === 0) return null;
    return [...calculatedEntries].reverse()[0];
  }, [calculatedEntries]);

  // 4. Generate automated insights (using all calculations to inspect trends)
  const monthlyDataForInsights = React.useMemo(() => {
    // Generate monthly metrics
    const groups: Record<string, CalculatedEntry[]> = {};
    calculatedEntries.forEach(entry => {
      const monthKey = entry.date.substring(0, 7);
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(entry);
    });
    
    return Object.keys(groups).sort().map(monthKey => {
      const g = groups[monthKey];
      const cost = g.reduce((sum, e) => sum + e.amount_paid, 0);
      const liters = g.reduce((sum, e) => sum + e.liters, 0);
      const distance = g.reduce((sum, e) => sum + (e.distanceTravelled || 0), 0);
      const mileages = g.map(e => e.mileage).filter((m): m is number => m !== undefined && m > 0);
      const avgMil = mileages.length > 0 ? mileages.reduce((s, v) => s + v, 0) / mileages.length : 0;
      
      const [y, m] = monthKey.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();

      return {
        monthKey,
        label: new Date(y, m - 1, 15).toLocaleString('default', { month: 'long', year: 'numeric' }),
        totalCost: cost,
        totalLiters: liters,
        totalDistance: distance,
        averageMileage: avgMil,
        refillsCount: g.length,
        averageRefillAmount: g.length > 0 ? cost / g.length : 0,
        averageFuelPrice: liters > 0 ? cost / liters : 0,
        dailyFuelCostAverage: cost / days,
        costPerKm: distance > 0 ? cost / distance : 0,
      };
    });
  }, [calculatedEntries]);

  const insights = React.useMemo(() => {
    return generateSmartInsights(monthlyDataForInsights, today.getFullYear());
  }, [monthlyDataForInsights]);

  // Quick helper to build human descriptive title for the filter range
  const getFilterDescriptionLabel = () => {
    if (filter.preset === 'current_month') return 'Current Month';
    if (filter.preset === 'previous_month') return 'Previous Month';
    if (filter.preset === 'current_year') return 'Current Year';
    return `${filter.startDate} to ${filter.endDate}`;
  };

  const getPresetLabelShort = () => {
    if (filter.preset === 'current_month') return 'This Month';
    if (filter.preset === 'previous_month') return 'Prev Month';
    if (filter.preset === 'current_year') return 'This Year';
    return 'Period';
  };

  const handleFilterPresetToggle = (preset: 'current_month' | 'previous_month' | 'current_year' | 'custom_range') => {
    const format = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${r}`;
    };
    let start = '';
    let end = '';

    if (preset === 'current_month') {
      start = format(new Date(today.getFullYear(), today.getMonth(), 1));
      end = format(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (preset === 'previous_month') {
      start = format(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      end = format(new Date(today.getFullYear(), today.getMonth(), 0));
    } else if (preset === 'current_year') {
      start = format(new Date(today.getFullYear(), 0, 1));
      end = format(new Date(today.getFullYear(), 11, 31));
    } else {
      // default: last 90 days
      const d = new Date();
      d.setDate(today.getDate() - 90);
      start = format(d);
      end = format(today);
    }

    setFilter({ preset, startDate: start, endDate: end });
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Welcome Heading & Quick Action */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wider font-mono">Consolidated Workspace</span>
          <h1 className="text-2xl font-black text-white mt-0.5 tracking-tight">Driver Console</h1>
        </div>
        <button
          onClick={onOpenAddModal}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-white font-semibold text-xs rounded-xl shadow-md active:scale-98 transition-all cursor-pointer"
        >
          Add Fuel Fill-up
        </button>
      </div>

      {/* Latest Refill vehicle driving range autonomy card banner */}
      {latestEntry && latestEntry.estimatedRange !== undefined && latestEntry.estimatedRange > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 rounded-xl shrink-0">
              <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider font-mono">Estimated Vehicle Autonomy</span>
              <h2 className="text-xl font-black text-white font-sans mt-0.5 tracking-tight flex items-baseline gap-1.5">
                ~ {Math.round(latestEntry.estimatedRange).toLocaleString()} km
                <span className="text-xs text-slate-405 font-medium">estimated drive range</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Refilled <span className="text-white font-mono font-bold">{latestEntry.liters.toFixed(1)}L</span>. Estimated autonomy based on your general running average of <span className="text-white font-mono font-bold">{overallMetrics.averageMileage.toFixed(2)} km/l</span>.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center bg-slate-950/50 p-2.5 px-3.5 rounded-xl border border-slate-850/60 text-xs font-mono text-slate-400 sm:self-center">
            <span>Refill Type:</span>
            <span className={`font-black pl-1.5 ${latestEntry.is_partial ? 'text-amber-400' : 'text-cyan-400'}`}>
              {latestEntry.is_partial ? 'Top-up / Partial' : 'Full Tank'}
            </span>
          </div>
        </div>
      )}

      {/* CONSOLE VIEW MODE SWITCHER */}
      <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-2xl max-w-lg overflow-x-auto no-scrollbar shrink-0 gap-1">
        {(['consolidated', 'refills', 'commutes', 'trips'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDashboardMode(mode)}
            className={`flex-1 py-1.5 px-3.5 text-[10px] uppercase tracking-wider font-extrabold rounded-xl transition-all cursor-pointer select-none text-center whitespace-nowrap ${
              dashboardMode === mode
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {mode === 'consolidated' ? 'Consolidated' : mode === 'refills' ? 'Refills (Actual)' : mode === 'commutes' ? 'Commutes (Est.)' : 'Trips (Purpose)'}
          </button>
        ))}
      </div>

      {/* Main KPI Summary dashboard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {/* Card 1: Spent */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {dashboardMode === 'consolidated' ? 'Spent & Consumed' : dashboardMode === 'refills' ? 'Costs (Refills)' : dashboardMode === 'commutes' ? 'Costs (Commutes)' : 'Costs (Trips)'}
            </span>
            <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {dashboardMode === 'refills' && (
              <>
                <span className="text-[10px] text-slate-500 block">Fuel Costs</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  ₹{filteredMetrics.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time: ₹{overallMetrics.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </>
            )}
            {dashboardMode === 'commutes' && (
              <>
                <span className="text-[10px] text-slate-500 block">Commute Costs (Est.)</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  ₹{dailyMetrics.cost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time: ₹{overallDailyMetrics.cost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </>
            )}
            {dashboardMode === 'consolidated' && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Refills:</span>
                  <span className="text-sm font-bold text-white font-mono">₹{filteredMetrics.totalCost.toLocaleString()}</span>
                </div>
                <div className="flex items-baseline justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-[10px] text-slate-500">Commutes:</span>
                  <span className="text-sm font-bold text-amber-400 font-mono">₹{dailyMetrics.cost.toLocaleString()}</span>
                </div>
                <div className="pt-1.5">
                  <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                    <span>Refill Budget Consumed</span>
                    <span className="font-mono text-cyan-400">
                      {filteredMetrics.totalCost > 0 ? Math.round((dailyMetrics.cost / filteredMetrics.totalCost) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className="bg-gradient-to-r from-cyan-500 to-teal-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, filteredMetrics.totalCost > 0 ? (dailyMetrics.cost / filteredMetrics.totalCost) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
            {dashboardMode === 'trips' && (
              <>
                <span className="text-[10px] text-slate-500 block">Spent on "{selectedAnalyticsCategory}"</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  ₹{categoryTotals.cost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Est. commute run expense
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Fuel Liters */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {dashboardMode === 'consolidated' ? 'Fuel Liters' : dashboardMode === 'refills' ? 'Liters (Refills)' : dashboardMode === 'commutes' ? 'Liters (Commutes)' : 'Liters (Trips)'}
            </span>
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Droplets className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {dashboardMode === 'refills' && (
              <>
                <span className="text-[10px] text-slate-500 block">Fuel Volume</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  {(filteredMetrics.totalLiters || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time: {(overallMetrics.totalLiters || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                </span>
              </>
            )}
            {dashboardMode === 'commutes' && (
              <>
                <span className="text-[10px] text-slate-500 block">Est. Liters Used</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  {(dailyMetrics.liters || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time: {(overallDailyMetrics.liters || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
                </span>
              </>
            )}
            {dashboardMode === 'consolidated' && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Filled:</span>
                  <span className="text-sm font-bold text-white font-mono">{filteredMetrics.totalLiters.toFixed(1)} L</span>
                </div>
                <div className="flex items-baseline justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-[10px] text-slate-500">Consumed:</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{dailyMetrics.liters.toFixed(1)} L</span>
                </div>
                <div className="pt-1.5">
                  <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                    <span>Fuel Capacity Consumed</span>
                    <span className="font-mono text-emerald-400">
                      {filteredMetrics.totalLiters > 0 ? Math.round((dailyMetrics.liters / filteredMetrics.totalLiters) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, filteredMetrics.totalLiters > 0 ? (dailyMetrics.liters / filteredMetrics.totalLiters) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
            {dashboardMode === 'trips' && (
              <>
                <span className="text-[10px] text-slate-500 block">Liters Consumed</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {categoryTotals.liters.toFixed(1)} L
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Est. volume burned
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 3: Avg Mileage */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Avg Mileage</span>
            <div className="p-1.5 bg-orange-500/10 text-orange-400 rounded-lg">
              <Gauge className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div>
              <span className="text-[10px] text-slate-500 block">{getPresetLabelShort()} Average</span>
              <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                {filteredMetrics.averageMileage > 0 ? `${filteredMetrics.averageMileage.toFixed(2)} km/l` : '—'}
              </span>
              <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                All-time avg: {overallMetrics.averageMileage > 0 ? `${overallMetrics.averageMileage.toFixed(2)} km/l` : '—'}
              </span>
            </div>
            {overallMetrics.currentMileage > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[9px] text-amber-400 font-semibold uppercase tracking-wider block flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0 animate-pulse" />
                  Exact Last Trip Average
                </span>
                <span className="text-sm font-black text-slate-200 font-mono block mt-0.5">
                  {overallMetrics.currentMileage.toFixed(2)} km/l
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Cost Per KM */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cost/KM</span>
            <div className="p-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg">
              <Flame className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {dashboardMode === 'refills' && (
              <>
                <span className="text-[10px] text-slate-500 block">{getPresetLabelShort()} Avg</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  {filteredMetrics.costPerKm > 0 ? `₹${filteredMetrics.costPerKm.toFixed(2)}` : '—'}
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time avg: {overallMetrics.costPerKm > 0 ? `₹${overallMetrics.costPerKm.toFixed(2)}` : '—'}
                </span>
              </>
            )}
            {dashboardMode === 'commutes' && (
              <>
                <span className="text-[10px] text-slate-500 block">{getPresetLabelShort()} Avg</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  {dailyMetrics.distance > 0 ? `₹${(dailyMetrics.cost / dailyMetrics.distance).toFixed(2)}` : '—'}
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time avg: {overallDailyMetrics.distance > 0 ? `₹${(overallDailyMetrics.cost / overallDailyMetrics.distance).toFixed(2)}` : '—'}
                </span>
              </>
            )}
            {dashboardMode === 'consolidated' && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Refill Avg:</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {filteredMetrics.costPerKm > 0 ? `₹${filteredMetrics.costPerKm.toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-[10px] text-slate-500">Commute Avg:</span>
                  <span className="text-sm font-bold text-amber-400 font-mono">
                    {dailyMetrics.distance > 0 ? `₹${(dailyMetrics.cost / dailyMetrics.distance).toFixed(2)}` : '—'}
                  </span>
                </div>
                <p className="text-[9px] text-slate-500 italic leading-tight pt-1">
                  * Commute runs use the latest fuel price, resulting in precise cost-per-km metrics.
                </p>
              </>
            )}
            {dashboardMode === 'trips' && (
              <>
                <span className="text-[10px] text-slate-500 block">Trip Cost Rate</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0">
                  {categoryTotals.distance > 0 ? `₹${(categoryTotals.cost / categoryTotals.distance).toFixed(2)}/km` : '—'}
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Average rate per km
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 5: Total Distance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {dashboardMode === 'consolidated' ? 'Distance Run' : dashboardMode === 'refills' ? 'Total Odo' : dashboardMode === 'commutes' ? 'Commute Runs' : 'Trip Distance'}
            </span>
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {dashboardMode === 'refills' && (
              <>
                <span className="text-[10px] text-slate-500 block">{getPresetLabelShort()} Range</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {filteredMetrics.totalDistance.toLocaleString()} km
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Cumulative: {overallMetrics.totalDistance.toLocaleString()} km
                </span>
              </>
            )}
            {dashboardMode === 'commutes' && (
              <>
                <span className="text-[10px] text-slate-500 block">Commute Distance</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {dailyMetrics.distance.toLocaleString()} km
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Cumulative: {overallDailyMetrics.distance.toLocaleString()} km
                </span>
              </>
            )}
            {dashboardMode === 'consolidated' && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Refill Span:</span>
                  <span className="text-sm font-bold text-white font-mono">{filteredMetrics.totalDistance.toLocaleString()} km</span>
                </div>
                <div className="flex items-baseline justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-[10px] text-slate-500">Commuted:</span>
                  <span className="text-sm font-bold text-indigo-400 font-mono">{dailyMetrics.distance.toLocaleString()} km</span>
                </div>
                <div className="pt-1.5">
                  <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                    <span>Odometer Logged on Commutes</span>
                    <span className="font-mono text-indigo-400">
                      {filteredMetrics.totalDistance > 0 ? Math.round((dailyMetrics.distance / filteredMetrics.totalDistance) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-cyan-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, filteredMetrics.totalDistance > 0 ? (dailyMetrics.distance / filteredMetrics.totalDistance) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
            {dashboardMode === 'trips' && (
              <>
                <span className="text-[10px] text-slate-500 block">Trip Distance</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {categoryTotals.distance.toLocaleString()} km
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Accumulated runs
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 6: Total Refills or Runs */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {dashboardMode === 'consolidated' ? 'Total Activities' : dashboardMode === 'refills' ? 'Refills' : dashboardMode === 'commutes' ? 'Logs' : 'Runs'}
            </span>
            <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg">
              <Droplets className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {dashboardMode === 'refills' && (
              <>
                <span className="text-[10px] text-slate-500 block">{getPresetLabelShort()} Total</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {filteredMetrics.totalRefills} times
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time: {overallMetrics.totalRefills} times
                </span>
              </>
            )}
            {dashboardMode === 'commutes' && (
              <>
                <span className="text-[10px] text-slate-500 block">Commute Runs Count</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {filteredDailyLogs.length} runs
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  All-time: {vehicleDailyLogs.length} runs
                </span>
              </>
            )}
            {dashboardMode === 'consolidated' && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-500">Refill Refuels:</span>
                  <span className="text-sm font-bold text-white font-mono">{filteredMetrics.totalRefills} times</span>
                </div>
                <div className="flex items-baseline justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-[10px] text-slate-500">Commute Logs:</span>
                  <span className="text-sm font-bold text-rose-400 font-mono">{filteredDailyLogs.length} runs</span>
                </div>
                <p className="text-[9px] text-slate-500 italic leading-tight pt-1">
                  * Compare refuel count vs logged daily run frequency to evaluate tracking accuracy.
                </p>
              </>
            )}
            {dashboardMode === 'trips' && (
              <>
                <span className="text-[10px] text-slate-500 block">Runs Logged</span>
                <span className="text-lg font-extrabold text-white font-mono shrink-0 font-bold">
                  {categoryTotals.runs} times
                </span>
                <span className="text-[9px] text-slate-500 block mt-1.5 border-t border-slate-800/60 pt-1.5">
                  Trip frequency
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS BAR (SCROLLABLE ON MOBILE) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold tracking-wider uppercase mb-1">
          <Filter className="w-3.5 h-3.5 text-cyan-400" />
          <span>Analytics Filter Criteria:</span>
          <span className="text-cyan-400 font-mono text-xs font-bold pl-1">({getFilterDescriptionLabel()})</span>
        </div>

        {/* Quick presets row */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2">
          {[
            { id: 'current_month', label: 'Month' },
            { id: 'previous_month', label: 'Prev Month' },
            { id: 'current_year', label: 'Year' },
            { id: 'custom_range', label: 'Custom Range' },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleFilterPresetToggle(preset.id as any)}
              className={`h-9 px-4 shrink-0 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                filter.preset === preset.id
                  ? 'bg-cyan-500 text-white font-semibold'
                  : 'bg-slate-950 border border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        {filter.preset === 'custom_range' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-2 grid grid-cols-2 gap-2 text-xs"
          >
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">Start Date</span>
              <input
                type="date"
                value={filter.startDate}
                onChange={(e) => setFilter({ ...filter, startDate: e.target.value })}
                className="w-full h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">End Date</span>
              <input
                type="date"
                value={filter.endDate}
                onChange={(e) => setFilter({ ...filter, endDate: e.target.value })}
                className="w-full h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* DYNAMIC SMART INSIGHT CARDS */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold tracking-wider uppercase pl-1">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Dynamic Smart Insights</span>
        </div>

        <div className="space-y-2.5">
          {insights.map((insight, idx) => {
            const isPos = insight.type === 'positive';
            const isWarn = insight.type === 'warning';
            const isInfo = insight.type === 'info';
            
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={idx}
                className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                  isPos
                    ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300'
                    : isWarn
                    ? 'bg-rose-500/5 border-rose-500/10 text-rose-300'
                    : isInfo
                    ? 'bg-cyan-500/5 border-cyan-500/10 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${
                  isPos
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : isWarn
                    ? 'bg-rose-500/10 text-rose-400'
                    : isInfo
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'bg-slate-950 text-slate-400'
                }`}>
                  {isPos ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : isWarn ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white leading-tight">{insight.title}</h4>
                  <p className="text-xs mt-1 text-slate-400 leading-normal">{insight.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* QUICK STATUS BAR */}
      {entries.length === 0 && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
          <p className="text-sm text-slate-400">
            No entries captured yet. Record your first gas receipt fill-up to kickstart.
          </p>
          <button
            onClick={onOpenAddModal}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-450 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Add Your First Fuel Receipt
          </button>
        </div>
      )}

      {/* CENTRALIZED ANALYTICS CHARTS SECTION */}
      <div className="space-y-4 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between pl-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold tracking-wider uppercase">
            <BarChart2 className="w-4 h-4 text-cyan-400" />
            <span>Integrated Console Analytics</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">mode: {dashboardMode}</span>
        </div>

        {/* MODE A: REFILLS CHARTS */}
        {dashboardMode === 'refills' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart 1: Spending trend */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                Monthly Spending Trend (₹)
              </span>
              <div className="h-52">
                {filteredMonthlyMetrics.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">No refill logs in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredMonthlyMetrics}>
                      <defs>
                        <linearGradient id="spendGradDash" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Area type="monotone" dataKey="totalCost" name="Total Spend" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#spendGradDash)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Distance Travelled */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                Monthly Distance Travelled (KM)
              </span>
              <div className="h-52">
                {filteredMonthlyMetrics.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-550 text-xs font-mono">No refill logs in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredMonthlyMetrics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Bar dataKey="totalDistance" name="Distance (KM)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 3: Mileage */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Monthly Mileage (KM/L)
              </span>
              <div className="h-52">
                {filteredMonthlyMetrics.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-550 text-xs font-mono">No mileage logs in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredMonthlyMetrics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Line type="monotone" dataKey="averageMileage" name="Mileage (km/l)" stroke="#ef4444" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 4: Cost per KM */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-cyan-400" />
                Cost Per KM Trend (₹/KM)
              </span>
              <div className="h-52">
                {filteredMonthlyMetrics.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-550 text-xs font-mono">No refill logs in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredMonthlyMetrics}>
                      <defs>
                        <linearGradient id="costKmGradDash" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Area type="monotone" dataKey="costPerKm" name="Cost/KM" stroke="#8b5cf6" strokeWidth={2} fill="url(#costKmGradDash)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODE B: COMMUTES CHARTS */}
        {dashboardMode === 'commutes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stacked Commutes Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                Monthly Commute Spend Stacked per Vehicle (₹)
              </span>
              <div className="h-52">
                {categoryMonthlyData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs font-mono">No commutes logged in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Legend />
                      {vehicles.map((v, idx) => (
                        <Bar
                          key={v.id}
                          dataKey={v.id}
                          name={v.name}
                          stackId="a"
                          fill={vehicleColors[idx % vehicleColors.length]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Commutes Categories Share */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Trip Purpose Distribution Share
                </span>
                
                {allCategoriesSpend.length === 0 ? (
                  <p className="text-slate-500 text-xs font-mono py-8 text-center">No commute runs categorized in this range.</p>
                ) : (
                  <div className="space-y-3 pt-1">
                    {(() => {
                      const totalCommuteCost = allCategoriesSpend.reduce((sum, item) => sum + item.cost, 0);
                      return allCategoriesSpend.slice(0, 4).map((item, idx) => {
                        const pct = totalCommuteCost > 0 ? (item.cost / totalCommuteCost) * 100 : 0;
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-semibold text-slate-350">{item.category}</span>
                              <span className="font-bold text-white font-mono">
                                ₹{item.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: vehicleColors[idx % vehicleColors.length]
                                }}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-slate-500 italic mt-3 border-t border-slate-800/80 pt-2">
                Configure dynamic pills or custom trip categories directly in the Daily Run panel.
              </div>
            </div>
          </div>
        )}

        {/* MODE C: CONSOLIDATED SIDE-BY-SIDE COMPARE CHARTS */}
        {dashboardMode === 'consolidated' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart 1: Spend Side-by-Side */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                Refill Spend vs Commute Spend (Side-by-Side)
              </span>
              <div className="h-52">
                {consolidatedMonthlyData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-550 text-xs font-mono">No data logged in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={consolidatedMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Legend />
                      <Bar dataKey="refillsCost" name="Refilled Spend (₹)" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="commutesCost" name="Commuted Cost (₹)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Liters Side-by-Side */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-emerald-400" />
                Liters Filled vs Liters Consumed (L)
              </span>
              <div className="h-52">
                {consolidatedMonthlyData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-550 text-xs font-mono">No data logged in this range.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={consolidatedMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip content={<CustomTooltipContent />} />
                      <Legend />
                      <Bar dataKey="refillsLiters" name="Filled Vol. (L)" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="commutesLiters" name="Consumed Vol. (L)" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODE D: TRIPS CHARTS & VEHICLE BREAKDOWNS */}
        {dashboardMode === 'trips' && (
          <div className="space-y-4">
            {/* Trip Category selector row */}
            <div className="bg-slate-900/40 border border-slate-800/60 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">Active Filter Target</span>
                <span className="text-sm font-bold text-white tracking-tight mt-0.5">Select Trip Purpose:</span>
              </div>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 overflow-x-auto gap-1">
                {categoriesList.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedAnalyticsCategory(cat)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      selectedAnalyticsCategory.toLowerCase() === cat.toLowerCase()
                        ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Stacked cost per month for this specific trip */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  Monthly Spend Stacked per Vehicle for "{selectedAnalyticsCategory}" (₹)
                </span>
                <div className="h-52">
                  {categoryMonthlyData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-550 text-xs font-mono">No data logged in this range.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryMonthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="label" stroke="#475569" fontSize={9} />
                        <YAxis stroke="#475569" fontSize={9} />
                        <Tooltip content={<CustomTooltipContent />} />
                        <Legend />
                        {vehicles.map((v, idx) => (
                          <Bar
                            key={v.id}
                            dataKey={v.id}
                            name={v.name}
                            stackId="a"
                            fill={vehicleColors[idx % vehicleColors.length]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Vehicle breakdown comparison */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase block mb-3 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    Vehicle Cost & Consumption Share
                  </span>
                  
                  {categoryVehicleStats.length === 0 ? (
                    <p className="text-slate-500 text-xs font-mono py-8 text-center">No vehicle data logged for this category.</p>
                  ) : (
                    <div className="space-y-3.5 pt-1">
                      {categoryVehicleStats.map((item, idx) => {
                        const sharePct = categoryTotals.cost > 0 ? (item.cost / categoryTotals.cost) * 100 : 0;
                        return (
                          <div key={item.vehicleId} className="space-y-1">
                            <div className="flex justify-between text-[11px] items-baseline">
                              <div>
                                <span className="font-semibold text-slate-350">{item.name}</span>
                                <span className="text-[9px] text-slate-500 ml-1.5 font-mono">({item.runs} runs)</span>
                              </div>
                              <span className="font-bold text-white font-mono">
                                ₹{item.cost.toLocaleString()} ({sharePct.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${sharePct}%`,
                                  backgroundColor: vehicleColors[idx % vehicleColors.length]
                                }}
                              />
                            </div>
                            <div className="flex justify-between text-[8px] text-slate-550 font-mono">
                              <span>{item.distance.toLocaleString()} km run</span>
                              <span>{item.liters.toFixed(1)} Liters</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 italic mt-3 border-t border-slate-800/80 pt-2">
                  Breakdown based on live estimated fuel usage.
                </div>
              </div>
            </div>

            {/* Logged Runs List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2.5">
                <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5 text-cyan-400 rotate-45" />
                  Recent Commute Logs for "{selectedAnalyticsCategory}" ({categoryLogs.length})
                </span>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {categoryLogs.length === 0 ? (
                  <p className="text-slate-500 text-xs font-mono py-6 text-center">No commute runs match this category in this range.</p>
                ) : (
                  categoryLogs.map((log) => {
                    const logVeh = vehicles.find(v => v.id === log.vehicle_id) || { name: 'Vehicle' };
                    return (
                      <div key={log.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-850 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">{log.notes}</span>
                            <span className="text-[10px] bg-slate-900 px-2 py-0.5 text-slate-400 font-mono rounded border border-slate-800">{logVeh.name}</span>
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono">Logged on: {log.date}</span>
                        </div>
                        <div className="flex gap-4 items-center shrink-0">
                          <div className="text-right text-[10px] font-mono text-slate-450">
                            <div>{log.distance} km</div>
                            <div>{log.estimatedLiters.toFixed(2)} L</div>
                          </div>
                          <span className="font-extrabold text-white font-mono text-sm">₹{log.estimatedCost}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
