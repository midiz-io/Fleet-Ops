/**
 * Utility functions for reliable and standard Fuel Consumption (KMPL) calculations.
 *
 * Full-to-Full Tank Method:
 * 1. KMPL can ONLY be determined when a vehicle is refueled to FULL TANK (is_full_tank = true).
 * 2. When a full tank occurs:
 *    - Find the most recent PREVIOUS full tank log for this vehicle (chronologically prior to current log).
 *    - Distance Traveled = Current Odometer - Previous Full Tank Odometer.
 *    - Total Liters Consumed = Current Refill Liters + Any intermediate partial refills between the two full tanks.
 *    - KMPL = Distance Traveled / Total Liters Consumed.
 * 3. Sanity Verification:
 *    - Distance must be positive and reasonable (e.g., cannot be a jump from 0 or > 3000 km in one tank).
 *    - Total liters must be positive.
 *    - Real-world fleet vehicle bounds: 3.0 km/L <= KMPL <= 35.0 km/L (allowing up to 45.0 for motorbikes).
 *    - If calculated KMPL is outside realistic limits (e.g. 0-odometer jump yielding 3,000+ km/L, or typo),
 *      it is flagged as invalid and null is returned to prevent skewing analytics.
 */

export interface FuelLogLike {
  id?: string;
  vehicle_id: string;
  date: string;
  created_at?: string;
  is_full_tank?: boolean | null;
  before_meter?: number | null;
  after_meter?: number | null;
  liters: number | string;
  kmpl_calculated?: number | null;
  previous_odometer?: number | null;
}

export interface KmplCalculationResult {
  previousFullOdo: number | null;
  distanceKm: number;
  totalLiters: number;
  kmpl: number | null;
  isValid: boolean;
  reason?: string;
}

/**
 * Normalizes log odometer reading. Prefers after_meter, then before_meter.
 */
export function getLogMeter(log: FuelLogLike): number {
  const am = Number(log.after_meter);
  if (!isNaN(am) && am > 0) return am;
  const bm = Number(log.before_meter);
  if (!isNaN(bm) && bm > 0) return bm;
  return 0;
}

/**
 * Calculates KMPL for a fuel log based on the full vehicle history.
 */
export function calculateFuelLogKmpl(
  currentLog: {
    vehicle_id: string;
    date: string;
    meter: number;
    liters: number;
    is_full_tank: boolean;
    currentLogId?: string;
  },
  allVehicleLogs: FuelLogLike[]
): KmplCalculationResult {
  const { meter, liters, is_full_tank, currentLogId } = currentLog;

  // Partial tank refills cannot calculate KMPL until next full tank
  if (!is_full_tank) {
    return {
      previousFullOdo: null,
      distanceKm: 0,
      totalLiters: liters,
      kmpl: null,
      isValid: true,
      reason: "Partial tank refill: KMPL is deferred until next full tank.",
    };
  }

  // Filter out the current log itself (if editing/updating) and sort remaining logs chronologically
  const otherLogs = (allVehicleLogs || []).filter(
    (l) => !currentLogId || l.id !== currentLogId
  );

  // Sort logs chronologically by date, then meter reading
  const sortedHistory = [...otherLogs].sort((a, b) => {
    const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (timeDiff !== 0) return timeDiff;
    return getLogMeter(a) - getLogMeter(b);
  });

  const currentDateObj = new Date(currentLog.date);
  const currentTime = !isNaN(currentDateObj.getTime()) ? currentDateObj.getTime() : Date.now();

  // Find the previous logs prior to this current entry
  // A log is "prior" if its date is before, or if date is equal but meter is lower
  const priorLogs = sortedHistory.filter((l) => {
    const lTime = new Date(l.date).getTime();
    if (lTime < currentTime) return true;
    if (lTime === currentTime) {
      const lMeter = getLogMeter(l);
      return lMeter > 0 && lMeter < meter;
    }
    return false;
  });

  if (priorLogs.length === 0) {
    return {
      previousFullOdo: null,
      distanceKm: 0,
      totalLiters: liters,
      kmpl: null,
      isValid: false,
      reason: "First recorded fuel entry for vehicle: base odometer established.",
    };
  }

  // Find the most recent prior FULL TANK log
  let prevFullIndex = -1;
  for (let i = priorLogs.length - 1; i >= 0; i--) {
    if (priorLogs[i].is_full_tank) {
      prevFullIndex = i;
      break;
    }
  }

  if (prevFullIndex === -1) {
    return {
      previousFullOdo: null,
      distanceKm: 0,
      totalLiters: liters,
      kmpl: null,
      isValid: false,
      reason: "No prior full tank log found to benchmark distance.",
    };
  }

  const prevFullLog = priorLogs[prevFullIndex];
  const prevOdo = getLogMeter(prevFullLog);

  // If previous odometer is 0 or invalid, cannot compute
  if (!prevOdo || prevOdo <= 0) {
    return {
      previousFullOdo: null,
      distanceKm: 0,
      totalLiters: liters,
      kmpl: null,
      isValid: false,
      reason: "Previous log had 0 or missing odometer reading.",
    };
  }

  if (meter <= prevOdo) {
    return {
      previousFullOdo: prevOdo,
      distanceKm: 0,
      totalLiters: liters,
      kmpl: null,
      isValid: false,
      reason: `Current odometer (${meter}) is not greater than previous full tank odometer (${prevOdo}).`,
    };
  }

  const distanceKm = meter - prevOdo;

  // Calculate total liters: intermediate partial refills between prevFullLog and currentLog + current liters
  let intermediateLiters = 0;
  for (let i = prevFullIndex + 1; i < priorLogs.length; i++) {
    const partialL = Number(priorLogs[i].liters) || 0;
    intermediateLiters += partialL;
  }

  const totalLiters = intermediateLiters + liters;

  if (totalLiters <= 0) {
    return {
      previousFullOdo: prevOdo,
      distanceKm,
      totalLiters,
      kmpl: null,
      isValid: false,
      reason: "Total liters must be greater than zero.",
    };
  }

  const rawKmpl = distanceKm / totalLiters;
  const roundedKmpl = Math.round(rawKmpl * 100) / 100;

  // Sanity Guard: Fleet realistic boundaries (2.0 to 65.0 km/L to support motorbikes like Dio BIC 6942 as well as trucks/pickups)
  if (roundedKmpl < 2.0 || roundedKmpl > 65.0) {
    return {
      previousFullOdo: prevOdo,
      distanceKm,
      totalLiters,
      kmpl: null, // reject anomalous values from DB/reports
      isValid: false,
      reason: `Calculated KMPL (${roundedKmpl}) is outside realistic automotive range (2.0 - 65.0 km/L).`,
    };
  }

  return {
    previousFullOdo: prevOdo,
    distanceKm,
    totalLiters,
    kmpl: roundedKmpl,
    isValid: true,
  };
}

