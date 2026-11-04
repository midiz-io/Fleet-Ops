import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useRepairs } from "@/hooks/use-repairs";
import { useFuelLogs, useFuelPrices } from "@/hooks/use-fuel";
import { useChecklists } from "@/hooks/use-checklists";
import { useEndDays } from "@/hooks/use-end-days";
import { useCosts } from "@/hooks/use-costs";
import { 
  Car, Users, Wrench, TrendingDown, ClipboardCheck, DollarSign, 
  Shield, Phone, Key, Copy, Check, AlertTriangle, ChevronRight,
  Fuel, Bell, ExternalLink, Sparkles
} from "lucide-react";
import { differenceInDays, parseISO, format, isToday } from "date-fns";
import { LiveFuelSheetsCard } from "./live-fuel-sheets-card";

export function ManagerOverviewTab({ setTab }: { setTab: (t: string) => void }) {
  const { user } = useAuth();
  const { data: rawVehicles = [] } = useVehicles();
  const { data: rawDrivers = [] } = useDrivers();
  const { data: rawRepairs = [] } = useRepairs();
  const { data: rawFuelLogs = [] } = useFuelLogs();
  const { data: rawChecklists = [] } = useChecklists();
  const { records: rawEndDays = [] } = useEndDays();
  const { data: fuelPrices } = useFuelPrices();

  const vehicles = useMemo(() => (Array.isArray(rawVehicles) ? rawVehicles : []), [rawVehicles]);
  const drivers = useMemo(() => (Array.isArray(rawDrivers) ? rawDrivers : []), [rawDrivers]);
  const repairs = useMemo(() => (Array.isArray(rawRepairs) ? rawRepairs : []), [rawRepairs]);
  const fuelLogs = useMemo(() => (Array.isArray(rawFuelLogs) ? rawFuelLogs : []), [rawFuelLogs]);
  const checklists = useMemo(() => (Array.isArray(rawChecklists) ? rawChecklists : []), [rawChecklists]);
  const endDayRecords = useMemo(() => (Array.isArray(rawEndDays) ? rawEndDays : []), [rawEndDays]);

  const pendingRepairs = repairs.filter(r => r.status === "pending");
  const driverCount = drivers.filter(d => d.role === "driver").length;
  const belowKmpl = fuelLogs.filter(f => f.below_benchmark);
  const todayChecklists = checklists.filter(c => isToday(parseISO(c.submitted_at)));
  const today = new Date();

  // Document expiry alerts
  const expiryAlerts = useMemo(() => {
    return vehicles.flatMap(v => {
      const out: Array<{ vehicle: string; type: string; days: number }> = [];
      if (v.license_expiry) {
        const d = differenceInDays(parseISO(v.license_expiry), today);
        if (d < 60) out.push({ vehicle: v.vehicle_no, type: "Revenue License", days: d });
      }
      if (v.insurance_expiry) {
        const d = differenceInDays(parseISO(v.insurance_expiry), today);
        if (d < 60) out.push({ vehicle: v.vehicle_no, type: "Insurance", days: d });
      }
      return out;
    });
  }, [vehicles, today]);

  // Setting selector for Evening Fuel Alert: Tropical | Centres | All (default synced from Settings)
  const [fuelGroup, setFuelGroup] = useState<"Tropical" | "Centres" | "All">("Tropical");

  useEffect(() => {
    if (fuelPrices?.eveningAlertCovers) {
      setFuelGroup(fuelPrices.eveningAlertCovers);
    }
  }, [fuelPrices?.eveningAlertCovers]);

  // Suggestion 2 & Change 3: "Fuel needed tonight" calculation with group filtering & no-End-Day exclusion
  const fuelNeededCalculation = useMemo(() => {
    const dieselPrice = fuelPrices?.diesel || 392;
    const petrolPrice = fuelPrices?.petrol || 370;

    let totalLitersNeeded = 0;
    let totalCost = 0;
    let countedVehicles = 0;
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // Exclude hidden vehicles from Fuel Needed Tonight (Fix 8 / P9)
    const filteredVehicles = vehicles
      .filter(v => !(v as any).is_hidden)
      .filter(v => {
        const g = v.group || "Tropical";
        if (fuelGroup === "All") return true;
        return g === fuelGroup;
      });

    const vehicleRows = filteredVehicles.map(v => {
      const assignedDriver = drivers.find(d => d.id === v.assigned_driver_id);
      
      // Look for latest End Day record submitted today (Fix N1)
      const todayEndDayRecord = endDayRecords.find(
        r => r.vehicleId === v.id && (r.date === todayStr || r.submittedAt.startsWith(todayStr))
      );

      // Tank size (default 45 L for vans, 5.3 L for bikes)
      const tankSize = v.tank_size || (v.model?.toLowerCase().includes("bike") ? 5.3 : 45);
      const literPerBar = tankSize / 6;

      let barsLeft: number | null = null;
      let fillLiters = 0;

      // Only count vehicles with an End Day submitted today!
      if (todayEndDayRecord) {
        const numBars: number = todayEndDayRecord.fuelBars ?? 2;
        barsLeft = numBars;
        fillLiters = Math.max(0, (6 - numBars) * literPerBar);
        totalLitersNeeded += fillLiters;
        const pricePerL = v.fuel_type === "Petrol" ? petrolPrice : dieselPrice;
        totalCost += fillLiters * pricePerL;
        countedVehicles++;
      } else {
        // Excluded from total liters and cost (Head Office Change 3)
        barsLeft = null;
        fillLiters = 0;
      }

      return {
        vehicleNo: v.vehicle_no,
        model: v.model,
        group: v.group || "Tropical",
        driverName: assignedDriver?.name || "Unassigned",
        fuelType: v.fuel_type || "Diesel",
        tankSize,
        barsLeft,
        fillLiters: Math.round(fillLiters * 10) / 10,
        hasEndDay: Boolean(todayEndDayRecord),
      };
    });

    return {
      totalLiters: Math.round(totalLitersNeeded),
      totalCost: Math.round(totalCost),
      countedCount: countedVehicles,
      totalVehicles: filteredVehicles.length,
      vehicles: vehicleRows,
    };
  }, [vehicles, drivers, checklists, endDayRecords, fuelPrices, fuelGroup]);

  return (
    <div className="space-y-5">


      {/* Welcome Banner */}
      <div className="rounded-xl bg-gradient-to-r from-primary/20 to-amber-600/10 border border-primary/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        <p className="font-bold text-foreground text-lg">Welcome back, {user?.name?.split(" ")[0] ?? "Admin"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Fleet Manager · Full Access</p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { icon: Car, label: "Vehicles", value: vehicles.length, sub: "total fleet", color: "text-blue-400", tab: "vehicles" },
          { icon: Users, label: "Drivers", value: driverCount, sub: "active drivers", color: "text-emerald-400", tab: "drivers" },
          { icon: Wrench, label: "Pending Repairs", value: pendingRepairs.length, sub: "awaiting approval", color: "text-amber-400", tab: "repairs" },
          { icon: TrendingDown, label: "KMPL Alerts", value: belowKmpl.length, sub: "below benchmark", color: "text-red-400", tab: "fuel" },
          { icon: ClipboardCheck, label: "Today's Checks", value: todayChecklists.length, sub: `of ${driverCount} drivers`, color: "text-violet-400", tab: "checklists" },
          { icon: Fuel, label: "Fuel Entries", value: fuelLogs.length, sub: "recorded to date", color: "text-pink-400", tab: "fuel" },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setTab(s.tab)}
            className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/40 active:scale-[.98] transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</span>
            </div>
            <div className="text-3xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
          </button>
        ))}
      </div>

      {/* Suggestion 2: "Fuel Needed Tonight" & "Live Fuel Sheets" (Pages 10 & 11) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Fuel needed tonight */}
        <div className="lg:col-span-7 bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-primary" />
                <p className="font-bold text-foreground text-sm">Fuel Needed Tonight</p>
                <span className="text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.2 rounded-full uppercase">
                  Auto
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sent to manager daily at 6:00 PM · Excludes vehicles without End Day
              </p>
            </div>

            {/* Group Selector Pills: Tropical | Centres | All (Default: Tropical) */}
            <div className="flex items-center gap-1 bg-secondary/80 p-1 rounded-xl border border-border self-start sm:self-auto">
              {(["Tropical", "Centres", "All"] as const).map(grp => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setFuelGroup(grp)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    fuelGroup === grp
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {grp}
                </button>
              ))}
            </div>
          </div>

          {/* Aggregate metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-primary">{fuelNeededCalculation.totalLiters} L</p>
              <p className="text-xs text-muted-foreground">
                for {fuelNeededCalculation.countedCount} of {fuelNeededCalculation.totalVehicles} {fuelGroup} vehicles
              </p>
            </div>
            <div className="bg-secondary/40 border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-foreground">
                Rs. {fuelNeededCalculation.totalCost.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">estimated cost tonight</p>
            </div>
          </div>

          {/* Breakdown Table (Mockup on Page 11) */}
          <div className="overflow-x-auto max-h-56 overflow-y-auto pr-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                  <th className="pb-1.5">Vehicle</th>
                  <th className="pb-1.5">Driver</th>
                  <th className="pb-1.5 text-center">Bars Left</th>
                  <th className="pb-1.5 text-right">Fill Needed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {fuelNeededCalculation.vehicles.map((item, idx) => (
                  <tr key={idx} className="py-1.5">
                    <td className="py-2">
                      <span className="font-bold text-foreground block">{item.vehicleNo}</span>
                      <span className="text-[10px] text-muted-foreground">{item.model}</span>
                    </td>
                    <td className="py-2 text-muted-foreground truncate max-w-[90px]">{item.driverName}</td>
                    <td className="py-2 text-center">
                      {item.barsLeft !== null ? (
                        <div className="inline-flex gap-0.5 justify-center">
                          {[1, 2, 3, 4, 5, 6].map(b => (
                            <span
                              key={b}
                              className={`w-2 h-2 rounded-xs ${
                                b <= (item.barsLeft || 0)
                                  ? "bg-amber-400"
                                  : "bg-secondary border border-border"
                              }`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[10px] italic">no End Day today</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {item.barsLeft !== null ? (
                        <span className="font-bold text-primary">{item.fillLiters} L</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">0 L (not counted)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-center gap-2 text-xs text-amber-400">
            <Bell className="w-4 h-4 shrink-0" />
            <span>
              Evening Alert: {fuelNeededCalculation.totalLiters} L needed for {fuelNeededCalculation.countedCount} {fuelGroup} vehicles with completed End Day.
            </span>
          </div>
        </div>

        {/* Live fuel sheets with Google Sheets filtration & direct editing */}
        <div className="lg:col-span-5">
          <LiveFuelSheetsCard />
        </div>
      </div>

      {/* Document Expiry Alerts */}
      {expiryAlerts.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Document Expiry Alerts
          </h3>
          <div className="space-y-2">
            {expiryAlerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  a.days < 0 ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/8 border-amber-500/25"
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 flex-shrink-0 ${a.days < 0 ? "text-red-400" : "text-amber-400"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm">
                    {a.vehicle} - {a.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.days < 0 ? `Expired ${Math.abs(a.days)}d ago` : `Expires in ${a.days} days`}
                  </p>
                </div>
                <button
                  onClick={() => setTab("vehicles")}
                  className="text-xs text-primary font-medium flex items-center gap-0.5"
                >
                  Fix <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
