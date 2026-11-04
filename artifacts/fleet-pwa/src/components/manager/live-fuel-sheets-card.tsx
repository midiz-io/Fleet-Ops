import { useState, useMemo } from "react";
import { useVehicles, normalizeVehicleNo } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useFuelLogs, useUpdateFuelLog, FuelLog } from "@/hooks/use-fuel";
import { useCosts } from "@/hooks/use-costs";
import { useToast } from "@/hooks/use-toast";
import { 
  Copy, Check, ExternalLink, Filter, 
  FileSpreadsheet, Download, Save, X, Edit3, Settings, 
  ChevronDown, ChevronUp, Link as LinkIcon, FileText, CheckCircle2
} from "lucide-react";
import { format, parseISO, startOfMonth, subDays, startOfWeek } from "date-fns";

const CONNECTED_SHEET_KEY = "fleet_connected_google_sheet_url";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateToText(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const raw = String(dateStr).slice(0, 10);
    const parts = raw.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const mName = MONTH_NAMES[monthIdx] || parts[1];
      return `${day}-${mName}-${year}`;
    }
  } catch {}
  return String(dateStr);
}

function formatSriLankaTime(isoString?: string | null): string {
  if (!isoString) return "--:--";
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return "--:--";
    // Sri Lanka is UTC+5:30
    const slTime = new Date(dt.getTime() + (5.5 * 3600 * 1000));
    const hh = String(slTime.getUTCHours()).padStart(2, "0");
    const mm = String(slTime.getUTCMinutes()).padStart(2, "0");
    const ampm = slTime.getUTCHours() >= 12 ? "PM" : "AM";
    return `${hh}:${mm} ${ampm}`;
  } catch {
    return "--:--";
  }
}

