import { FuelEntry, CalculatedEntry, DateFilter, OverallMetrics, MonthlyMetric, YearlyMetric, SmartInsight } from '../types';

/**
 * Perform chronological calculation on raw fuel entries.
 * Returns fuel entries annotated with distanceTravelled and mileage for each refill (except the first entry).
 */
export function calculateEntries(entries: FuelEntry[]): CalculatedEntry[] {
  if (entries.length === 0) return [];

  // Sort chronologically by date and odometer to ensure logical sequence
  const sorted = [...entries].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.odometer - b.odometer;
  });

  // 1. Initial mapping for distances and default mileage
  const computed: CalculatedEntry[] = sorted.map((entry, index) => {
    if (index === 0) {
      return {
        ...entry,
        distanceTravelled: undefined,
        mileage: undefined,
      };
    }

    const prevEntry = sorted[index - 1];
    const distance = Math.max(0, entry.odometer - prevEntry.odometer);
    
    // Default/provisional segment mileage if doing a top-up
    const mileage = entry.liters > 0 ? Number((distance / entry.liters).toFixed(2)) : 0;

    return {
      ...entry,
      distanceTravelled: distance,
      mileage: mileage,
    };
  });

  // 2. Perform advanced full-tank block retrospective calculations
  // A "block" is bounded by "Full" refills (where is_partial is false or undefined).
  let lastFullIndex = 0;
  let accruedLiters = 0;

  for (let i = 1; i < computed.length; i++) {
    const entry = computed[i];
    accruedLiters += entry.liters;

    const isFull = !entry.is_partial; // If not partial, it is a full tank refill

    if (isFull) {
      // Calculate retrospective exact average mileage since last full fill-up
      const totalBlockDistance = entry.odometer - computed[lastFullIndex].odometer;
      const exactBlockMileage = accruedLiters > 0 && totalBlockDistance > 0
        ? Number((totalBlockDistance / accruedLiters).toFixed(2))
        : 0;

      // Retrospectively assign this exact average to all entries in this block
      if (exactBlockMileage > 0) {
        for (let j = lastFullIndex + 1; j <= i; j++) {
          computed[j].mileage = exactBlockMileage;
        }
      }

      // Reset block trackers for the next block
      lastFullIndex = i;
      accruedLiters = 0;
    }
  }

  // 3. Compute sequential running average mileages
  const validMileages: number[] = [];
  computed.forEach((entry) => {
    if (entry.mileage !== undefined && entry.mileage > 0) {
      validMileages.push(entry.mileage);
    }
    const runningAverage = validMileages.length > 0
      ? Number((validMileages.reduce((sum, val) => sum + val, 0) / validMileages.length).toFixed(2))
      : undefined;

    entry.runningAverageMileage = runningAverage;
  });

  // 4. Calculate exact Range of vehicle on each refill based on past average
  let pastAvg = 12.5; // baseline vehicle default if no history yet
  computed.forEach((entry) => {
    entry.estimatedRange = Number((entry.liters * pastAvg).toFixed(1));
    if (entry.runningAverageMileage && entry.runningAverageMileage > 0) {
      pastAvg = entry.runningAverageMileage;
    }
  });

  return computed;
}

/**
 * Validates a new fuel entry's odometer against previous and next entries.
 * Returns true if valid, or a string descriptive error if invalid.
 */
export function validateOdometer(
  odometer: number,
  date: string,
  entryId: string | undefined,
  existingEntries: FuelEntry[]
): { isValid: boolean; error?: string } {
  if (existingEntries.length === 0) return { isValid: true };

  // Chrono-sort all EXCEPT the current entry if we are editing
  const otherEntries = existingEntries
    .filter(e => e.id !== entryId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.odometer - b.odometer);

  if (otherEntries.length === 0) return { isValid: true };

  const currentDateTime = new Date(date).getTime();

  // Find the closest preceding and succeeding entries
  let previous: FuelEntry | null = null;
  let next: FuelEntry | null = null;

  for (let i = 0; i < otherEntries.length; i++) {
    const entry = otherEntries[i];
    const entryTime = new Date(entry.date).getTime();

    if (entryTime < currentDateTime || (entryTime === currentDateTime && entry.odometer <= odometer)) {
      previous = entry;
    } else if (entryTime > currentDateTime && !next) {
      next = entry;
    }
  }

  // Fallback to strict odometer search if exact dates are equal
  if (!previous && otherEntries.length > 0) {
    // If date is before all, it shouldn't have odometer greater than successors
    const firstSuccessor = otherEntries[0];
    if (odometer >= firstSuccessor.odometer) {
      return {
        isValid: false,
        error: `Odometer (${odometer}) must be less than the succeeding entry on ${firstSuccessor.date} (${firstSuccessor.odometer} km).`,
      };
    }
  }

  if (previous && odometer <= previous.odometer) {
    return {
      isValid: false,
      error: `Odometer must be greater than the previous entry on ${previous.date} (${previous.odometer} km).`,
    };
  }

  if (next && odometer >= next.odometer) {
    return {
      isValid: false,
      error: `Odometer must be less than the next entry on ${next.date} (${next.odometer} km).`,
    };
  }

  return { isValid: true };
}

