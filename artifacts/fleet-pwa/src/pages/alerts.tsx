import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicles, getDriverDailyVehicleId } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useChecklists } from "@/hooks/use-checklists";
import { useRepairs } from "@/hooks/use-repairs";
import { useFuelLogs } from "@/hooks/use-fuel";
import { evaluateFuelRowStatus } from "@/lib/fuel-calc";
import { useGateClearance } from "@/hooks/use-gate-clearance";
import { useVehicleMaintenance } from "@/hooks/use-vehicle-maintenance";
import { useEndDays } from "@/hooks/use-end-days";
import { useShifts } from "@/hooks/use-shifts";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/language-toggle";
import { 
  AlertTriangle, ShieldAlert, Clock, Wrench, Moon, CheckCircle, Bell, Car, 
  Fuel, AlertCircle, ArrowRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isToday, differenceInHours } from "date-fns";
import { timeStringToMinutes } from "@/hooks/use-tasks";

export interface FleetAlert {
  id: string;
  type: "repair_request" | "kmpl_alert" | "not_checked" | "not_checked_shift" | "part_due" | "no_end_day" | "km_missing" | "stopped_gate" | "driver_rest";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  vehicleId?: string;
  driverId?: string;
  timestamp: string;
}

export function AlertsPage() {
  const { user } = useAuth();
  const { data: allVehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: checklists } = useChecklists();
  const { data: repairs } = useRepairs();
  const { data: fuelLogs } = useFuelLogs();
  const { maintenanceMap } = useVehicleMaintenance();
  const { shifts } = useShifts();
  const { getVehicleGateStatus } = useGateClearance();
  const { getVehicleTodayEndDay } = useEndDays();
  const { t } = useLanguage();

  const isManager =
    user?.role === "manager" ||
    user?.role === "admin" ||
    user?.role === "team_leader" ||
    user?.role === "head_of_teams" ||
    user?.role === "team_head";
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const generatedAlerts = useMemo(() => {
    const alertsList: FleetAlert[] = [];

    // Filter vehicles if current user is a driver (Driver sees only his own alerts)
    const visibleVehicles = (allVehicles || []).filter(v => !v.is_hidden);
    const dailyVid = getDriverDailyVehicleId(user?.id, allVehicles, checklists);
    const driverVehicleIds = new Set(
      visibleVehicles
        .filter(v => v.assigned_driver_id === user?.id || v.id === dailyVid)
        .map(v => v.id)
    );

    const targetVehicles = isManager
      ? visibleVehicles
      : visibleVehicles.filter(v => driverVehicleIds.has(v.id));

    // 1. Repair requests pending approval
    (repairs || []).forEach(r => {
      if (r.status === "pending") {
        if (isManager || r.driver_id === user?.id) {
          const v = allVehicles?.find(veh => veh.id === r.vehicle_id);
          alertsList.push({
            id: `repair-${r.id}`,
            type: "repair_request",
            severity: "high",
            title: `Repair Request: ${v?.vehicle_no || "Vehicle"}`,
            description: `${r.description} - Pending manager review`,
            vehicleId: r.vehicle_id,
            driverId: r.driver_id,
            timestamp: format(parseISO(r.created_at), "MMM d, h:mm a"),
          });
        }
      }
    });

    // 2. KMPL below benchmark or check reading (using unified evaluateFuelRowStatus, recent 14 days, ignoring partial fills - Fix A6)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    (fuelLogs || []).forEach(f => {
      const v = allVehicles?.find(veh => veh.id === f.vehicle_id);
      if (!v || v.is_hidden) return;
      const isMyVehicle = targetVehicles.some(veh => veh.id === f.vehicle_id);
      if (!isMyVehicle) return;

      const logTime = new Date(f.date || f.created_at || 0).getTime();
      if (logTime < fourteenDaysAgo.getTime()) return; // only alert on recent entries

      const rowEval = evaluateFuelRowStatus(f, allVehicles, fuelLogs);
      if (rowEval.status === "partial") return; // Part fills have no km/l status (Fix A6)

      const kmpl = rowEval.kmpl;
      const benchmark = rowEval.benchmark;

      if (rowEval.status === "below" && kmpl !== null) {
        alertsList.push({
          id: `fuel-low-${f.id}`,
          type: "kmpl_alert",
          severity: "high",
          title: `Low KMPL Alert: ${v.vehicle_no}`,
          description: `Efficiency recorded at ${kmpl.toFixed(1)} km/L (Benchmark: ${benchmark} km/L).`,
          vehicleId: f.vehicle_id,
          driverId: f.driver_id,
          timestamp: f.date,
        });
      } else if (kmpl !== null && kmpl > benchmark * 1.5) {
        alertsList.push({
          id: `fuel-high-${f.id}`,
          type: "kmpl_alert",
          severity: "medium",
          title: `Check Reading: ${v.vehicle_no}`,
          description: `Recorded ${kmpl.toFixed(1)} km/L is more than 50% above benchmark (${benchmark} km/L). Please verify odometer.`,
          vehicleId: f.vehicle_id,
          driverId: f.driver_id,
          timestamp: f.date,
        });
      }
    });

    // 3. Vehicles stopped at gate
    targetVehicles.forEach(v => {
      const gateStatus = getVehicleGateStatus(v.id);
      if (gateStatus === "stopped") {
        alertsList.push({
          id: `alert-gate-${v.id}`,
          type: "stopped_gate",
          severity: "high",
          title: `Vehicle Stopped at Gate: ${v.vehicle_no}`,
          description: `Vehicle flagged as stopped from premises departure.`,
          vehicleId: v.id,
          timestamp: "Today",
        });
      }
    });

    // 4. Checklist missing today
    targetVehicles.forEach(v => {
      const checklistToday = checklists?.find(c => c.vehicle_id === v.id && (c.date === todayStr || (c.submitted_at && format(parseISO(c.submitted_at), "yyyy-MM-dd") === todayStr)));
      if (!checklistToday) {
        alertsList.push({
          id: `alert-nocheck-${v.id}`,
          type: "not_checked",
          severity: "medium",
          title: `No Checklist Today: ${v.vehicle_no}`,
          description: `Start checklist not submitted for ${v.model}.`,
          vehicleId: v.id,
          timestamp: "Today",
        });
      }
    });

    // 5. Not checked 1 hour after shift start
    if (drivers) {
      drivers.forEach(d => {
        if (d.role !== "driver") return; // exclude managers!
        if (!isManager && d.id !== user?.id) return;

        const driverShift = shifts?.[d.id]?.shift;
        if (driverShift && driverShift !== "Leave" && driverShift !== "No shift assigned") {
          const startTimeMatch = driverShift.split("-")[0]?.trim();
          if (startTimeMatch) {
            const shiftMins = timeStringToMinutes(startTimeMatch);
            const now = new Date();
            const currentMins = now.getHours() * 60 + now.getMinutes();

            // If more than 60 minutes after shift start
            if (currentMins > shiftMins + 60 && currentMins < shiftMins + 600) {
              const driverChecklist = checklists?.find(c => c.driver_id === d.id && (c.date === todayStr || (c.submitted_at && format(parseISO(c.submitted_at), "yyyy-MM-dd") === todayStr)));
              if (!driverChecklist) {
                alertsList.push({
                  id: `shift-late-check-${d.id}`,
                  type: "not_checked_shift",
                  severity: "high",
                  title: `Not Checked 1h After Shift Start: ${d.name}`,
                  description: `Shift began at ${startTimeMatch}. No vehicle inspection submitted yet.`,
                  driverId: d.id,
                  timestamp: "Shift Alert",
                });
              }
            }
          }
        }
      });
    }

    // 6. Maintenance Part due (from real maintenance)
    targetVehicles.forEach(v => {
      const parts = maintenanceMap[v.id] || [];
      const currentKm = v.current_km || 0;
      parts.forEach(p => {
        const usedKm = Math.max(0, currentKm - (p.fitted_km || 0));
        const usagePercent = p.life_km > 0 ? Math.round((usedKm / p.life_km) * 100) : 0;
        if (usagePercent >= 90) {
          alertsList.push({
            id: `part-due-${v.id}-${p.id}`,
            type: "part_due",
            severity: usagePercent >= 100 ? "high" : "medium",
            title: `Part Due (${usagePercent}%): ${p.name} on ${v.vehicle_no}`,
            description: `${p.name} reached ${usedKm.toLocaleString()} / ${p.life_km.toLocaleString()} km. Replaced due.`,
            vehicleId: v.id,
            timestamp: "Active",
          });
        }
      });
    });

    // 7. No End Day reading (checks independent end_day_records - Fix N1 & A6)
    targetVehicles.forEach(v => {
      const hasEndDay = Boolean(getVehicleTodayEndDay(v.id));
      if (hasEndDay) return; // End Day already completed safely!

      const checklistToday = checklists?.find(c => c.vehicle_id === v.id && (c.date === todayStr || (c.submitted_at && format(parseISO(c.submitted_at), "yyyy-MM-dd") === todayStr)));
      if (checklistToday) {
        const now = new Date();
        if (now.getHours() >= 17) {
          alertsList.push({
            id: `no-endday-${v.id}`,
            type: "no_end_day",
            severity: "low",
            title: `No End Day Reading: ${v.vehicle_no}`,
            description: `Shift start inspection recorded, but missing End Day odometer/fuel check.`,
            vehicleId: v.id,
            timestamp: "Today",
          });
        }
      }
    });

    // 8. Km missing overnight (Yesterday's end day meter != Today's start checklist meter)
    targetVehicles.forEach(v => {
      const vChecks = (checklists || []).filter(c => c.vehicle_id === v.id);
      if (vChecks.length >= 2) {
        const sorted = [...vChecks].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
        const latest = sorted[0];
        const prev = sorted[1];
        if (latest && prev && isToday(parseISO(latest.submitted_at))) {
          const diff = Number(latest.meter_reading) - Number(prev.meter_reading);
          if (diff < 0) {
            alertsList.push({
              id: `km-missing-${v.id}`,
              type: "km_missing",
              severity: "high",
              title: `Km Discrepancy Overnight: ${v.vehicle_no}`,
              description: `Odometer reading decreased from ${prev.meter_reading} km to ${latest.meter_reading} km.`,
              vehicleId: v.id,
              timestamp: "Today",
            });
          }
        }
      }
    });

    return alertsList;
  }, [allVehicles, drivers, checklists, repairs, fuelLogs, maintenanceMap, shifts, getVehicleGateStatus, getVehicleTodayEndDay, isManager, todayStr, user?.id]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary p-3 rounded-xl">
            <Bell className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("alerts")} Center</h1>
            <p className="text-xs text-muted-foreground">
              {isManager
                ? "Unified fleet alerts: Repairs, KMPL, Overdue inspections, Maintenance & Km tracking"
                : "Your personal vehicle and route alerts"}
            </p>
          </div>
        </div>
        <LanguageToggle />
      </div>

      <div className="space-y-3">
        {generatedAlerts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="font-semibold text-foreground text-sm">All Systems Operational</p>
            <p className="text-xs">No active critical alerts or vehicle security warnings detected.</p>
          </div>
        ) : (
          generatedAlerts.map(alert => (
            <Card key={alert.id} className={`border transition-all ${
              alert.severity === "high" ? "border-red-500/50 bg-red-950/10" :
              alert.severity === "medium" ? "border-amber-500/50 bg-amber-950/10" : "border-blue-500/50 bg-blue-950/10"
            }`}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="pt-0.5 shrink-0">
                  {alert.severity === "high" ? <ShieldAlert className="w-5 h-5 text-red-400" /> :
                   alert.severity === "medium" ? <AlertTriangle className="w-5 h-5 text-amber-400" /> :
                   <Clock className="w-5 h-5 text-blue-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm text-foreground truncate">{alert.title}</h3>
                    <Badge variant="outline" className={`capitalize font-bold text-[10px] shrink-0 ${
                      alert.severity === "high" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      alert.severity === "medium" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                      "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    }`}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3 text-primary" />
                    <span>{alert.timestamp}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
