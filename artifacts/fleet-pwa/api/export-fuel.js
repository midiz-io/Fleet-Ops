const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://mxqxmtvbahgsfrzwshdl.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14cXhtdHZiYWhnc2ZyendzaGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzYyMzksImV4cCI6MjA5MzAxMjIzOX0.khGshy_3IaNbtAWTYjk4Zi9xWfHNcMFkpC1iHI-YhaM";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function normalizeVehicleNo(vNo) {
  if (!vNo) return "";
  return String(vNo).replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
}

function formatDateText(dateStr) {
  if (!dateStr) return "";
  try {
    const parts = String(dateStr).slice(0, 10).split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const mName = MONTH_NAMES[monthIdx] || parts[1];
      // Text formula so Google Sheets doesn't turn it into a numeric serial number (Fix 6 / P1)
      return `="${day}-${mName}-${year}"`;
    }
  } catch {}
  return `="${dateStr}"`;
}

function formatSriLankaTime(isoString) {
  if (!isoString) return "--:--";
  try {
    const dt = new Date(isoString);
    // Sri Lanka is UTC+5:30
    const slTime = new Date(dt.getTime() + (5.5 * 3600 * 1000));
    const hh = String(slTime.getUTCHours()).padStart(2, "0");
    const mm = String(slTime.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "--:--";
  }
}

async function fetchTable(table, orderQuery = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${orderQuery}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function handler(req, res) {
  try {
    const query = req.query || {};
    const type = query.type || "daily";
    const from = query.from || null;
    const to = query.to || null;
    const period = query.period || null;
    const vehicleId = query.vehicleId || query.vehicle_id || null;
    const vehicleNo = query.vehicle || query.vehicle_no || null;
    const driverId = query.driverId || query.driver_id || null;
    const group = query.group || null;

    const [rawFuelLogs, vehicles, drivers, rawCosts] = await Promise.all([
      fetchTable("fuel_logs", "&order=date.desc"),
      fetchTable("vehicles"),
      fetchTable("drivers"),
      fetchTable("cost_entries", "&order=date.desc"),
    ]);

    const vehicleMap = {};
    for (const v of vehicles || []) {
      vehicleMap[v.id] = { ...v, vehicle_no: normalizeVehicleNo(v.vehicle_no) };
    }
    const driverMap = {};
    for (const d of drivers || []) {
      driverMap[d.id] = d;
    }

    let fuelLogs = Array.isArray(rawFuelLogs) ? rawFuelLogs : [];

    // Filter by period (today | this_week | this_month | all_time - Fix 6 / P2)
    if (period && period !== "all_time") {
      const now = new Date();
      const colomboNow = new Date(now.getTime() + (5.5 * 3600 * 1000));
      const colomboDateStr = colomboNow.toISOString().slice(0, 10);

      if (period === "today") {
        fuelLogs = fuelLogs.filter((l) => (l.date || "").startsWith(colomboDateStr));
      } else if (period === "this_week") {
        const dayOfWeek = (colomboNow.getUTCDay() + 6) % 7;
        const startWeek = new Date(colomboNow.getTime() - dayOfWeek * 86400000);
        const startWeekStr = startWeek.toISOString().slice(0, 10);
        fuelLogs = fuelLogs.filter((l) => (l.date || "") >= startWeekStr);
      } else if (period === "this_month") {
        const monthPrefix = colomboDateStr.slice(0, 7);
        fuelLogs = fuelLogs.filter((l) => (l.date || "").startsWith(monthPrefix));
      }
    }

    if (from && from !== "all") {
      fuelLogs = fuelLogs.filter((l) => (l.date || "") >= from);
    }
    if (to && to !== "all") {
      fuelLogs = fuelLogs.filter((l) => (l.date || "") <= to);
    }
    if (vehicleId && vehicleId !== "all") {
      fuelLogs = fuelLogs.filter((l) => l.vehicle_id === vehicleId);
    }
    if (vehicleNo && vehicleNo !== "all") {
      const normTarget = normalizeVehicleNo(vehicleNo);
      fuelLogs = fuelLogs.filter((l) => {
        const v = vehicleMap[l.vehicle_id];
        return v && normalizeVehicleNo(v.vehicle_no) === normTarget;
      });
    }
    if (driverId && driverId !== "all") {
      fuelLogs = fuelLogs.filter((l) => l.driver_id === driverId);
    }
    if (group && group !== "all") {
      const targetGroup = String(group).toLowerCase();
      fuelLogs = fuelLogs.filter((l) => {
        const v = vehicleMap[l.vehicle_id];
        return String(v?.group || "Tropical").toLowerCase() === targetGroup;
      });
    }

    let csv = "";

    if (type === "vehicle") {
      let targetVehicles = Array.isArray(vehicles) ? vehicles : [];
      if (vehicleId && vehicleId !== "all") {
        targetVehicles = targetVehicles.filter((v) => v.id === vehicleId);
      }
      if (vehicleNo && vehicleNo !== "all") {
        const norm = normalizeVehicleNo(vehicleNo);
        targetVehicles = targetVehicles.filter((v) => normalizeVehicleNo(v.vehicle_no) === norm);
      }
      if (group && group !== "all") {
        const grp = String(group).toLowerCase();
        targetVehicles = targetVehicles.filter(
          (v) => String(v.group || "Tropical").toLowerCase() === grp
        );
      }

      const headers =
        "vehicle,model,group,total_litres,total_amount,total_km,avg_km_per_litre,last_odometer";
      const vStats = {};
      for (const log of fuelLogs) {
        if (!vStats[log.vehicle_id]) {
          vStats[log.vehicle_id] = {
            liters: 0,
            amount: 0,
            minOdo: Infinity,
            maxOdo: -Infinity,
            count: 0,
          };
        }
        const s = vStats[log.vehicle_id];
        s.liters += Number(log.liters) || 0;
        s.amount += Number(log.amount_paid) || 0;
        s.count++;
        const odo = Number(log.after_meter || log.before_meter) || 0;
        if (odo > 0 && odo < 300000) {
          if (odo < s.minOdo) s.minOdo = odo;
          if (odo > s.maxOdo) s.maxOdo = odo;
        }
      }

      const rows = targetVehicles.map((v) => {
        const s = vStats[v.id] || { liters: 0, amount: 0, minOdo: 0, maxOdo: 0, count: 0 };
        const deltaKm =
          s.maxOdo > s.minOdo && s.minOdo !== Infinity ? s.maxOdo - s.minOdo : 0;
        const avgKmpl =
          deltaKm > 0 && s.liters > 0
            ? (deltaKm / s.liters).toFixed(2)
            : v.benchmark_kmpl || 14;
        const lastOdo = s.maxOdo > 0 ? s.maxOdo : v.current_km || 0;
        return `"${normalizeVehicleNo(v.vehicle_no)}","${v.model || ""}","${v.group || "Tropical"}",${s.liters.toFixed(1)},${s.amount.toFixed(2)},${deltaKm},${avgKmpl},${lastOdo}`;
      });

      csv = [headers, ...rows].join("\n");
    } else if (type === "monthly") {
      let costs = Array.isArray(rawCosts) ? rawCosts : [];
      if (from && from !== "all") costs = costs.filter((c) => (c.date || "") >= from);
      if (to && to !== "all") costs = costs.filter((c) => (c.date || "") <= to);
      if (vehicleId && vehicleId !== "all") {
        costs = costs.filter((c) => c.vehicle_id === vehicleId);
      }

      const headers = "month,fuel_cost,service_cost,other_cost,total_cost";
      const monthStats = {};
      for (const log of fuelLogs) {
        const month = (log.date || "").slice(0, 7) || "Unknown";
        if (!monthStats[month]) monthStats[month] = { fuel: 0, service: 0, other: 0 };
        monthStats[month].fuel += Number(log.amount_paid) || 0;
      }
      for (const c of costs) {
        const month = (c.date || "").slice(0, 7) || "Unknown";
        if (!monthStats[month]) monthStats[month] = { fuel: 0, service: 0, other: 0 };
        if (c.category === "fuel") monthStats[month].fuel += Number(c.amount) || 0;
        else if (c.category === "service") monthStats[month].service += Number(c.amount) || 0;
        else monthStats[month].other += Number(c.amount) || 0;
      }

      const sortedMonths = Object.keys(monthStats).sort().reverse();
      const rows = sortedMonths.map((m) => {
        const s = monthStats[m];
        const total = s.fuel + s.service + s.other;
        return `${m},${s.fuel.toFixed(2)},${s.service.toFixed(2)},${s.other.toFixed(2)},${total.toFixed(2)}`;
      });

      csv = [headers, ...rows].join("\n");
    } else {
      // Daily Fuel Logs: Date as Text, Sri Lanka Time, fill_type, numeric or empty km/L (Fix 6 / P1)
      const headers = "date,time,vehicle,driver,litres,amount,odometer,fill_type,km/L";
      const rows = fuelLogs.map((log) => {
        const v = vehicleMap[log.vehicle_id];
        const d = driverMap[log.driver_id];
        const vNo = v?.vehicle_no || "Unknown";
        const dName = d?.name || "Unknown";

        const dateText = formatDateText(log.date || log.created_at);
        const timeStr = formatSriLankaTime(log.created_at || (log.date ? `${log.date}T12:00:00Z` : null));

        const odo = log.after_meter || log.before_meter || 0;
        const isFull = Boolean(log.is_full_tank);
        const fillType = isFull ? "Full" : "Part fill";
        const kmpl = isFull && log.kmpl_calculated ? Number(log.kmpl_calculated).toFixed(2) : "";

        return `${dateText},${timeStr},"${vNo}","${dName}",${log.liters},${log.amount_paid},${odo},"${fillType}",${kmpl}`;
      });

      csv = [headers, ...rows].join("\n");
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(csv);
  } catch (err) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.status(200).send("date,time,vehicle,driver,litres,amount,odometer,fill_type,km/L\n");
  }
}