/**
 * Filters calculated entries according to the designated date filter parameters.
 */
export function filterCalculatedEntries(entries: CalculatedEntry[], filter: DateFilter): CalculatedEntry[] {
  return entries.filter(entry => {
    const dateStr = entry.date;
    return dateStr >= filter.startDate && dateStr <= filter.endDate;
  });
}

/**
 * Computes overall metrics for any slice of calculations
 */
export function calculateOverallMetrics(calculatedEntries: CalculatedEntry[]): OverallMetrics {
  const refills = calculatedEntries.length;
  if (refills === 0) {
    return {
      currentMileage: 0,
      averageMileage: 0,
      bestMileage: 0,
      worstMileage: 0,
      totalDistance: 0,
      totalCost: 0,
      totalLiters: 0,
      totalRefills: 0,
      costPerKm: 0,
    };
  }

  let totalCost = 0;
  let totalLiters = 0;
  let totalDistance = 0;

  const validMileages: number[] = [];

  calculatedEntries.forEach(entry => {
    totalCost += entry.amount_paid;
    totalLiters += entry.liters;
    if (entry.distanceTravelled !== undefined) {
      totalDistance += entry.distanceTravelled;
    }
    if (entry.mileage !== undefined && entry.mileage > 0) {
      validMileages.push(entry.mileage);
    }
  });

  const lastEntryWithMileage = [...calculatedEntries]
    .reverse()
    .find(e => e.mileage !== undefined && e.mileage > 0);

  const currentMileage = lastEntryWithMileage?.mileage || 0;
  
  // Average mileage can either be simple average or weighted average.
  // The system guidelines asks: "Average of all calculated mileages. Best Mileage: max calculated mileage, Worst: min"
  const averageMileage = validMileages.length > 0
    ? Number((validMileages.reduce((sum, val) => sum + val, 0) / validMileages.length).toFixed(2))
    : 0;

  const bestMileage = validMileages.length > 0 ? Math.max(...validMileages) : 0;
  const worstMileage = validMileages.length > 0 ? Math.min(...validMileages) : 0;
  const costPerKm = totalDistance > 0 ? Number((totalCost / totalDistance).toFixed(2)) : 0;

  return {
    currentMileage,
    averageMileage,
    bestMileage,
    worstMileage,
    totalDistance,
    totalCost: Number(totalCost.toFixed(2)),
    totalLiters: Number(totalLiters.toFixed(2)),
    totalRefills: refills,
    costPerKm,
  };
}

/**
 * Formats a key YYYY-MM into readable month names (e.g. "June 2026")
 */
export function formatMonthKey(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 15);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

/**
 * Groups and analyzes entries by year-month (YYYY-MM).
 */
export function generateMonthlyMetrics(allCalculatedEntries: CalculatedEntry[]): MonthlyMetric[] {
  const groups: Record<string, CalculatedEntry[]> = {};
  
  allCalculatedEntries.forEach(entry => {
    const monthKey = entry.date.substring(0, 7); // "YYYY-MM"
    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(entry);
  });

  const keys = Object.keys(groups).sort();
  
  return keys.map(monthKey => {
    const monthEntries = groups[monthKey];
    const label = formatMonthKey(monthKey);
    const totalCost = monthEntries.reduce((sum, e) => sum + e.amount_paid, 0);
    const totalLiters = monthEntries.reduce((sum, e) => sum + e.liters, 0);
    const totalDistance = monthEntries.reduce((sum, e) => sum + (e.distanceTravelled || 0), 0);
    
    const validMileages = monthEntries
      .map(e => e.mileage)
      .filter((m): m is number => m !== undefined && m > 0);
    
    const averageMileage = validMileages.length > 0
      ? Number((validMileages.reduce((sum, val) => sum + val, 0) / validMileages.length).toFixed(2))
      : 0;
      
    const refillsCount = monthEntries.length;
    const averageRefillAmount = refillsCount > 0 ? Number((totalCost / refillsCount).toFixed(2)) : 0;
    const averageFuelPrice = totalLiters > 0 ? Number((totalCost / totalLiters).toFixed(3)) : 0;
    
    // Calculate calendar days in this month
    const [year, month] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyFuelCostAverage = Number((totalCost / daysInMonth).toFixed(2));
    
    const costPerKm = totalDistance > 0 ? Number((totalCost / totalDistance).toFixed(2)) : 0;

    return {
      monthKey,
      label,
      totalCost: Number(totalCost.toFixed(2)),
      totalLiters: Number(totalLiters.toFixed(2)),
      totalDistance,
      averageMileage,
      refillsCount,
      averageRefillAmount,
      averageFuelPrice,
      dailyFuelCostAverage,
      costPerKm,
    };
  });
}

