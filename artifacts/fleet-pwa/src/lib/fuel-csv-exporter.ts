import { supabase } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import { normalizeVehicleNo } from "@/hooks/use-vehicles";

export interface FuelCsvFilterOptions {
  from?: string | null;
  to?: string | null;
  vehicleId?: string | null;
  vehicleNo?: string | null;
  driverId?: string | null;
  group?: string | null;
}

export async function generateFuelCsv(
  type: "daily" | "vehicle" | "monthly",
  filters?: FuelCsvFilterOptions
): Promise<string> {
  const [{ data: rawFuelLogs }, { data: vehicles }, { data: drivers }, { data: rawCosts }] = await Promise.all([
    supabase.from("fuel_logs").select("*").order("date", { ascending: false }),
    supabase.from("vehicles").select("*"),
    supabase.from("drivers").select("*"),
    supabase.from("cost_entries").select("*").order("date", { ascending: false }),
  ]);

  const vehicleMap = Object.fromEntries(
    (vehicles || []).map(v => [v.id, { ...v, vehicle_no: normalizeVehicleNo(v.vehicle_no) }])
  );
  const driverMap = Object.fromEntries((drivers || []).map(d => [d.id, d]));

  // Apply filters to fuelLogs
  let fuelLogs = rawFuelLogs || [];
  if (filters) {
    if (filters.from && filters.from !== "all") {
      fuelLogs = fuelLogs.filter(log => (log.date || "") >= filters.from!);
    }
    if (filters.to && filters.to !== "all") {
      fuelLogs = fuelLogs.filter(log => (log.date || "") <= filters.to!);
    }
    if (filters.vehicleId && filters.vehicleId !== "all") {
      fuelLogs = fuelLogs.filter(log => log.vehicle_id === filters.vehicleId);
    }
    if (filters.vehicleNo && filters.vehicleNo !== "all") {
      const normTarget = normalizeVehicleNo(filters.vehicleNo);
      fuelLogs = fuelLogs.filter(log => {
        const v = vehicleMap[log.vehicle_id];
        return v && normalizeVehicleNo(v.vehicle_no) === normTarget;
      });
    }
    if (filters.driverId && filters.driverId !== "all") {
      fuelLogs = fuelLogs.filter(log => log.driver_id === filters.driverId);
    }
    if (filters.group && filters.group !== "all") {
      const targetGroup = filters.group.toLowerCase();
      fuelLogs = fuelLogs.filter(log => {
        const v = vehicleMap[log.vehicle_id];
        return ((v as any)?.group || "Tropical").toLowerCase() === targetGroup;
      });
    }
  }

  // 1. Daily fuel log
  if (type === "daily") {
    const headers = "date,time,vehicle,driver,litres,amount,odometer,km/L";
    const rows = fuelLogs.map(log => {
      const v = vehicleMap[log.vehicle_id];
      const d = driverMap[log.driver_id];
      const vNo = v?.vehicle_no || "Unknown";
      const dName = d?.name || "Unknown";

      let timeStr = "--:--";
      if (log.created_at) {
        try {
          timeStr = format(parseISO(log.created_at), "HH:mm");
        } catch {}
      }

      const odo = log.after_meter || log.before_meter || 0;
      const kmpl = log.is_full_tank ? (log.kmpl_calculated ? log.kmpl_calculated.toFixed(2) : "calc") : "part fill";

      return `${log.date},${timeStr},"${vNo}","${dName}",${log.liters},${log.amount_paid},${odo},${kmpl}`;
    });

    return [headers, ...rows].join("\n");
  }

  // 2. Fuel per vehicle summary
  if (type === "vehicle") {
    let targetVehicles = vehicles || [];
    if (filters?.vehicleId && filters.vehicleId !== "all") {
      targetVehicles = targetVehicles.filter(v => v.id === filters.vehicleId);
    }
    if (filters?.vehicleNo && filters.vehicleNo !== "all") {
      const norm = normalizeVehicleNo(filters.vehicleNo);
      targetVehicles = targetVehicles.filter(v => normalizeVehicleNo(v.vehicle_no) === norm);
    }
    if (filters?.group && filters.group !== "all") {
      const grp = filters.group.toLowerCase();
      targetVehicles = targetVehicles.filter(v => ((v as any)?.group || "Tropical").toLowerCase() === grp);
    }

    const headers = "vehicle,model,group,total_litres,total_amount,total_km,avg_km_per_litre,last_odometer";
    const vStats: Record<string, { liters: number; amount: number; minOdo: number; maxOdo: number; count: number }> = {};

    fuelLogs.forEach(log => {
      if (!vStats[log.vehicle_id]) {
        vStats[log.vehicle_id] = { liters: 0, amount: 0, minOdo: Infinity, maxOdo: -Infinity, count: 0 };
      }
      const s = vStats[log.vehicle_id];
      s.liters += Number(log.liters) || 0;
      s.amount += Number(log.amount_paid) || 0;
      s.count++;
      const odo = Number(log.after_meter || log.before_meter) || 0;
      if (odo > 0) {
        if (odo < s.minOdo) s.minOdo = odo;
        if (odo > s.maxOdo) s.maxOdo = odo;
      }
    });

    const rows = targetVehicles.map(v => {
      const s = vStats[v.id] || { liters: 0, amount: 0, minOdo: 0, maxOdo: 0, count: 0 };
      const deltaKm = (s.maxOdo > s.minOdo && s.minOdo !== Infinity) ? s.maxOdo - s.minOdo : 0;
      const avgKmpl = deltaKm > 0 && s.liters > 0 ? (deltaKm / s.liters).toFixed(2) : (v.benchmark_kmpl || 14);
      const lastOdo = s.maxOdo > 0 ? s.maxOdo : (v as any).current_km || 0;

      return `"${normalizeVehicleNo(v.vehicle_no)}","${v.model}","${(v as any).group || 'Tropical'}",${s.liters.toFixed(1)},${s.amount.toFixed(2)},${deltaKm},${avgKmpl},${lastOdo}`;
    });

    return [headers, ...rows].join("\n");
  }

  // 3. Monthly cost summary
  if (type === "monthly") {
    let costs = rawCosts || [];
    if (filters?.from && filters.from !== "all") {
      costs = costs.filter(c => (c.date || "") >= filters.from!);
    }
    if (filters?.to && filters.to !== "all") {
      costs = costs.filter(c => (c.date || "") <= filters.to!);
    }
    if (filters?.vehicleId && filters.vehicleId !== "all") {
      costs = costs.filter(c => c.vehicle_id === filters.vehicleId);
    }

    const headers = "month,fuel_cost,service_cost,other_cost,total_cost";
    const monthStats: Record<string, { fuel: number; service: number; other: number }> = {};

    fuelLogs.forEach(log => {
      const month = (log.date || "").slice(0, 7) || "Unknown";
      if (!monthStats[month]) monthStats[month] = { fuel: 0, service: 0, other: 0 };
      monthStats[month].fuel += Number(log.amount_paid) || 0;
    });

    costs.forEach(c => {
      const month = (c.date || "").slice(0, 7) || "Unknown";
      if (!monthStats[month]) monthStats[month] = { fuel: 0, service: 0, other: 0 };
      if (c.category === "fuel") monthStats[month].fuel += Number(c.amount) || 0;
      else if (c.category === "service") monthStats[month].service += Number(c.amount) || 0;
      else monthStats[month].other += Number(c.amount) || 0;
    });

    const sortedMonths = Object.keys(monthStats).sort().reverse();
    const rows = sortedMonths.map(m => {
      const s = monthStats[m];
      const total = s.fuel + s.service + s.other;
      return `${m},${s.fuel.toFixed(2)},${s.service.toFixed(2)},${s.other.toFixed(2)},${total.toFixed(2)}`;
    });

    return [headers, ...rows].join("\n");
  }

  return "";
}