export function LiveFuelSheetsCard() {
  const { data: rawVehicles = [] } = useVehicles();
  const { data: rawDrivers = [] } = useDrivers();
  const { data: rawFuelLogs = [], isLoading } = useFuelLogs();
  const { data: rawCosts = [] } = useCosts();
  const vehicles = useMemo(() => (Array.isArray(rawVehicles) ? rawVehicles : []), [rawVehicles]);
  const drivers = useMemo(() => (Array.isArray(rawDrivers) ? rawDrivers : []), [rawDrivers]);
  const fuelLogs: FuelLog[] = useMemo(() => (Array.isArray(rawFuelLogs) ? rawFuelLogs : []), [rawFuelLogs]);
  const costs = useMemo(() => (Array.isArray(rawCosts) ? rawCosts : []), [rawCosts]);
  
  const updateFuelLog = useUpdateFuelLog();
  const { toast } = useToast();

  // Filter state
  const [datePreset, setDatePreset] = useState<"all" | "this_month" | "last_30_days" | "this_week" | "today" | "custom">("this_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [selectedDriver, setSelectedDriver] = useState<string>("all");

  // UI state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showLiveEditor, setShowLiveEditor] = useState<boolean>(true);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [lastCopiedType, setLastCopiedType] = useState<"daily" | "vehicle" | "monthly">("daily");

  // Connected Google Sheet URL
  const [companySheetUrl, setCompanySheetUrl] = useState<string>(() => {
    return (typeof window !== "undefined" && localStorage.getItem(CONNECTED_SHEET_KEY)) || "";
  });
  const [tempSheetUrl, setTempSheetUrl] = useState<string>(companySheetUrl);

  // In-line editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLiters, setEditLiters] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editOdometer, setEditOdometer] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Calculate actual from and to date strings (YYYY-MM-DD)
  const { fromDateStr, toDateStr } = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");

    if (datePreset === "today") {
      return { fromDateStr: todayStr, toDateStr: todayStr };
    }
    if (datePreset === "this_week") {
      return { fromDateStr: format(startOfWeek(today), "yyyy-MM-dd"), toDateStr: todayStr };
    }
    if (datePreset === "this_month") {
      return { fromDateStr: format(startOfMonth(today), "yyyy-MM-dd"), toDateStr: todayStr };
    }
    if (datePreset === "last_30_days") {
      return { fromDateStr: format(subDays(today, 30), "yyyy-MM-dd"), toDateStr: todayStr };
    }
    if (datePreset === "custom") {
      return { fromDateStr: customFrom || null, toDateStr: customTo || null };
    }
    return { fromDateStr: null, toDateStr: null };
  }, [datePreset, customFrom, customTo]);

  // Vehicle lookup map
  const vehicleMap = useMemo(() => {
    return Object.fromEntries(vehicles.map(v => [v.id, { ...v, vehicle_no: normalizeVehicleNo(v.vehicle_no) }]));
  }, [vehicles]);

  const driverMap = useMemo(() => {
    return Object.fromEntries(drivers.map(d => [d.id, d]));
  }, [drivers]);

  // Filter fuel logs matching active filters
  const filteredFuelLogs = useMemo(() => {
    return fuelLogs.filter(log => {
      const logDate = log.date || (log.created_at ? log.created_at.split("T")[0] : "");
      if (fromDateStr && logDate < fromDateStr) return false;
      if (toDateStr && logDate > toDateStr) return false;

      if (selectedVehicle !== "all") {
        const v = vehicleMap[log.vehicle_id];
        if (log.vehicle_id !== selectedVehicle && normalizeVehicleNo(v?.vehicle_no || "") !== normalizeVehicleNo(selectedVehicle)) {
          return false;
        }
      }

      if (selectedDriver !== "all" && log.driver_id !== selectedDriver) {
        return false;
      }

      if (selectedGroup !== "all") {
        const v = vehicleMap[log.vehicle_id];
        const vGroup = ((v as any)?.group || "Tropical").toLowerCase();
        if (vGroup !== selectedGroup.toLowerCase()) return false;
      }

      return true;
    });
  }, [fuelLogs, fromDateStr, toDateStr, selectedVehicle, selectedDriver, selectedGroup, vehicleMap]);

  // Compute metrics for filtered selection
  const filterStats = useMemo(() => {
    const count = filteredFuelLogs.length;
    const totalLiters = filteredFuelLogs.reduce((acc, l) => acc + (Number(l.liters) || 0), 0);
    const totalAmount = filteredFuelLogs.reduce((acc, l) => acc + (Number(l.amount_paid) || 0), 0);
    return {
      count,
      totalLiters: Math.round(totalLiters * 10) / 10,
      totalAmount: Math.round(totalAmount),
    };
  }, [filteredFuelLogs]);

  // Base URL for endpoints
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Build query string based on filters
  const filterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (fromDateStr) params.set("from", fromDateStr);
    if (toDateStr) params.set("to", toDateStr);
    if (selectedVehicle !== "all") params.set("vehicle", selectedVehicle);
    if (selectedDriver !== "all") params.set("driverId", selectedDriver);
    if (selectedGroup !== "all") params.set("group", selectedGroup);
    const str = params.toString();
    return str ? `&${str}` : "";
  }, [fromDateStr, toDateStr, selectedVehicle, selectedDriver, selectedGroup]);

  // The 3 live sheets with filtered endpoints
  const sheets = [
    {
      id: "daily" as const,
      title: "Daily Fuel Log (Complete Entries)",
      description: "Individual fuel fills with driver, vehicle, km/L, fill type & amounts in order",
      endpoint: `${baseUrl}/api/export-fuel?type=daily${filterQueryString}`,
    },
    {
      id: "vehicle" as const,
      title: "Fuel Summary per Vehicle",
      description: "Vehicle totals, total km, avg efficiency & latest odometer readings",
      endpoint: `${baseUrl}/api/export-fuel?type=vehicle${filterQueryString}`,
    },
    {
      id: "monthly" as const,
      title: "Monthly Cost Aggregates",
      description: "Aggregated monthly fuel, service, and fleet expenses",
      endpoint: `${baseUrl}/api/export-fuel?type=monthly${filterQueryString}`,
    },
  ];

  // Helper to build high-fidelity Google Sheets formatted template data
  const generateTemplateData = (type: "daily" | "vehicle" | "monthly" = "daily") => {
    const dateGenerated = format(new Date(), "dd-MMM-yyyy hh:mm a");
    const periodLabel = datePreset === "all" ? "All Time" : datePreset === "this_month" ? "This Month" : datePreset;

    if (type === "vehicle") {
      let targetVehicles = vehicles;
      if (selectedVehicle !== "all") {
        targetVehicles = targetVehicles.filter(v => v.id === selectedVehicle);
      }
      if (selectedGroup !== "all") {
        targetVehicles = targetVehicles.filter(v => (v.group || "Tropical").toLowerCase() === selectedGroup.toLowerCase());
      }

      const vStats: Record<string, { liters: number; amount: number; minOdo: number; maxOdo: number; count: number }> = {};
      for (const log of filteredFuelLogs) {
        if (!vStats[log.vehicle_id]) {
          vStats[log.vehicle_id] = { liters: 0, amount: 0, minOdo: Infinity, maxOdo: -Infinity, count: 0 };
        }
        const s = vStats[log.vehicle_id];
        s.liters += Number(log.liters) || 0;
        s.amount += Number(log.amount_paid) || 0;
        s.count++;
        const odo = Number(log.after_meter || log.before_meter) || 0;
        if (odo > 0 && odo < 500000) {
          if (odo < s.minOdo) s.minOdo = odo;
          if (odo > s.maxOdo) s.maxOdo = odo;
        }
      }

      const rowsData = targetVehicles.map(v => {
        const s = vStats[v.id] || { liters: 0, amount: 0, minOdo: 0, maxOdo: 0, count: 0 };
        const deltaKm = s.maxOdo > s.minOdo && s.minOdo !== Infinity ? s.maxOdo - s.minOdo : 0;
        const avgKmpl = deltaKm > 0 && s.liters > 0 ? (deltaKm / s.liters).toFixed(2) : (v.benchmark_kmpl || 14).toFixed(2);
        const lastOdo = s.maxOdo > 0 ? s.maxOdo : v.current_km || 0;
        return {
          vehicleNo: normalizeVehicleNo(v.vehicle_no),
          model: v.model || "",
          group: v.group || "Tropical",
          liters: Number(s.liters.toFixed(1)),
          amount: Math.round(s.amount),
          km: deltaKm,
          kmpl: avgKmpl,
          lastOdo,
        };
      });

      const totalL = rowsData.reduce((acc, r) => acc + r.liters, 0);
      const totalA = rowsData.reduce((acc, r) => acc + r.amount, 0);
      const totalKm = rowsData.reduce((acc, r) => acc + r.km, 0);

      const tsvHeader = ["Vehicle No", "Model", "Group", "Total Litres (L)", "Total Amount (LKR)", "Total KM Driven", "Avg KM/L", "Last Odometer (KM)"].join("\t");
      const tsvRows = rowsData.map(r => [r.vehicleNo, r.model, r.group, r.liters, r.amount, r.km, r.kmpl, r.lastOdo].join("\t")).join("\n");
      const tsvTotals = ["TOTALS", "", "", totalL.toFixed(1), totalA.toLocaleString(), totalKm.toLocaleString(), "", ""].join("\t");
      const tsvString = `${tsvHeader}\n${tsvRows}\n${tsvTotals}`;

      const csvHeader = 'vehicle,model,group,total_litres,total_amount,total_km,avg_km_per_litre,last_odometer';
      const csvRows = rowsData.map(r => `"${r.vehicleNo}","${r.model}","${r.group}",${r.liters},${r.amount},${r.km},${r.kmpl},${r.lastOdo}`).join("\n");
      const csvString = `${csvHeader}\n${csvRows}`;

      const htmlString = `
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; width: 100%;">
  <thead>
    <tr style="background-color: #0F9D58; color: #FFFFFF; font-weight: bold; text-align: center; height: 38px;">
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Vehicle No</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Model</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Group</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Total Litres (L)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Total Amount (LKR)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Total KM Driven</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Avg KM / L</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Last Odometer (KM)</th>
    </tr>
  </thead>
  <tbody>
    ${rowsData.map((r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; font-weight: bold;">${r.vehicleNo}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB;">${r.model}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB;">${r.group}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${r.liters.toFixed(1)}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-weight: bold;">Rs. ${r.amount.toLocaleString()}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${r.km.toLocaleString()}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-weight: bold; color: #0F9D58;">${r.kmpl}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${r.lastOdo.toLocaleString()}</td>
    </tr>`).join("")}
  </tbody>
  <tfoot>
    <tr style="background-color: #E6F4EA; font-weight: bold; height: 35px; border-top: 2px solid #0F9D58;">
      <td colspan="3" style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">TOTALS:</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right; font-family: monospace;">${totalL.toFixed(1)} L</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Rs. ${totalA.toLocaleString()}</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right; font-family: monospace;">${totalKm.toLocaleString()} KM</td>
      <td colspan="2" style="padding: 10px 14px; border: 1px solid #D0D5DD;"></td>
    </tr>
  </tfoot>
