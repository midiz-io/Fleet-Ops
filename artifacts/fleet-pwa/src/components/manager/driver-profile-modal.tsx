import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDrivers } from "@/hooks/use-drivers";
import { useOvertime, OvertimeRecord } from "@/hooks/use-overtime";
import { useTasks } from "@/hooks/use-tasks";
import { useShifts } from "@/hooks/use-shifts";
import { useEndDays } from "@/hooks/use-end-days";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Phone, Star, AlertTriangle, Calendar, Shield, BadgeCheck, CheckCircle2, Lock,
  Clock, XCircle, AlertCircle, ChevronLeft, ChevronRight, Check, X,
  Bell, FileText, CalendarDays, ExternalLink, ArrowRight, Send, CheckCheck
} from "lucide-react";
import { 
  differenceInDays, parseISO, format, differenceInYears, 
  startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, isBefore, isAfter, subDays 
} from "date-fns";

interface DriverProfileModalProps {
  driverId: string | null;
  onClose: () => void;
}

export function DriverProfileModal({ driverId, onClose }: DriverProfileModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: drivers = [] } = useDrivers();
  const { overtimes = [], approveOvertime, rejectOvertime } = useOvertime();
  const safeOvertimes: OvertimeRecord[] = Array.isArray(overtimes) ? overtimes : [];
  const { tasks = [] } = useTasks();
  const { shifts, calendarShifts, getDriverShiftForDate } = useShifts();
  const { records: endDayRecords = [] } = useEndDays();
  const { toast } = useToast();

  const [sendingReminder, setSendingReminder] = useState(false);

  const selectedDriver = useMemo(() => {
    return drivers.find(d => d.id === driverId) || null;
  }, [drivers, driverId]);

  const calculateAge = (dobString?: string | null) => {
    if (!dobString) return null;
    try {
      const birthDate = parseISO(dobString);
      return differenceInYears(new Date(), birthDate);
    } catch {
      return null;
    }
  };

  const getLicenseStatus = (expiryString?: string | null) => {
    if (!expiryString) return null;
    try {
      const expDate = parseISO(expiryString);
      const daysLeft = differenceInDays(expDate, new Date());
      const isExpired = daysLeft < 0;
      return {
        daysLeft,
        isExpired,
        formatted: format(expDate, "dd MMM yyyy"),
      };
    } catch {
      return null;
    }
  };

  const handleSendLicenseWhatsApp = async () => {
    if (!selectedDriver) return;
    const lic = getLicenseStatus(selectedDriver.license_expiry);
    if (!lic) return;
    setSendingReminder(true);
    try {
      const message = lic.isExpired
        ? `⚠️ *URGENT - FLEETOPS LICENCE NOTICE*\n\nHello ${selectedDriver.name},\nYour driving licence expired ${Math.abs(lic.daysLeft)} days ago on ${lic.formatted}. You are legally NOT allowed to operate company vehicles until renewed.\n\nPlease contact Fleet Management immediately.`
        : `📋 *FLEETOPS LICENCE RENEWAL REMINDER*\n\nHello ${selectedDriver.name},\nYour driving licence will expire in ${lic.daysLeft} days (on ${lic.formatted}). Please initiate renewal with the RMV and submit proof to Fleet Management.`;
      
      await sendWhatsAppMessage(selectedDriver.phone, message);
      toast({ title: "WhatsApp Sent", description: `Licence notice dispatched to ${selectedDriver.name} (${selectedDriver.phone}).` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSendingReminder(false);
    }
  };

  const last30DaysList = useMemo(() => {
    if (!selectedDriver) return [];
    const days: any[] = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const curDate = subDays(today, i);
      const dateStr = format(curDate, "yyyy-MM-dd");
      const formattedDate = format(curDate, "EEE, dd MMM");
      
      const shift = getDriverShiftForDate(selectedDriver.id, dateStr);
      const endDay = endDayRecords.find(r => r.driverId === selectedDriver.id && r.date === dateStr);
      const dayTasks = tasks.filter(t => t.driverId === selectedDriver.id && (t.startDate === dateStr || t.dueDate === dateStr));
      const dayOt = safeOvertimes.find(o => o.driverId === selectedDriver.id && o.date === dateStr);
      
      const isLeave = shift === "Leave";
      const isOff = shift === "No shift assigned" || shift.toLowerCase().includes("off");
      const isCurrentDay = isSameDay(curDate, today);

      let workedHours = "—";
      if (endDay && endDay.workedHours) {
        workedHours = `${endDay.workedHours.toFixed(1)}h`;
      } else if (endDay && (endDay as any).calculatedHours) {
        workedHours = `${(endDay as any).calculatedHours.toFixed(1)}h`;
      }

      days.push({
        date: curDate,
        dateStr,
        formattedDate,
        shift,
        isLeave,
        isOff,
        isToday: isCurrentDay,
        hasEndDay: Boolean(endDay),
        workedHours,
        tasksCount: dayTasks.length,
        hasOt: Boolean(dayOt),
        otHours: dayOt ? (dayOt.otHours || dayOt.hours || 0) : 0,
      });
    }
    return days;
  }, [selectedDriver, getDriverShiftForDate, endDayRecords, tasks, safeOvertimes]);

  const driverPendingOvertimes = useMemo(() => {
    if (!selectedDriver) return [];
    return safeOvertimes.filter(o => o.driverId === selectedDriver.id && o.status === "pending");
  }, [safeOvertimes, selectedDriver]);

  if (!driverId || !selectedDriver) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-base shrink-0 border border-primary/30">
              {selectedDriver.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{selectedDriver.name}</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  {selectedDriver.group || "Centres"}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground uppercase">
                  {(selectedDriver.role || "").replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                <span className="flex items-center gap-1 font-mono text-foreground">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {selectedDriver.phone}
                </span>
                {calculateAge(selectedDriver.dob || undefined) !== null && (
                  <span className="text-muted-foreground font-medium">· Age {calculateAge(selectedDriver.dob)}</span>
                )}
                <span className="text-muted-foreground">· Lic: <span className="font-mono text-foreground">{selectedDriver.license_no || "—"}</span></span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center text-sm font-bold shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* License Expiry Banner */}
        {(() => {
          const licStatus = getLicenseStatus(selectedDriver.license_expiry);
          if (!licStatus) return null;
          return (
            <div className={`px-5 py-2.5 border-b flex items-center justify-between gap-3 text-xs flex-wrap ${
              licStatus.isExpired 
                ? "bg-red-500/15 border-red-500/30 text-red-300"
                : licStatus.daysLeft < 30
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${licStatus.isExpired ? "text-red-400" : licStatus.daysLeft < 30 ? "text-amber-400" : "text-emerald-400"}`} />
                <span>
                  <strong className="font-semibold">Driving Licence:</strong>{" "}
                  {licStatus.isExpired ? (
                    <span>Expired on {licStatus.formatted}. Driver cannot take trips.</span>
                  ) : (
                    <span>Expires in {licStatus.daysLeft} days ({licStatus.formatted}).</span>
                  )}
                </span>
              </div>

              <button
                onClick={handleSendLicenseWhatsApp}
                disabled={sendingReminder}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary/80 hover:bg-secondary border border-border text-[11px] font-bold text-foreground transition-all shrink-0"
              >
                <Send className="w-3 h-3 text-primary" />
                {sendingReminder ? "Sending..." : "Send WhatsApp Reminder"}
              </button>
            </div>
          );
        })()}

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Column: Last 30 Days Shifts & Attendance */}
            <div className="bg-secondary/20 border border-border rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      LAST 30 DAYS SHIFTS & WORKED HOURS
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Driver shifts, End Day attendance, and worked hours.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-border/50 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/80 text-muted-foreground uppercase text-[10px] font-bold sticky top-0 border-b border-border">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Shift</th>
                        <th className="p-2.5">Worked</th>
                        <th className="p-2.5 text-center">Tasks</th>
                        <th className="p-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {last30DaysList.map(item => (
                        <tr key={item.dateStr} className="hover:bg-muted/30">
                          <td className="p-2.5 font-medium whitespace-nowrap">
                            <span className={item.isToday ? "text-primary font-bold" : "text-foreground"}>
                              {item.formattedDate}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              item.isLeave
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : item.isOff
                                ? "bg-zinc-500/20 text-zinc-400"
                                : item.shift !== "No shift assigned"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "text-muted-foreground"
                            }`}>
                              {item.shift}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono font-semibold">
                            {item.workedHours}
                          </td>
                          <td className="p-2.5 text-center font-mono">
                            {item.tasksCount > 0 ? (
                              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                                {item.tasksCount}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            {item.hasOt ? (
                              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                                OT {item.otHours}h
                              </span>
                            ) : item.hasEndDay ? (
                              <span className="text-emerald-400 font-bold text-[10px]">
                                ✓ Done
                              </span>
                            ) : item.isToday ? (
                              <span className="text-blue-400 text-[10px] font-medium">
                                Today
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Overtime Approvals & Tasks */}
            <div className="bg-secondary/20 border border-border rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-primary" />
                      PENDING OVERTIME APPROVALS
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Overtime hours logged by this driver awaiting sign-off.
                    </p>
                  </div>
                </div>

                {driverPendingOvertimes.length === 0 ? (
                  <div className="text-center py-10 bg-background/50 border border-border/50 rounded-xl text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-60" />
                    <p className="text-xs font-semibold">No pending overtime claims</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">All overtime entries for {selectedDriver.name} have been processed.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {driverPendingOvertimes.map(ot => (
                      <div key={ot.id} className="p-3 rounded-xl border border-border bg-card/60 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-foreground">{ot.date} · {ot.hours} Hours OT</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{ot.reason || "Shift extension / transport support"}</p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => approveOvertime.mutate(ot.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectOvertime.mutate(ot.id)}
                              className="px-2.5 py-1 rounded-lg bg-destructive/20 text-destructive text-xs"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
