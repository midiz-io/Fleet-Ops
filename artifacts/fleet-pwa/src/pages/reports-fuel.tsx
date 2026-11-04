import { useState, useMemo } from "react";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useFuelLogs } from "@/hooks/use-fuel";
import { evaluateFuelRowStatus } from "@/lib/fuel-calc";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/language-toggle";
import { 
  Fuel, TrendingDown, TrendingUp, AlertTriangle, Download, Printer, 
  Filter, Calendar, Car, User, DollarSign, BarChart3, CheckCircle2, FileText 
} from "lucide-react";
import { format, parseISO, isAfter, subDays, startOfMonth, startOfWeek, isSameDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, Cell, PieChart, Pie
} from "recharts";

type DateRangeFilter = "today" | "this_week" | "this_month" | "last_30_days" | "all";

export function FuelReportsPage() {
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: fuelLogs, isLoading } = useFuelLogs();
  const { t } = useLanguage();

  const [dateRange, setDateRange] = useState<DateRangeFilter>("this_month");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter logs based on date range, vehicle, driver
  const filteredLogs = useMemo(() => {
    if (!fuelLogs) return [];
    const now = new Date();

    return fuelLogs.filter(log => {
      const logDate = parseISO(log.created_at || log.date);
      const dateOnly = (log.date || log.created_at || "").slice(0, 10);

      // Date Range Filter (Fix 6 / P2)
      if (dateRange === "today" && dateOnly !== format(now, "yyyy-MM-dd")) return false;
      if (dateRange === "this_week" && dateOnly < format(startOfWeek(now), "yyyy-MM-dd")) return false;
      if (dateRange === "this_month" && dateOnly < format(startOfMonth(now), "yyyy-MM-dd")) return false;
      if (dateRange === "last_30_days" && dateOnly < format(subDays(now, 30), "yyyy-MM-dd")) return false;

      // Vehicle Filter
      if (selectedVehicleId !== "all" && log.vehicle_id !== selectedVehicleId) return false;

      // Driver Filter
      if (selectedDriverId !== "all" && log.driver_id !== selectedDriverId) return false;

      return true;
    });
  }, [fuelLogs, dateRange, selectedVehicleId, selectedDriverId]);

  // Aggregate Metrics
  const summaryMetrics = useMemo(() => {
    const totalLiters = filteredLogs.reduce((acc, log) => acc + (Number(log.liters) || 0), 0);
    const totalCost = filteredLogs.reduce((acc, log) => acc + (Number(log.amount_paid) || 0), 0);
    
    // Calculated average KMPL across full tank logs (filter out corrupt/anomalous historical entries)
    const kmplLogs = filteredLogs.filter(log => {
      const v = Number(log.kmpl_calculated);
      return log.kmpl_calculated && v >= 2 && v <= 45;
    });
    const avgKmpl = kmplLogs.length > 0
      ? kmplLogs.reduce((acc, log) => acc + Number(log.kmpl_calculated), 0) / kmplLogs.length
      : 0;

    const belowBenchmarkCount = filteredLogs.filter(log => log.below_benchmark).length;

    return {
      totalLiters: Math.round(totalLiters * 10) / 10,
      totalCost: Math.round(totalCost),
      avgKmpl: Math.round(avgKmpl * 10) / 10,
      belowBenchmarkCount,
      totalLogsCount: filteredLogs.length,
    };
  }, [filteredLogs]);

  // Chart Data 1: Fuel Consumption & Cost Trend (Chronological)
  const trendChartData = useMemo(() => {
    const sorted = [...filteredLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.map(log => {
      const vehicle = vehicles?.find(v => v.id === log.vehicle_id);
      const kVal = log.kmpl_calculated ? Number(log.kmpl_calculated) : null;
      return {
        date: format(parseISO(log.date || log.created_at), "MMM d"),
        vehicleNo: vehicle?.vehicle_no || "Vehicle",
        liters: Number(log.liters) || 0,
        amount: Number(log.amount_paid) || 0,
        kmpl: kVal !== null && kVal >= 2 && kVal <= 45 ? kVal : null,
      };
    });
  }, [filteredLogs, vehicles]);

  // Chart Data 2: Vehicle Consumption & Efficiency Breakdown
  const vehicleBreakdownData = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.map(v => {
      const vLogs = filteredLogs.filter(l => l.vehicle_id === v.id);
      const totalLiters = vLogs.reduce((acc, l) => acc + (Number(l.liters) || 0), 0);
      const totalCost = vLogs.reduce((acc, l) => acc + (Number(l.amount_paid) || 0), 0);
      const kmplLogs = vLogs.filter(l => {
        const val = Number(l.kmpl_calculated);
        return l.kmpl_calculated && val >= 2 && val <= 45;
      });
      const avgKmpl = kmplLogs.length > 0
        ? kmplLogs.reduce((acc, l) => acc + Number(l.kmpl_calculated), 0) / kmplLogs.length
        : 0;

      return {
        vehicleNo: v.vehicle_no,
        model: v.model,
        totalLiters: Math.round(totalLiters * 10) / 10,
        totalCost: Math.round(totalCost),
        avgKmpl: Math.round(avgKmpl * 10) / 10,
        benchmark: v.benchmark_kmpl || 14,
      };
    }).filter(d => d.totalLiters > 0);
  }, [vehicles, filteredLogs]);

  // Export to CSV Function
  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ["Date", "Vehicle No", "Driver Name", "Odometer", "Liters", "Amount (LKR)", "KMPL", "Full Tank", "Below Benchmark"];
    const rows = filteredLogs.map(log => {
      const vehicle = vehicles?.find(v => v.id === log.vehicle_id);
      const driver = drivers?.find(d => d.id === log.driver_id);
      return [
        log.date,
        `"${vehicle?.vehicle_no || ''}"`,
        `"${driver?.name || ''}"`,
        log.after_meter || log.before_meter || 0,
        log.liters,
        log.amount_paid,
        log.kmpl_calculated || "N/A",
        log.is_full_tank ? "Yes" : "No",
        log.below_benchmark ? "YES" : "NO",
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `FleetOps_Fuel_Consumption_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF Document Function
  const exportToPDF = () => {
    if (filteredLogs.length === 0) {
      alert("No fuel entries for this period. Cannot export empty report.");
      return;
    }

    const selectedVehicleObj = vehicles?.find(v => v.id === selectedVehicleId);
    const selectedDriverObj = drivers?.find(d => d.id === selectedDriverId);

    const vehicleLabel = selectedVehicleId === "all" ? "All Fleet Vehicles" : `${selectedVehicleObj?.vehicle_no || ''} (${selectedVehicleObj?.model || ''})`;
    const driverLabel = selectedDriverId === "all" ? "All Drivers" : (selectedDriverObj?.name || '');
    const filterLabel = dateRange === "today" ? "Today" : dateRange === "this_week" ? "This Week" : dateRange === "this_month" ? "This Month" : dateRange === "last_30_days" ? "Last 30 Days" : "All Time";

    const printWindow = window.open("", "_blank", "width=950,height=1000");
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>FleetOps Fuel Consumption Report - ${new Date().toISOString().split("T")[0]}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #ffffff; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
            .logo { font-size: 26px; font-weight: 900; color: #1e3a8a; letter-spacing: 1px; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
            .meta-grid { display: grid; grid-template-cols: 1fr 1fr 1fr; gap: 10px; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; margin-bottom: 20px; }
            .summary-boxes { display: grid; grid-template-cols: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
            .summary-card { background: #f1f5f9; padding: 14px; border-radius: 10px; border: 1px solid #cbd5e1; }
            .summary-card .label { font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; }
            .summary-card .val { font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th { background: #0f172a; color: #ffffff; text-align: left; padding: 9px 12px; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
            td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            .badge { padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: 800; text-transform: uppercase; display: inline-block; }
            .badge-ok { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
            .badge-warn { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
            .badge-neutral { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
            .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">FLEET<span style="color:#2563eb">OPS</span></div>
              <div class="subtitle">Management Fuel Consumption & Vehicle Efficiency Executive Report</div>
            </div>
            <div style="text-align: right; font-size: 11px; color: #475569;">
              <div><strong>Generated Date:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              <div><strong>Format:</strong> PDF Report Export</div>
            </div>
          </div>

          <div class="meta-grid">
            <div><strong>Filter Period:</strong> ${filterLabel}</div>
            <div><strong>Selected Vehicle:</strong> ${vehicleLabel}</div>
            <div><strong>Selected Driver:</strong> ${driverLabel}</div>
          </div>

          <div class="summary-boxes">
            <div class="summary-card">
              <div class="label">Total Liters</div>
              <div class="val" style="color: #2563eb">${summaryMetrics.totalLiters.toLocaleString()} L</div>
            </div>
            <div class="summary-card">
              <div class="label">Total Expenditure</div>
              <div class="val" style="color: #16a34a">LKR ${summaryMetrics.totalCost.toLocaleString()}</div>
            </div>
            <div class="summary-card">
              <div class="label">Avg Efficiency</div>
              <div class="val" style="color: #7c3aed">${summaryMetrics.avgKmpl} KM/L</div>
            </div>
            <div class="summary-card">
              <div class="label">Efficiency Warnings</div>
              <div class="val" style="color: #dc2626">${summaryMetrics.belowBenchmarkCount} Fills</div>
            </div>
          </div>

          <h3 style="font-size: 13px; margin-bottom: 8px; color: #0f172a; text-transform: uppercase; font-weight: 800;">Fuel Consumption Records (${filteredLogs.length} entries)</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle No</th>
                <th>Driver</th>
                <th>Odometer</th>
                <th>Liters</th>
                <th>Amount (LKR)</th>
                <th>KM/L</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.map(log => {
                const v = vehicles?.find(veh => veh.id === log.vehicle_id);
                const d = drivers?.find(dr => dr.id === log.driver_id);
                const rowEval = evaluateFuelRowStatus(log, vehicles, fuelLogs);
                let badgeClass = "badge-ok";
                let statusText = "Efficient";
                if (rowEval.status === "partial") {
                  badgeClass = "badge-neutral";
                  statusText = "Part fill";
                } else if (rowEval.status === "full_base") {
                  badgeClass = "badge-neutral";
                  statusText = "Base reading";
                } else if (rowEval.status === "below") {
                  badgeClass = "badge-warn";
                  statusText = "Below Benchmark";
                }
                const kmplText = rowEval.kmpl !== null ? rowEval.kmpl.toFixed(1) + ' KM/L' : '-';
                return `
                  <tr>
                    <td>${log.date}</td>
                    <td><strong>${v?.vehicle_no || ''}</strong> (${v?.model || ''})</td>
                    <td>${d?.name || 'Unassigned'}</td>
                    <td>${log.after_meter || log.before_meter || '-'} KM</td>
                    <td><strong>${log.liters} L</strong></td>
                    <td>LKR ${Number(log.amount_paid || 0).toLocaleString()}</td>
                    <td>${kmplText}</td>
                    <td>
                      <span class="badge ${badgeClass}">
                        ${statusText}
                      </span>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>

          <div class="footer">
            FleetOps System Report &bull; Management Confidential &bull; Generated via FleetOps PWA
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Pie Chart Colors
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary p-3 rounded-xl">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Fuel Consumption & Efficiency Report</h1>
            <p className="text-xs text-muted-foreground">Fleet-wide fuel metrics, efficiency benchmarks, expenditure charts & PDF/CSV export</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={exportToPDF} className="font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <FileText className="w-4 h-4" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV} className="font-semibold gap-1.5">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <LanguageToggle />
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-card border border-border p-4 rounded-xl space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <Filter className="w-4 h-4 text-primary" /> Filter Report Data
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Date Filter */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Time Period</label>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRangeFilter)}
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
            >
              <option value="today">Today (දෛනික)</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="all">All Time Records</option>
            </select>
          </div>

          {/* Vehicle Filter */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Vehicle</label>
            <select
              value={selectedVehicleId}
              onChange={e => setSelectedVehicleId(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
            >
              <option value="all">All Fleet Vehicles</option>
              {vehicles?.map(v => (
                <option key={v.id} value={v.id}>{v.vehicle_no} ({v.model})</option>
              ))}
            </select>
          </div>

          {/* Driver Filter */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Driver</label>
            <select
              value={selectedDriverId}
              onChange={e => setSelectedDriverId(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
            >
              <option value="all">All Drivers</option>
              {drivers?.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liters */}
        <Card className="border-blue-500/30 bg-blue-950/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Total Fuel Consumed</p>
              <h3 className="text-2xl font-black text-foreground mt-1">{summaryMetrics.totalLiters.toLocaleString()} <span className="text-xs font-semibold text-blue-400">Liters</span></h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{summaryMetrics.totalLogsCount} fuel logs recorded</p>
            </div>
            <div className="bg-blue-500/20 text-blue-400 p-3 rounded-xl border border-blue-500/30">
              <Fuel className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Total Cost */}
        <Card className="border-emerald-500/30 bg-emerald-950/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Total Expenditure</p>
              <h3 className="text-2xl font-black text-foreground mt-1"><span className="text-xs font-semibold text-emerald-400">LKR</span> {summaryMetrics.totalCost.toLocaleString()}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total amount paid for fuel</p>
            </div>
            <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-xl border border-emerald-500/30">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Average KMPL */}
        <Card className="border-purple-500/30 bg-purple-950/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Fleet Avg Efficiency</p>
              <h3 className="text-2xl font-black text-foreground mt-1">{summaryMetrics.avgKmpl} <span className="text-xs font-semibold text-purple-400">KM/L</span></h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Calculated from full tank logs</p>
            </div>
            <div className="bg-purple-500/20 text-purple-400 p-3 rounded-xl border border-purple-500/30">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Below Benchmark Warnings */}
        <Card className={`border ${summaryMetrics.belowBenchmarkCount > 0 ? "border-amber-500/40 bg-amber-950/10" : "border-border bg-card"}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Efficiency Warnings</p>
              <h3 className={`text-2xl font-black mt-1 ${summaryMetrics.belowBenchmarkCount > 0 ? "text-amber-400" : "text-foreground"}`}>
                {summaryMetrics.belowBenchmarkCount} <span className="text-xs font-semibold text-amber-400">Flagged</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Fills below vehicle benchmark</p>
            </div>
            <div className="bg-amber-500/20 text-amber-400 p-3 rounded-xl border border-amber-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Daily Fuel Consumption Trend
            </CardTitle>
            <CardDescription className="text-xs">Liters filled per record over selected timeframe</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {trendChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">No fuel data available for selected filters</div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(val: any) => [`${val} L`, "Liters"]}
                    />
                    <Bar dataKey="liters" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vehicle KMPL Efficiency vs Benchmark Bar Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> Vehicle KM/L Efficiency vs Benchmark
            </CardTitle>
            <CardDescription className="text-xs">Actual average KM/L vs target benchmark per vehicle</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {vehicleBreakdownData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">No vehicle consumption records found</div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vehicleBreakdownData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="vehicleNo" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="avgKmpl" name="Actual KM/L" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="benchmark" name="Target Benchmark" fill="#64748b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Fuel Consumption Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold">Fuel Log Detailed Breakdown</CardTitle>
              <CardDescription className="text-xs">Complete table of recorded fuel refills and efficiency status</CardDescription>
            </div>
            <Input
              placeholder="Search by vehicle or driver..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="max-w-xs h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border border-border/60 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/60 text-muted-foreground uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Vehicle</th>
                  <th className="p-3">Driver</th>
                  <th className="p-3">Odometer</th>
                  <th className="p-3">Liters</th>
                  <th className="p-3">Amount (LKR)</th>
                  <th className="p-3">KM/L</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredLogs
                  .filter(log => {
                    const vehicle = vehicles?.find(v => v.id === log.vehicle_id);
                    const driver = drivers?.find(d => d.id === log.driver_id);
                    const q = searchQuery.toLowerCase();
                    return (
                      !q ||
                      vehicle?.vehicle_no.toLowerCase().includes(q) ||
                      vehicle?.model.toLowerCase().includes(q) ||
                      driver?.name.toLowerCase().includes(q)
                    );
                  })
                  .map(log => {
                    const vehicle = vehicles?.find(v => v.id === log.vehicle_id);
                    const driver = drivers?.find(d => d.id === log.driver_id);
                    const rowEval = evaluateFuelRowStatus(log, vehicles, fuelLogs);

                    let badgeColor = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                    let badgeLabel = "Efficient";
                    if (rowEval.status === "partial") {
                      badgeColor = "bg-secondary text-muted-foreground border-border";
                      badgeLabel = "Part fill";
                    } else if (rowEval.status === "full_base") {
                      badgeColor = "bg-secondary text-muted-foreground border-border";
                      badgeLabel = "Base reading";
                    } else if (rowEval.status === "below") {
                      badgeColor = "bg-red-500/15 text-red-400 border-red-500/30";
                      badgeLabel = "Below Benchmark";
                    }

                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">{log.date}</td>
                        <td className="p-3 font-bold text-foreground">
                          {vehicle ? `${vehicle.vehicle_no} (${vehicle.model})` : "Vehicle"}
                        </td>
                        <td className="p-3 text-muted-foreground">{driver ? driver.name : "Unassigned"}</td>
                        <td className="p-3 font-mono">{log.after_meter || log.before_meter || "-"} KM</td>
                        <td className="p-3 font-bold text-blue-400">{log.liters} L</td>
                        <td className="p-3 font-semibold">LKR {Number(log.amount_paid || 0).toLocaleString()}</td>
                        <td className="p-3 font-mono font-bold">
                          {rowEval.kmpl !== null ? `${rowEval.kmpl.toFixed(1)} KM/L` : "-"}
                        </td>
                        <td className="p-3 text-right">
                          <Badge variant="outline" className={`capitalize font-extrabold text-[10px] ${badgeColor}`}>
                            {badgeLabel}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {filteredLogs.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No fuel entries recorded for this period.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