</table>`;

      return { tsvString, csvString, htmlString, rowCount: rowsData.length, fileName: `FleetOps_Vehicle_Fuel_Summary_${periodLabel}_${format(new Date(), "yyyy-MM-dd")}` };
    }

    if (type === "monthly") {
      const monthStats: Record<string, { fuel: number; service: number; other: number }> = {};
      for (const log of filteredFuelLogs) {
        const m = (log.date || "").slice(0, 7) || "Current";
        if (!monthStats[m]) monthStats[m] = { fuel: 0, service: 0, other: 0 };
        monthStats[m].fuel += Number(log.amount_paid) || 0;
      }
      for (const c of costs) {
        const m = (c.date || "").slice(0, 7) || "Current";
        if (!monthStats[m]) monthStats[m] = { fuel: 0, service: 0, other: 0 };
        if (c.category === "fuel") monthStats[m].fuel += Number(c.amount) || 0;
        else if (c.category === "service") monthStats[m].service += Number(c.amount) || 0;
        else monthStats[m].other += Number(c.amount) || 0;
      }

      const sortedMonths = Object.keys(monthStats).sort().reverse();
      const rowsData = sortedMonths.map(m => {
        const s = monthStats[m];
        const total = s.fuel + s.service + s.other;
        return { month: m, fuel: s.fuel, service: s.service, other: s.other, total };
      });

      const totalCost = rowsData.reduce((acc, r) => acc + r.total, 0);

      const tsvHeader = ["Month", "Fuel Cost (LKR)", "Service Cost (LKR)", "Other Expenses (LKR)", "Total Monthly Cost (LKR)"].join("\t");
      const tsvRows = rowsData.map(r => [r.month, Math.round(r.fuel), Math.round(r.service), Math.round(r.other), Math.round(r.total)].join("\t")).join("\n");
      const tsvString = `${tsvHeader}\n${tsvRows}`;

      const csvHeader = 'month,fuel_cost,service_cost,other_cost,total_cost';
      const csvRows = rowsData.map(r => `"${r.month}",${r.fuel.toFixed(2)},${r.service.toFixed(2)},${r.other.toFixed(2)},${r.total.toFixed(2)}`).join("\n");
      const csvString = `${csvHeader}\n${csvRows}`;

      const htmlString = `
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; width: 100%;">
  <thead>
    <tr style="background-color: #0F9D58; color: #FFFFFF; font-weight: bold; text-align: center; height: 38px;">
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Month</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Fuel Cost (LKR)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Service Cost (LKR)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Other Cost (LKR)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Total Monthly Cost (LKR)</th>
    </tr>
  </thead>
  <tbody>
    ${rowsData.map((r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; font-weight: bold;">${r.month}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right;">Rs. ${Math.round(r.fuel).toLocaleString()}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right;">Rs. ${Math.round(r.service).toLocaleString()}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right;">Rs. ${Math.round(r.other).toLocaleString()}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-weight: bold; color: #0F9D58;">Rs. ${Math.round(r.total).toLocaleString()}</td>
    </tr>`).join("")}
  </tbody>
  <tfoot>
    <tr style="background-color: #E6F4EA; font-weight: bold; height: 35px; border-top: 2px solid #0F9D58;">
      <td colspan="4" style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">TOTAL EXPENSES:</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right; color: #0F9D58; font-size: 12pt;">Rs. ${Math.round(totalCost).toLocaleString()}</td>
    </tr>
  </tfoot>
</table>`;

      return { tsvString, csvString, htmlString, rowCount: rowsData.length, fileName: `FleetOps_Monthly_Cost_Summary_${format(new Date(), "yyyy-MM-dd")}` };
    }

    // Default: "daily" fuel log
    const sorted = [...filteredFuelLogs].sort((a, b) => {
      const aTime = new Date(a.date || a.created_at || 0).getTime();
      const bTime = new Date(b.date || b.created_at || 0).getTime();
      return bTime - aTime;
    });

    const rowsData = sorted.map(log => {
      const v = vehicleMap[log.vehicle_id];
      const d = driverMap[log.driver_id];
      const vNo = v?.vehicle_no || "Unknown Vehicle";
      const model = v?.model || "";
      const group = (v as any)?.group || "Tropical";
      const dName = d?.name || "Unknown Driver";
      const dateText = formatDateToText(log.date || log.created_at);
      const timeStr = formatSriLankaTime(log.created_at || (log.date ? `${log.date}T12:00:00Z` : null));
      const liters = Number(log.liters) || 0;
      const amount = Number(log.amount_paid) || 0;
      const odo = Number(log.after_meter || log.before_meter || 0);
      const isFull = Boolean(log.is_full_tank);
      const fillType = isFull ? "Full" : "Part fill";
      const kmpl = isFull && log.kmpl_calculated ? Number(log.kmpl_calculated).toFixed(2) : "-";
      const benchmark = Number(v?.benchmark_kmpl || 14);
      const status = !isFull 
        ? "Part Fill" 
        : (log.kmpl_calculated && Number(log.kmpl_calculated) >= benchmark)
        ? "Efficient" 
        : (log.kmpl_calculated && Number(log.kmpl_calculated) < benchmark * 0.75) 
        ? "High Consumption" 
        : "Standard";

      return { dateText, timeStr, vNo, model, group, dName, liters, amount, odo, fillType, kmpl, status, isFull };
    });

    const totalLiters = rowsData.reduce((acc, r) => acc + r.liters, 0);
    const totalAmount = rowsData.reduce((acc, r) => acc + r.amount, 0);
    const fullCount = rowsData.filter(r => r.isFull && r.kmpl !== "-").length;
    const avgKmpl = fullCount > 0 
      ? (rowsData.filter(r => r.isFull && r.kmpl !== "-").reduce((acc, r) => acc + Number(r.kmpl), 0) / fullCount).toFixed(2)
      : "--";

    // Build TSV for clean tabular copy-paste
    const tsvHeader = ["Date", "Time (SL)", "Vehicle No", "Model", "Group", "Driver", "Litres (L)", "Amount (LKR)", "Odometer (KM)", "Fill Type", "KM / L", "Status"].join("\t");
    const tsvRows = rowsData.map(r => [
      r.dateText, r.timeStr, r.vNo, r.model, r.group, r.dName, r.liters.toFixed(1), r.amount, r.odo || "", r.fillType, r.kmpl, r.status
    ].join("\t")).join("\n");
    const tsvTotals = ["TOTALS", "", "", "", "", `${rowsData.length} entries`, totalLiters.toFixed(1), totalAmount.toLocaleString(), "", "", `Avg: ${avgKmpl}`, ""].join("\t");
    const tsvString = `${tsvHeader}\n${tsvRows}\n${tsvTotals}`;

    // Build CSV formatted cleanly for Excel / Google Sheets
    const csvHeader = 'date,time,vehicle,model,group,driver,litres,amount,odometer,fill_type,km/L,status';
    const csvRows = rowsData.map(r => `="${r.dateText}",${r.timeStr},"${r.vNo}","${r.model}","${r.group}","${r.dName}",${r.liters},${r.amount},${r.odo},"${r.fillType}",${r.kmpl === "-" ? "" : r.kmpl},"${r.status}"`).join("\n");
    const csvString = `${csvHeader}\n${csvRows}`;

    // Rich HTML Template designed for Google Sheets (Colors, Borders, Headers)
    const htmlString = `
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; width: 100%;">
  <thead>
    <tr style="background-color: #0F9D58; color: #FFFFFF; font-weight: bold; text-align: center; height: 38px;">
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Date</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Time (SL)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Vehicle No</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Model</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD;">Driver</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Litres (L)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Amount (LKR)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Odometer (KM)</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: center;">Fill Type</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">KM / L</th>
      <th style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: center;">Status</th>
    </tr>
  </thead>
  <tbody>
    ${rowsData.map((r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: center; font-family: monospace;">${r.dateText}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: center; font-family: monospace; color: #4B5563;">${r.timeStr}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; font-weight: bold; color: #111827;">${r.vNo}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; color: #4B5563;">${r.model}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; color: #1F2937;">${r.dName}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace; font-weight: bold;">${r.liters.toFixed(1)}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-weight: bold;">Rs. ${r.amount.toLocaleString()}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${r.odo ? r.odo.toLocaleString() : "—"}</td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: center;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 9pt; font-weight: bold; background-color: ${r.isFull ? '#E6F4EA' : '#FEF3C7'}; color: ${r.isFull ? '#137333' : '#92400E'};">
          ${r.fillType}
        </span>
      </td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace; font-weight: bold; color: ${r.isFull ? '#0F9D58' : '#6B7280'};">
        ${r.kmpl}
      </td>
      <td style="padding: 8px 12px; border: 1px solid #E5E7EB; text-align: center; font-size: 9pt; font-weight: bold; color: ${r.status === 'Efficient' ? '#137333' : r.status === 'High Consumption' ? '#DC2626' : '#4B5563'};">
        ${r.status}
      </td>
    </tr>`).join("")}
  </tbody>
  <tfoot>
    <tr style="background-color: #E6F4EA; font-weight: bold; height: 36px; border-top: 2px solid #0F9D58;">
      <td colspan="5" style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">TOTALS (${rowsData.length} ENTRIES):</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right; font-family: monospace;">${totalLiters.toFixed(1)} L</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right;">Rs. ${totalAmount.toLocaleString()}</td>
      <td colspan="2" style="padding: 10px 14px; border: 1px solid #D0D5DD;"></td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD; text-align: right; font-family: monospace; color: #137333;">${avgKmpl}</td>
      <td style="padding: 10px 14px; border: 1px solid #D0D5DD;"></td>
    </tr>
  </tfoot>