/**
 * Groups and analyzes entries on a yearly basis.
 */
export function generateYearlyMetrics(
  allCalculatedEntries: CalculatedEntry[],
  monthlyMetrics: MonthlyMetric[]
): YearlyMetric[] {
  const groups: Record<number, CalculatedEntry[]> = {};
  
  allCalculatedEntries.forEach(entry => {
    const year = new Date(entry.date).getFullYear();
    if (!groups[year]) {
      groups[year] = [];
    }
    groups[year].push(entry);
  });

  const years = Object.keys(groups).map(Number).sort((a, b) => b - a); // reverse chronological descending

  return years.map(year => {
    const yearEntries = groups[year];
    const totalCost = yearEntries.reduce((sum, e) => sum + e.amount_paid, 0);
    const totalLiters = yearEntries.reduce((sum, e) => sum + e.liters, 0);
    const totalDistance = yearEntries.reduce((sum, e) => sum + (e.distanceTravelled || 0), 0);
    
    const validMileages = yearEntries
      .map(e => e.mileage)
      .filter((m): m is number => m !== undefined && m > 0);
      
    const avgMileage = validMileages.length > 0
      ? Number((validMileages.reduce((sum, val) => sum + val, 0) / validMileages.length).toFixed(2))
      : 0;

    const costPerKm = totalDistance > 0 ? Number((totalCost / totalDistance).toFixed(2)) : 0;
    
    // Find active months for this specific year
    const yearMonths = monthlyMetrics.filter(m => m.monthKey.startsWith(year.toString()));
    const monthsCount = yearMonths.length || 12; // fallback to 12 if no data

    const avgMonthlyCost = Number((totalCost / monthsCount).toFixed(2));
    const avgMonthlyDistance = Number((totalDistance / monthsCount).toFixed(2));
    const avgMonthlyLiters = Number((totalLiters / monthsCount).toFixed(2));

    // Spending peak/valleys
    let highestSpendingMonth: { label: string; amount: number } | null = null;
    let lowestSpendingMonth: { label: string; amount: number } | null = null;
    let highestMileageMonth: { label: string; mileage: number } | null = null;
    let lowestMileageMonth: { label: string; mileage: number } | null = null;

    if (yearMonths.length > 0) {
      // Find spending
      const sortedBySpend = [...yearMonths].sort((a, b) => b.totalCost - a.totalCost);
      highestSpendingMonth = { label: sortedBySpend[0].label, amount: sortedBySpend[0].totalCost };
      lowestSpendingMonth = { label: sortedBySpend[sortedBySpend.length - 1].label, amount: sortedBySpend[sortedBySpend.length - 1].totalCost };

      // Find mileage (filter out months with 0 mileage first)
      const monthsWithMileage = yearMonths.filter(m => m.averageMileage > 0);
      if (monthsWithMileage.length > 0) {
        const sortedByMileage = [...monthsWithMileage].sort((a, b) => b.averageMileage - a.averageMileage);
        highestMileageMonth = { label: sortedByMileage[0].label, mileage: sortedByMileage[0].averageMileage };
        lowestMileageMonth = { label: sortedByMileage[sortedByMileage.length - 1].label, mileage: sortedByMileage[sortedByMileage.length - 1].averageMileage };
      }
    }

    return {
      year,
      totalCost: Number(totalCost.toFixed(2)),
      totalDistance,
      totalLiters: Number(totalLiters.toFixed(2)),
      avgMonthlyCost,
      avgMonthlyDistance,
      avgMonthlyLiters,
      avgMileage,
      costPerKm,
      highestSpendingMonth,
      lowestSpendingMonth,
      highestMileageMonth,
      lowestMileageMonth,
    };
  });
}

/**
 * Automatically inspects recent monthly patterns to generate intelligent, personalized alerts.
 */