export interface FuelRowStatusResult {
  status: "good" | "below" | "partial" | "full_base";
  label: string;
  badgeText: string;
  kmpl: number | null;
  benchmark: number;
  isFullTank: boolean;
  belowBenchmark: boolean;
  vehicleNo: string;
}

/**
 * Single shared KM/L status & label function used across Driver login, Manager login, and Alerts (Fix A6).
 * Always evaluates each fuel row against ITS OWN vehicle's benchmark (never the form's currently selected vehicle)
 * and never labels a full-tank row as "Part fill".
 */
export function evaluateFuelRowStatus(
  log: FuelLogLike,
  vehicles?: Array<{ id: string; vehicle_no?: string; model?: string; benchmark_kmpl?: number }> | null,
  allLogs?: FuelLogLike[] | null
): FuelRowStatusResult {
  const rowVehicle = (vehicles || []).find((v) => v.id === log.vehicle_id);
  const benchmark = Number(rowVehicle?.benchmark_kmpl) || 14;
  const vehicleNo = rowVehicle?.vehicle_no || "Unknown Vehicle";
  const isFullTank = Boolean(log.is_full_tank);

  if (!isFullTank) {
    return {
      status: "partial",
      label: "Part fill",
      badgeText: "Part fill · No KMPL",
      kmpl: null,
      benchmark,
      isFullTank: false,
      belowBenchmark: false,
      vehicleNo,
    };
  }

  // Full tank entry: recalculate from vehicle's chronological full-tank history so old rows are also accurate
  let kmpl: number | null = null;
  const meter = getLogMeter(log);
  const liters = Number(log.liters) || 0;

  if (allLogs && allLogs.length > 0 && meter > 0 && liters > 0) {
    const vehicleLogs = allLogs.filter((l) => l.vehicle_id === log.vehicle_id && getLogMeter(l) > 0);
    const calc = calculateFuelLogKmpl(
      {
        vehicle_id: log.vehicle_id,
        date: log.date,
        meter,
        liters,
        is_full_tank: true,
        currentLogId: log.id,
      },
      vehicleLogs
    );
    if (calc.isValid && calc.kmpl !== null) {
      kmpl = calc.kmpl;
    }
  }

  if (kmpl === null) {
    const storedKmpl = log.kmpl_calculated !== null && log.kmpl_calculated !== undefined ? Number(log.kmpl_calculated) : null;
    if (storedKmpl !== null && !isNaN(storedKmpl) && storedKmpl >= 2.0 && storedKmpl <= 65.0) {
      kmpl = Math.round(storedKmpl * 100) / 100;
    }
  }

  if (kmpl === null) {
    return {
      status: "full_base",
      label: "Full tank · Base reading",
      badgeText: "Full tank · Base reading",
      kmpl: null,
      benchmark,
      isFullTank: true,
      belowBenchmark: false,
      vehicleNo,
    };
  }

  const isGood = kmpl >= benchmark;
  return {
    status: isGood ? "good" : "below",
    label: isGood ? "Good" : "Below benchmark",
    badgeText: `${kmpl.toFixed(1)} km/L · ${isGood ? "Good" : "Below benchmark"}`,
    kmpl,
    benchmark,
    isFullTank: true,
    belowBenchmark: !isGood,
    vehicleNo,
  };
}
