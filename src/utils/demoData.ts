import { FuelEntry, DailyRunLog, Vehicle } from '../types';

export function getDemoData(username: string): {
  entries: FuelEntry[];
  dailyLogs: DailyRunLog[];
  vehicles: Vehicle[];
} {
  const user = username.trim().toLowerCase();
  
  // 1. Vehicles
  const vehicles: Vehicle[] = [
    { id: 'vehicle_1', name: 'Honda Civic', model: 'Sedan', capacity: 50, fuelType: 'Petrol', default_mileage: 12, default_fuel_price: 100 },
    { id: 'vehicle_2', name: 'Yamaha MT-15', model: 'Bike', capacity: 10, fuelType: 'Petrol', default_mileage: 40, default_fuel_price: 100 },
    { id: 'vehicle_3', name: 'Tata Nexon', model: 'CNG SUV', capacity: 60, fuelType: 'CNG', default_mileage: 18, default_fuel_price: 90 },
  ];

  const entries: FuelEntry[] = [];
  const dailyLogs: DailyRunLog[] = [];

  const today = new Date();

  // Helper to get formatted YYYY-MM-DD date relative to today
  const getRelativeDateStr = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() - daysAgo);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  // --- VEHICLE 1: Honda Civic (Petrol, target mileage 12 km/L) ---
  let odo1 = 24500;
  const refillIntervals1 = [170, 150, 135, 120, 102, 85, 68, 50, 32, 15, 2];
  refillIntervals1.reverse();

  refillIntervals1.forEach((daysAgo, idx) => {
    const date = getRelativeDateStr(daysAgo);
    const liters = Number((38 + Math.random() * 6).toFixed(2)); 
    const mileage = 11.2 + Math.random() * 1.5;
    const distance = Math.round(liters * mileage);
    odo1 += distance;
    const fuelPrice = 98 + Math.round(Math.random() * 4); // ₹98 - ₹102
    const amount = Math.round(liters * fuelPrice);
    
    entries.push({
      id: `demo_refill_civic_${idx}`,
      date,
      odometer: odo1,
      liters,
      amount_paid: amount,
      price_per_liter: fuelPrice,
      notes: `Gas Fillup [v:vehicle_1] [u:${user}]`,
      is_partial: false,
      vehicle_id: 'vehicle_1'
    });
  });

  // --- VEHICLE 2: Yamaha MT-15 (Bike, target mileage 40 km/L) ---
  let odo2 = 8200;
  const refillIntervals2 = [175, 163, 152, 140, 131, 120, 110, 99, 88, 77, 65, 54, 43, 31, 20, 8];
  refillIntervals2.reverse();

  refillIntervals2.forEach((daysAgo, idx) => {
    const date = getRelativeDateStr(daysAgo);
    const liters = Number((7 + Math.random() * 2).toFixed(2));
    const mileage = 38 + Math.random() * 4;
    const distance = Math.round(liters * mileage);
    odo2 += distance;
    const fuelPrice = 98 + Math.round(Math.random() * 4);
    const amount = Math.round(liters * fuelPrice);

    entries.push({
      id: `demo_refill_bike_${idx}`,
      date,
      odometer: odo2,
      liters,
      amount_paid: amount,
      price_per_liter: fuelPrice,
      notes: `Station topup [v:vehicle_2] [u:${user}]`,
      is_partial: false,
      vehicle_id: 'vehicle_2'
    });
  });

  // --- VEHICLE 3: Tata Nexon (CNG SUV, target mileage 18 km/L) ---
  let odo3 = 12400;
  const refillIntervals3 = [165, 148, 130, 112, 95, 78, 60, 42, 25, 8];
  refillIntervals3.reverse();

  refillIntervals3.forEach((daysAgo, idx) => {
    const date = getRelativeDateStr(daysAgo);
    const liters = Number((45 + Math.random() * 10).toFixed(2));
    const mileage = 17 + Math.random() * 2;
    const distance = Math.round(liters * mileage);
    odo3 += distance;
    const fuelPrice = 85 + Math.round(Math.random() * 5);
    const amount = Math.round(liters * fuelPrice);

    entries.push({
      id: `demo_refill_nexon_${idx}`,
      date,
      odometer: odo3,
      liters,
      amount_paid: amount,
      price_per_liter: fuelPrice,
      notes: `CNG Refuel Station [v:vehicle_3] [u:${user}]`,
      is_partial: false,
      vehicle_id: 'vehicle_3'
    });
  });

  // --- DAILY COMMUTES ---
  const commuteConfigs = [
    { category: 'Office', notes: 'Daily Office Commute', distance: 34, vehicle_id: 'vehicle_1' },
    { category: 'Office', notes: 'Office client visit', distance: 48, vehicle_id: 'vehicle_1' },
    { category: 'University', notes: 'College lectures', distance: 18, vehicle_id: 'vehicle_2' },
    { category: 'University', notes: 'Library study run', distance: 22, vehicle_id: 'vehicle_2' },
    { category: 'Personal', notes: 'Weekend movie & dinner', distance: 28, vehicle_id: 'vehicle_1' },
    { category: 'Personal', notes: 'Gym & workout session', distance: 8, vehicle_id: 'vehicle_2' },
    { category: 'Business', notes: 'Vendor supplies pickup', distance: 75, vehicle_id: 'vehicle_3' },
    { category: 'Business', notes: 'CNG site inspection run', distance: 90, vehicle_id: 'vehicle_3' },
    { category: 'Grocery', notes: 'Supermarket weekly grocery', distance: 12, vehicle_id: 'vehicle_3' },
    { category: 'Grocery', notes: 'Local organic market visit', distance: 15, vehicle_id: 'vehicle_1' },
    { category: 'Weekend Trip', notes: 'Outstation getaway', distance: 210, vehicle_id: 'vehicle_3' },
    { category: 'Road Trip', notes: 'Highway weekend ride', distance: 140, vehicle_id: 'vehicle_2' },
  ];

  let logId = 0;
  for (let d = 175; d >= 3; d -= 3) {
    const date = getRelativeDateStr(d);
    const cfg = commuteConfigs[Math.floor(Math.random() * commuteConfigs.length)];
    const veh = vehicles.find(v => v.id === cfg.vehicle_id)!;
    const mileage = veh.default_mileage || 15;
    const estLiters = Number((cfg.distance / mileage).toFixed(2));
    const price = veh.default_fuel_price || 100;
    const estCost = Math.round(estLiters * price);

    dailyLogs.push({
      id: `demo_commute_${logId++}`,
      date,
      vehicle_id: cfg.vehicle_id,
      mode: 'distance',
      distance: cfg.distance,
      estimatedLiters: estLiters,
      estimatedCost: estCost,
      notes: `${cfg.notes}`,
      category: cfg.category,
      created_at: new Date(date).toISOString()
    });
  }

  return { entries, dailyLogs, vehicles };
}