export function generateSmartInsights(monthlyMetrics: MonthlyMetric[], currentYear: number): SmartInsight[] {
  const insights: SmartInsight[] = [];
  
  if (monthlyMetrics.length === 0) {
    return [{
      type: 'neutral',
      title: 'Awaiting Records',
      description: 'Fill in your odometer and fuel readings to unlock custom mileage analytics and dynamic spending predictions.',
    }];
  }

  // 1. Get the most recent month with data, and compare it to the prior month
  const activeMonths = [...monthlyMetrics].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const latestMonth = activeMonths[activeMonths.length - 1];
  const previousMonth = activeMonths.length > 1 ? activeMonths[activeMonths.length - 2] : null;

  if (latestMonth) {
    if (previousMonth) {
      // Spending comparison
      if (previousMonth.totalCost > 0) {
        const spendDiffPct = ((latestMonth.totalCost - previousMonth.totalCost) / previousMonth.totalCost) * 100;
        if (Math.abs(spendDiffPct) >= 2) {
          const trendDir = spendDiffPct > 0 ? 'increased' : 'decreased';
          const indicator = spendDiffPct > 0 ? 'warning' : 'positive';
          insights.push({
            type: indicator as any,
            title: `Monthly Spend Changed`,
            description: `Fuel spending ${trendDir} by ${Math.abs(spendDiffPct).toFixed(1)}% compared to last active month (${previousMonth.label}).`,
          });
        }
      }

      // Mileage comparison
      if (previousMonth.averageMileage > 0 && latestMonth.averageMileage > 0) {
        const mileageDiffPct = ((latestMonth.averageMileage - previousMonth.averageMileage) / previousMonth.averageMileage) * 100;
        if (Math.abs(mileageDiffPct) >= 1) {
          const trendDir = mileageDiffPct > 0 ? 'improved' : 'dropped';
          const indicator = mileageDiffPct > 0 ? 'positive' : 'warning';
          insights.push({
            type: indicator as any,
            title: `Mileage Efficiency Trend`,
            description: `Your average fuel efficiency ${trendDir} by ${Math.abs(mileageDiffPct).toFixed(1)}% (now at ${latestMonth.averageMileage} km/l vs ${previousMonth.averageMileage} km/l).`,
          });
        }
      }

      // Cost per KM comparison
      if (previousMonth.costPerKm > 0 && latestMonth.costPerKm > 0) {
        const costDiff = latestMonth.costPerKm - previousMonth.costPerKm;
        if (Math.abs(costDiff) >= 0.05) {
          const trendDir = costDiff < 0 ? 'decreased' : 'increased';
          const indicator = costDiff < 0 ? 'positive' : 'warning';
          insights.push({
            type: indicator as any,
            title: `Cost Per Kilometer`,
            description: `Your expense per kilometer traveled ${trendDir} to ₹${latestMonth.costPerKm.toFixed(2)}/km from ₹${previousMonth.costPerKm.toFixed(2)}/km last month.`,
          });
        }
      }
    }

    // 2. Yearly forecast and average spending
    const currentYearKey = currentYear.toString();
    const currentYearMonths = activeMonths.filter(m => m.monthKey.startsWith(currentYearKey));
    if (currentYearMonths.length > 0) {
      const yearCost = currentYearMonths.reduce((sum, m) => sum + m.totalCost, 0);
      const activeMonthsCount = currentYearMonths.length;
      const avgMonthlySpend = yearCost / activeMonthsCount;
      const estYearEnd = avgMonthlySpend * 12;

      insights.push({
        type: 'info',
        title: 'Annual Forecast & Budgets',
        description: `Average monthly spending in ${currentYear} is ₹${avgMonthlySpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Estimated year-end fuel cost stands at ₹${estYearEnd.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
      });
    }

    // 3. High expense alerts
    if (latestMonth.averageFuelPrice > 0) {
      // Find price trends
      const allPrices = activeMonths.map(m => m.averageFuelPrice).filter(p => p > 0);
      const maxPrice = Math.max(...allPrices);
      if (latestMonth.averageFuelPrice >= maxPrice && allPrices.length > 1) {
        insights.push({
          type: 'warning',
          title: 'Peak Fuel Price Warning',
          description: `This month’s average fuel value (₹${latestMonth.averageFuelPrice.toFixed(2)}/l) is at a historic high since recorded logs.`,
        });
      }
    }
  }

  // Fallback insight
  if (insights.length === 0) {
    insights.push({
      type: 'neutral',
      title: 'Tracking Active',
      description: 'Your metrics are stable. Add more refills regularly to reveal long-term seasonal and performance trends.',
    });
  }

  return insights;
}

/**
 * Builds preset dates helper
 */
export function getPresetDateRange(preset: string): { startDate: string; endDate: string } {
  const today = new Date();
  
  // Format to string date YYYY-MM-DD using local time coordinates to prevent timezone shift errors
  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  switch (preset) {
    case 'current_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { startDate: format(firstDay), endDate: format(lastDay) };
    }
    case 'previous_month': {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: format(firstDay), endDate: format(lastDay) };
    }
    case 'current_year': {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      const lastDay = new Date(today.getFullYear(), 11, 31);
      return { startDate: format(firstDay), endDate: format(lastDay) };
    }
    case 'custom_range':
    default: {
      // Default to last 90 days
      const past = new Date();
      past.setDate(today.getDate() - 90);
      return { startDate: format(past), endDate: format(today) };
    }
  }
}