</table>`;

    return { tsvString, csvString, htmlString, rowCount: rowsData.length, fileName: `FleetOps_Fuel_Report_${periodLabel}_${format(new Date(), "yyyy-MM-dd")}` };
  };

  // Copy template data to clipboard with rich HTML and TSV fallback
  const copyTemplateToClipboard = async (type: "daily" | "vehicle" | "monthly" = "daily") => {
    const { tsvString, htmlString, rowCount } = generateTemplateData(type);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
        const textBlob = new Blob([tsvString], { type: "text/plain" });
        const htmlBlob = new Blob([htmlString], { type: "text/html" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": textBlob,
            "text/html": htmlBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(tsvString);
      }
      return true;
    } catch (err) {
      console.warn("ClipboardItem write failed, fallback to writeText:", err);
      try {
        await navigator.clipboard.writeText(tsvString);
        return true;
      } catch {
        return false;
      }
    }
  };

  // Download clean CSV directly in browser (0ms, no server dependency)
  const handleDownloadCsv = (type: "daily" | "vehicle" | "monthly" = "daily") => {
    const { csvString, fileName } = generateTemplateData(type);
    // Add UTF-8 BOM so Excel & Sheets instantly parse unicode / text formulas
    const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "CSV Downloaded Successfully ✓",
      description: "Opens directly in Excel or can be imported to Google Sheets with all columns intact.",
    });
  };

  // Main Google Sheets Action: copies styled template & opens sheet
  const handleOpenGoogleSheets = async (type: "daily" | "vehicle" | "monthly" = "daily") => {
    setLastCopiedType(type);
    await copyTemplateToClipboard(type);

    // Target URL: company saved sheet or sheets.new
    const targetUrl = companySheetUrl.trim() || "https://sheets.new";
    window.open(targetUrl, "_blank", "noopener,noreferrer");

    // Open friendly instruction modal
    setShowPasteModal(true);

    toast({
      title: "Google Sheet Opened & Template Copied!",
      description: "Press Ctrl + V in Cell A1 in your new Google Sheet to paste the beautiful template.",
    });
  };

  const handleCopyFormula = (endpoint: string, key: string) => {
    const formula = `=IMPORTDATA("${endpoint}")`;
    navigator.clipboard.writeText(formula).catch(() => {});
    setCopiedKey(key);
    toast({
      title: "Google Sheets Formula Copied!",
      description: "Paste into cell A1 in Google Sheets. It auto-updates live as fuel is logged.",
    });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveCompanySheetUrl = () => {
    const trimmed = tempSheetUrl.trim();
    setCompanySheetUrl(trimmed);
    if (trimmed) {
      localStorage.setItem(CONNECTED_SHEET_KEY, trimmed);
      toast({ title: "Connected Google Sheet Saved", description: "Clicking 'Open in Google Sheets' will now open this sheet." });
    } else {
      localStorage.removeItem(CONNECTED_SHEET_KEY);
      toast({ title: "Saved", description: "Defaulting to blank Google Sheet (sheets.new)." });
    }
    setShowSettingsModal(false);
  };

  const resetFilters = () => {
    setDatePreset("all");
    setCustomFrom("");
    setCustomTo("");
    setSelectedVehicle("all");
    setSelectedGroup("all");
    setSelectedDriver("all");
  };

  // Start inline editing
  const startEditing = (log: FuelLog) => {
    setEditingId(log.id);
    setEditLiters(String(log.liters || ""));
    setEditAmount(String(log.amount_paid || ""));
    setEditOdometer(String(log.after_meter || log.before_meter || ""));
  };

  const saveEdit = async (logId: string) => {
    const l = Number(editLiters);
    const a = Number(editAmount);
    const o = Number(editOdometer);

    if (isNaN(l) || l <= 0 || isNaN(a) || a <= 0) {
      toast({ title: "Invalid input", description: "Liters and Amount must be positive numbers.", variant: "destructive" });
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateFuelLog.mutateAsync({
        id: logId,
        updates: {
          liters: l,
          amount_paid: a,
          after_meter: isNaN(o) ? undefined : o,
        },
      });
      toast({ title: "Updated Fuel Log", description: "Saved successfully. Changes reflected immediately in all templates." });
      setEditingId(null);
    } catch (e: any) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const hasActiveFilters = datePreset !== "all" || selectedVehicle !== "all" || selectedGroup !== "all" || selectedDriver !== "all";

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0 shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-extrabold text-foreground text-sm sm:text-base">Live Fuel Sheets & Google Sheets Export</p>
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Open ordered fuel logs in Google Sheets with colors, headers, and formulas.
            </p>
          </div>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenGoogleSheets("daily")}
            className="flex items-center gap-1.5 bg-[#0F9D58] hover:bg-[#0b8043] text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95"
            title="Open Google Sheets and auto-copy formatted template"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadCsv("daily")}
            className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold px-3 py-2 rounded-xl border border-border transition-all active:scale-95"
            title="Download clean CSV for Excel or Google Drive"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Download CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors"
            title="Configure Connected Company Google Sheet URL"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Section Controls */}
      <div className="bg-background/80 border border-border rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span>Report Filter & Scope</span>
            {hasActiveFilters && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                Filtered: {filterStats.count} entries ({filterStats.totalLiters} L · Rs. {filterStats.totalAmount.toLocaleString()})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showFilters ? "Hide Filters" : "More Filters"}</span>
            </button>
          </div>
        </div>

        {/* Quick Date Range Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1">Period:</span>
          {[
            { id: "this_month", label: "This Month" },
            { id: "all", label: "All Time" },
            { id: "last_30_days", label: "Last 30 Days" },
            { id: "this_week", label: "This Week" },
            { id: "today", label: "Today" },
            { id: "custom", label: "Custom Dates..." },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDatePreset(p.id as any)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                datePreset === p.id
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "bg-secondary/70 text-muted-foreground hover:text-foreground border border-border/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {datePreset === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/50">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">From Date</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">To Date</label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {/* Dropdowns: Vehicle, Group, Driver */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border/50">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Vehicle</label>
              <select
                value={selectedVehicle}
                onChange={e => setSelectedVehicle(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
              >
                <option value="all">All Fleet Vehicles</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {normalizeVehicleNo(v.vehicle_no)} ({v.model})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Fleet Group</label>
              <select
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
              >
                <option value="all">All Groups</option>
                <option value="Tropical">Tropical</option>
                <option value="Centres">Centres</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Driver</label>
              <select
                value={selectedDriver}
                onChange={e => setSelectedDriver(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
              >
                <option value="all">All Drivers</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* The 3 Sheet Cards */}
      <div className="space-y-2.5">
        {sheets.map(sheet => {
          const formula = `=IMPORTDATA("${sheet.endpoint}")`;
          const isCopied = copiedKey === sheet.id;

          return (
            <div
              key={sheet.id}
              className="bg-background border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs sm:text-sm font-bold text-foreground">{sheet.title}</p>
                  {hasActiveFilters && (
                    <span className="text-[9px] font-bold bg-primary/20 text-primary px-1.5 py-0.2 rounded-full">
                      Filtered
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{sheet.description}</p>
                <div className="mt-1 bg-secondary/60 rounded-lg px-2 py-1 text-[10px] font-mono text-muted-foreground truncate border border-border/40">
                  {formula}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => handleDownloadCsv(sheet.id)}
                  className="flex items-center gap-1 bg-secondary text-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-secondary/80 border border-border transition-all active:scale-95"
                  title="Download clean CSV file"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await copyTemplateToClipboard(sheet.id);
                    setCopiedKey(sheet.id);
                    toast({
                      title: "Formatted Template Copied! ✓",
                      description: "Paste into cell A1 in Google Sheets. All columns, colors and totals will appear.",
                    });
                    setTimeout(() => setCopiedKey(null), 2500);
                  }}
                  className="flex items-center gap-1 bg-secondary text-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-secondary/80 border border-border transition-all active:scale-95"
                  title="Copy complete formatted table with headers & colors"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span>{isCopied ? "Copied" : "Copy Table"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenGoogleSheets(sheet.id)}
                  className="flex items-center gap-1 bg-[#0F9D58] hover:bg-[#0b8043] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-all active:scale-95"
                  title="Open this sheet directly in Google Sheets"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Sheet</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Spreadsheet Template Preview */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowLiveEditor(!showLiveEditor)}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary border border-border text-xs font-bold text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Edit3 className="w-3.5 h-3.5 text-primary" />
            <span>Google Sheets Ordered Template Preview ({filteredFuelLogs.length} rows)</span>
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
            {showLiveEditor ? "Hide Table" : "Show Table & Edit"}
            {showLiveEditor ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>

        {showLiveEditor && (
          <div className="mt-3 border border-border rounded-xl overflow-hidden bg-background">
            <div className="p-2.5 bg-card border-b border-border flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Live Filtered Rows · Edit and click save to sync
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadCsv("daily")}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0F9D58] text-white font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-emerald-700">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Vehicle</th>
                    <th className="p-2.5">Driver</th>
                    <th className="p-2.5 text-right">Liters (L)</th>
                    <th className="p-2.5 text-right">Amount (Rs.)</th>
                    <th className="p-2.5 text-right">Odometer</th>
                    <th className="p-2.5 text-center">Fill Type</th>
                    <th className="p-2.5 text-right">KM/L</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredFuelLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-muted-foreground">
                        No fuel logs match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredFuelLogs.map((log, idx) => {
                      const isEditing = editingId === log.id;
                      const v = vehicleMap[log.vehicle_id];
                      const d = driverMap[log.driver_id];
                      const timeStr = formatSriLankaTime(log.created_at || (log.date ? `${log.date}T12:00:00Z` : null));

                      return (
                        <tr key={log.id} className={idx % 2 === 0 ? "bg-background hover:bg-secondary/40 transition-colors" : "bg-secondary/20 hover:bg-secondary/50 transition-colors"}>
                          <td className="p-2 font-mono whitespace-nowrap">{formatDateToText(log.date || log.created_at)}</td>
                          <td className="p-2 font-mono whitespace-nowrap text-muted-foreground">{timeStr}</td>
                          <td className="p-2 font-bold whitespace-nowrap text-foreground">
                            {v?.vehicle_no || "Unknown"}
                          </td>
                          <td className="p-2 whitespace-nowrap text-muted-foreground">
                            {d?.name || "Unknown"}
                          </td>

                          {/* Liters */}
                          <td className="p-2 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                value={editLiters}
                                onChange={e => setEditLiters(e.target.value)}
                                className="w-20 bg-background border border-primary rounded px-1.5 py-0.5 text-xs text-foreground font-bold text-right"
                              />
                            ) : (
                              <span className="font-bold text-foreground font-mono">{log.liters} L</span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="p-2 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                step="1"
                                value={editAmount}
                                onChange={e => setEditAmount(e.target.value)}
                                className="w-24 bg-background border border-primary rounded px-1.5 py-0.5 text-xs text-foreground font-bold text-right"
                              />
                            ) : (
                              <span className="font-mono font-medium text-foreground">Rs. {Number(log.amount_paid || 0).toLocaleString()}</span>
                            )}
                          </td>

                          {/* Odometer */}
                          <td className="p-2 font-mono text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editOdometer}
                                onChange={e => setEditOdometer(e.target.value)}
                                className="w-24 bg-background border border-primary rounded px-1.5 py-0.5 text-xs text-foreground font-bold text-right"
                              />
                            ) : (
                              log.after_meter || log.before_meter ? Number(log.after_meter || log.before_meter).toLocaleString() : "--"
                            )}
                          </td>

                          {/* Fill Type */}
                          <td className="p-2 text-center">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              log.is_full_tank 
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }`}>
                              {log.is_full_tank ? "Full" : "Part fill"}
                            </span>
                          </td>

                          {/* KM/L */}
                          <td className="p-2 font-mono text-right text-xs">
                            {log.is_full_tank && log.kmpl_calculated ? (
                              <span className="text-emerald-400 font-bold">
                                {Number(log.kmpl_calculated).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">-</span>
                            )}
                          </td>

                          {/* Edit Actions */}
                          <td className="p-2 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => saveEdit(log.id)}
                                  disabled={isSavingEdit}
                                  className="p-1 rounded bg-primary text-primary-foreground hover:opacity-90"
                                  title="Save edit"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="p-1 rounded bg-secondary text-muted-foreground hover:text-foreground"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditing(log)}
                                className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-colors"
                                title="Edit log"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Instructional Banner */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-xs text-foreground space-y-1.5">
        <p className="font-bold flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> How to open ordered fuel logs in Google Sheets:
        </p>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          1. Click <strong className="text-foreground">Open in Google Sheets</strong> above. The formatted template with all rows, colors, and headers is auto-copied to your clipboard.<br />
          2. In the newly opened Google Sheet, simply click cell <strong className="text-foreground font-mono">A1</strong> and press <strong className="text-foreground font-mono">Ctrl + V</strong>.<br />
          3. Or click <strong className="text-foreground">Download CSV</strong> and drag the file directly into Google Drive (<span className="italic">File &gt; Import &gt; Upload</span>).
        </p>
      </div>

      {/* Guide Modal: Ready to Paste in Google Sheets */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Google Sheets Template Ready!</h3>
                  <p className="text-xs text-muted-foreground">All {filteredFuelLogs.length} fuel logs formatted &amp; copied</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-secondary/40 border border-border rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-foreground font-bold">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">1</span>
                <span>Select Cell A1 in your newly opened Google Sheet</span>
              </div>
              <div className="flex items-center gap-2 text-foreground font-bold">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">2</span>
                <span>Press <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[11px]">Ctrl + V</kbd> (or Cmd + V)</span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 pl-7">
                The entire styled table with dates, vehicle numbers, drivers, liters, amounts, KM/L, and summary totals will appear instantly with full colors!
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await copyTemplateToClipboard(lastCopiedType);
                    toast({ title: "Template Copied Again! ✓", description: "Press Ctrl + V in Google Sheets cell A1." });
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Again</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadCsv(lastCopiedType)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Download CSV</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md transition-all active:scale-95"
              >
                Got it, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal: Connected Company Google Sheet */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-foreground text-sm">Connect Company Google Sheet</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                Paste your existing office Google Sheet URL below. When you click &quot;Open in Google Sheets&quot;, it will directly launch your official company spreadsheet.
              </p>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                  Google Sheet URL
                </label>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
                  value={tempSheetUrl}
                  onChange={e => setTempSheetUrl(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Leave empty to open a new blank sheet (sheets.new) by default.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCompanySheetUrl}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
              >
                Save Sheet URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
