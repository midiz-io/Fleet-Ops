import { useEffect, useState } from "react";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useChecklists } from "@/hooks/use-checklists";
import { useGateClearance } from "@/hooks/use-gate-clearance";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/language-toggle";
import { ShieldCheck, ShieldAlert, Car, Clock, User, CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

export function GateTvPage() {
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const { data: checklists } = useChecklists();
  const { clearances, getVehicleGateStatus } = useGateClearance();
  const { t } = useLanguage();
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Use local Sri Lanka date, not UTC (Issue 14)
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="bg-primary/20 p-3 rounded-2xl border border-primary/30">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wider uppercase bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              {t("appName")} — {t("gateTv")}
            </h1>
            <p className="text-xs md:text-sm text-slate-400 font-medium">Live Vehicle Dispatch & Security Gate Monitoring System</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-2xl font-mono font-bold tracking-widest text-primary">{timeStr}</div>
            <div className="text-xs text-slate-400 font-medium">{format(new Date(), "EEEE, MMM d, yyyy")}</div>
          </div>
          <LanguageToggle className="bg-slate-900 border-slate-700" />
        </div>
      </div>

      {/* Legend Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2 font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> 🟢 Green: Checklist Done / Cleared
        </div>
        <div className="flex items-center gap-2 font-semibold text-amber-400">
          <AlertTriangle className="w-4 h-4" /> 🟡 Amber: Checklist Pending
        </div>
        <div className="flex items-center gap-2 font-semibold text-red-400">
          <XCircle className="w-4 h-4" /> 🔴 Red: Stopped at Gate
        </div>
        <div className="flex items-center gap-2 font-semibold text-slate-400">
          <MinusCircle className="w-4 h-4" /> 🩶 Grey: Inactive / Off-Duty
        </div>
      </div>

      {/* Live Vehicle Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 flex-1">
        {vehicles?.map(vehicle => {
          const driver = drivers?.find(d => d.id === vehicle.assigned_driver_id);
          const checklist = checklists?.find(c => c.vehicle_id === vehicle.id && (c.date === todayStr || (c.submitted_at && format(parseISO(c.submitted_at), "yyyy-MM-dd") === todayStr)));
          const gateStatus = getVehicleGateStatus(vehicle.id);

          const isChecklistDone = !!checklist;
          const checklistTime = checklist?.submitted_at ? format(parseISO(checklist.submitted_at), "h:mm a") : null;

          let colorClass = "border-slate-800 bg-slate-900/40 text-slate-300";
          let badgeBg = "bg-slate-800 text-slate-400 border-slate-700";
          let badgeText = "Pending Checklist";
          let icon = <MinusCircle className="w-6 h-6 text-slate-500" />;

          if (gateStatus === "stopped") {
            colorClass = "border-red-500/60 bg-red-950/20 shadow-lg shadow-red-950/30";
            badgeBg = "bg-red-500/20 text-red-400 border-red-500/40";
            badgeText = "Stopped at Gate";
            icon = <XCircle className="w-7 h-7 text-red-400 animate-bounce" />;
          } else if (gateStatus === "cleared" || isChecklistDone) {
            // Issue 14: Show green "Checklist Done" with checklist time
            colorClass = "border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-950/30";
            badgeBg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
            badgeText = checklistTime ? `Checklist Done (${checklistTime})` : "Checklist Done";
            icon = <CheckCircle2 className="w-7 h-7 text-emerald-400 animate-pulse" />;
          } else {
            colorClass = "border-amber-500/40 bg-amber-950/15";
            badgeBg = "bg-amber-500/20 text-amber-400 border-amber-500/40";
            badgeText = "Checklist Pending";
            icon = <AlertTriangle className="w-7 h-7 text-amber-400" />;
          }

          return (
            <div key={vehicle.id} className={`p-5 rounded-2xl border flex flex-col justify-between transition-all duration-300 ${colorClass}`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Car className="w-6 h-6 text-primary" />
                    <span className="text-xl font-black tracking-tight">{vehicle.vehicle_no}</span>
                  </div>
                  {icon}
                </div>

                <div className="text-sm font-semibold text-slate-300 flex items-center justify-between">
                  <span>{vehicle.model}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    {vehicle.fuel_type || "Diesel"}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Driver:</span>
                    <span className="font-semibold text-slate-200">{driver ? driver.name : "Unassigned"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Checklist Today:</span>
                    <span className={`font-semibold ${isChecklistDone ? "text-emerald-400" : "text-amber-400"}`}>
                      {isChecklistDone ? (checklistTime ? `Done at ${checklistTime}` : "Done") : "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-2">
                <Badge variant="outline" className={`w-full justify-center py-1.5 text-xs font-extrabold uppercase tracking-wider rounded-xl ${badgeBg}`}>
                  {badgeText}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
