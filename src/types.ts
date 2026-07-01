export interface Vehicle {
  id: string; // 'vehicle_1' | 'vehicle_2' | 'vehicle_3'
  name: string;
  model: string;
  capacity: number; // Tank capacity in liters
  fuelType: string; // e.g., 'Petrol' | 'Diesel' | 'CNG' | 'Hybrid'
  default_mileage?: number; // fallback mileage in km/L (e.g. 15)
  default_fuel_price?: number; // fallback fuel price per L (e.g. 100)
}

export interface FuelEntry {
  id: string; // uuid
  date: string; // date string (YYYY-MM-DD)
  odometer: number; // integer
  liters: number; // decimal/float
  amount_paid: number; // decimal/float
  price_per_liter: number; // calculated: amount_paid / liters
  notes: string; // text
  is_partial?: boolean; // true if this was a partial fill-up (top-up), false if full tank
  vehicle_id?: string; // which vehicle this entry belongs to ('vehicle_1', 'vehicle_2', 'vehicle_3')
  created_at?: string; // ISO timestamp
}

export interface CalculatedEntry extends FuelEntry {
  distanceTravelled?: number; // current_odometer - previous_odometer
  mileage?: number; // distanceTravelled / liters OR block mileage if partial gets closed
  runningAverageMileage?: number; // running average mileage up to and including this entry
  estimatedRange?: number; // range of the vehicle on this fill-up liters based on historical avg
}

export type FilterPreset = 'current_month' | 'previous_month' | 'current_year' | 'custom_range';

export interface DateFilter {
  preset: FilterPreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface OverallMetrics {
  currentMileage: number;
  averageMileage: number;
  bestMileage: number;
  worstMileage: number;
  totalDistance: number;
  totalCost: number;
  totalLiters: number;
  totalRefills: number;
  costPerKm: number;
}

export interface MonthlyMetric {
  monthKey: string; // YYYY-MM
  label: string; // e.g. "June 2026"
  totalCost: number;
  totalLiters: number;
  totalDistance: number;
  averageMileage: number;
  refillsCount: number;
  averageRefillAmount: number;
  averageFuelPrice: number;
  dailyFuelCostAverage: number;
  costPerKm: number;
}

export interface YearlyMetric {
  year: number;
  totalCost: number;
  totalDistance: number;
  totalLiters: number;
  avgMonthlyCost: number;
  avgMonthlyDistance: number;
  avgMonthlyLiters: number;
  avgMileage: number;
  costPerKm: number;
  highestSpendingMonth: { label: string; amount: number } | null;
  lowestSpendingMonth: { label: string; amount: number } | null;
  highestMileageMonth: { label: string; mileage: number } | null;
  lowestMileageMonth: { label: string; mileage: number } | null;
}

export interface SmartInsight {
  type: 'info' | 'positive' | 'warning' | 'neutral';
  title: string;
  description: string;
}

export interface DailyRunLog {
  id: string;
  date: string; // YYYY-MM-DD
  vehicle_id: string;
  mode: 'odometer' | 'distance';
  startOdometer?: number;
  endOdometer?: number;
  distance: number; // in km
  estimatedLiters: number;
  estimatedCost: number;
  notes: string; // e.g., "Office trip", "University run"
  customMileage?: number;
  customFuelPrice?: number;
  category?: string;
  created_at: string;
}

export interface SavedRoute {
  id: string;
  name: string; // e.g., "Office commute"
  distance: number; // in km
  isRoundTrip: boolean;
  vehicle_id: string; // default vehicle for this trip
  category?: string;
}
