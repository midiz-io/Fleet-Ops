import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver, Driver } from "@/hooks/use-drivers";
import { useOvertime, OvertimeRecord } from "@/hooks/use-overtime";
import { useTasks, DriverTask } from "@/hooks/use-tasks";
import { useShifts } from "@/hooks/use-shifts";
import { useEndDays } from "@/hooks/use-end-days";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Plus, Pencil, Trash2, Phone, Star, 
  AlertTriangle, Calendar, Shield, BadgeCheck, CheckCircle2, Lock,
  Clock, XCircle, AlertCircle, ChevronLeft, ChevronRight, Check, X,
  Bell, FileText, CalendarDays, ExternalLink, ArrowRight, Send, CheckCheck
} from "lucide-react";
import { 
  differenceInDays, parseISO, format, differenceInYears, 
  startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, isBefore, isAfter, addMonths, subMonths, subDays 
} from "date-fns";

export type DriverForm = {
  name: string;
  phone: string;
  pin: string;
  role: "driver" | "manager" | "admin" | "team_leader" | "head_of_teams" | "team_head" | "security";
  group: "Centres" | "Tropical";
  dob: string;
  license_no: string;
  license_expiry: string;
};

export interface EmergencyLeaveRequest {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_phone?: string;
  task_id: string;
  task_title: string;
  reason: string;
  notes?: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string;
  reviewed_at?: string;
}

const emptyDriverForm: DriverForm = {
  name: "",
  phone: "",
  pin: "",
  role: "driver",
  group: "Centres",
  dob: "",
  license_no: "",
  license_expiry: "",
};

export function ManagerDriversTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: drivers = [], isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const { toast } = useToast();

  const { overtimes = [], approveOvertime, rejectOvertime } = useOvertime();
  const safeOvertimes: OvertimeRecord[] = Array.isArray(overtimes) ? overtimes : [];
  const { tasks = [] } = useTasks();
  const { shifts, calendarShifts, updateShift, getDriverShiftForDate } = useShifts();
  const { records: endDayRecords = [] } = useEndDays();

  // Fetch emergency leave requests from settings for the driver log
  const { data: leaveRequests = [] } = useQuery<EmergencyLeaveRequest[]>({
    queryKey: ["emergency_leave_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "emergency_leave_requests")
        .maybeSingle();
      if (error) return [];
      return (data?.value as EmergencyLeaveRequest[]) || [];
    },
  });

  const [groupFilter, setGroupFilter] = useState<"All" | "Centres" | "Tropical">("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyDriverForm);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });

  // Driver Profile Modal state (Page 10 Head Office Mockup)
  const [profileDriverId, setProfileDriverId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedShiftTool, setSelectedShiftTool] = useState<string>("8:00 AM - 5:00 PM");
  const [sendingReminder, setSendingReminder] = useState(false);

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      if (groupFilter === "All") return true;
      return (d.group || "Centres") === groupFilter;
    });
  }, [drivers, groupFilter]);

  const selectedDriver = useMemo(() => {
    if (!profileDriverId) return null;
    return drivers.find(d => d.id === profileDriverId) || null;
  }, [drivers, profileDriverId]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyDriverForm);
    setModalOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditingId(d.id);
    setForm({
      name: d.name,
      phone: d.phone,
      pin: "",
      role: (d.role as any) || "driver",
      group: (d.group as "Centres" | "Tropical") || "Centres",
      dob: d.dob || "",
      license_no: d.license_no || "",
      license_expiry: d.license_expiry || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Name and Phone are required", variant: "destructive" });
      return;
    }
    if (!editingId && (form.pin.length !== 4 || isNaN(Number(form.pin)))) {
      toast({ title: "PIN must be a 4-digit number", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const basePayload: any = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        role: form.role,
        group: form.group,
        dob: form.dob || null,
        license_no: form.license_no.trim() || null,
        license_expiry: form.license_expiry || null,
        incentive_points: 0,
      };

      if (form.pin) {
        basePayload.pin = form.pin;
      }

      if (editingId) {
        await updateDriver.mutateAsync({ id: editingId, updates: basePayload });
        toast({ title: "Driver account updated" });
      } else {
        await createDriver.mutateAsync({ ...basePayload, pin: form.pin });
        toast({ title: "Account created successfully" });
      }
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const calculateAge = (dobStr?: string | null) => {
    if (!dobStr) return null;
    try {
      const dob = parseISO(dobStr);
      return differenceInYears(new Date(), dob);
    } catch {
      return null;
    }
  };

  // License expiry status (Issue 17 item 6 & Page 10)
  const getLicenseStatus = (expiryDate?: string | null) => {
    if (!expiryDate) return null;
    try {
      const exp = parseISO(expiryDate);
      const diff = differenceInDays(exp, new Date());
      if (diff < 0) {
        return {
          label: "Expired",
          color: "bg-red-500/15 text-red-400 border-red-500/30 font-bold",
          formatted: format(exp, "MMM d, yyyy"),
          isExpired: true,
          daysLeft: diff,
        };
      }
      if (diff < 30) {
        return {
          label: `Expires in ${diff}d`,
          color: "bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold",
          formatted: format(exp, "MMM d, yyyy"),
          isExpired: false,
          daysLeft: diff,
        };
      }
      return {
        label: "Valid",
        color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 font-medium",
        formatted: format(exp, "MMM d, yyyy"),
        isExpired: false,
        daysLeft: diff,
      };
    } catch {
      return null;
    }
  };

  // Unfinished task detection: not completed and past schedule or date
  const isTaskUnfinished = (t: DriverTask) => {
    if (t.status === "done" || t.status === "cancelled") return false;
    const taskEndDay = t.endDate || t.startDate || t.dueDate;
    if (!taskEndDay) return false;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (isBefore(parseISO(taskEndDay), parseISO(todayStr))) return true;
    if (taskEndDay === todayStr && t.endTime) {
      try {
        const endDateTime = parseISO(`${taskEndDay}T${t.endTime}:00`);
        return isAfter(new Date(), endDateTime);
      } catch {
        return false;
      }
    }
    return false;
  };

  // Overtime calculations for selected driver
  const driverOvertimes = useMemo(() => {
    if (!selectedDriver) return [];
    return safeOvertimes.filter(ot => ot.driverId === selectedDriver.id);
  }, [safeOvertimes, selectedDriver]);

  const approvedOtsThisMonth = useMemo(() => {
    return driverOvertimes.filter(ot => {
      if (ot.status !== "approved") return false;
      try {
        const d = parseISO(ot.date || ot.createdAt);
        return isSameMonth(d, calendarMonth);
      } catch {
        return true;
      }
    });
  }, [driverOvertimes, calendarMonth]);

  const monthlyTotalHours = useMemo(() => {
    return approvedOtsThisMonth.reduce((sum, o) => sum + (o.hours ?? o.otHours ?? 0), 0);
  }, [approvedOtsThisMonth]);

  // Consolidated Driver Log Feed (Page 10 Mockup)
  const driverLogItems = useMemo(() => {
    if (!selectedDriver) return [];
    const items: Array<{
      id: string;
      date: Date;
      dateStr: string;
      title: string;
      desc: string;
      type: "leave" | "unfinished_task" | "overtime" | "license";
      tag: string;
      tagColor: string;
    }> = [];

    // 1. Emergency leaves
    const dLeaves = leaveRequests.filter(r => r.driver_id === selectedDriver.id);
    dLeaves.forEach(l => {
      const d = parseISO(l.created_at);
      items.push({
        id: `leave-${l.id}`,
        date: d,
        dateStr: format(d, "dd MMM · HH:mm"),
        title: `Emergency leave: ${l.reason}`,
        desc: `Task: ${l.task_title || "None"}${l.notes ? ` · Note: "${l.notes}"` : ""}`,
        type: "leave",
        tag: l.status === "pending" ? "Waiting for Admin" : l.status.toUpperCase(),
        tagColor: l.status === "pending" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : l.status === "approved" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
      });
    });

    // 2. Unfinished tasks
    const dUnfinished = tasks.filter(t => t.driverId === selectedDriver.id && isTaskUnfinished(t));
    dUnfinished.forEach(t => {
      const d = parseISO(t.startDate || t.dueDate || t.createdAt);
      items.push({
        id: `task-${t.id}`,
        date: d,
        dateStr: format(d, "dd MMM"),
        title: `1 task unfinished: ${t.title}`,
        desc: `Scheduled: ${t.startTime || "Not set"}${t.route ? ` · Route: ${t.route}` : ""}`,
        type: "unfinished_task",
        tag: "Unfinished",
        tagColor: "bg-red-500/20 text-red-400 border-red-500/30"
      });
    });

    // 3. Overtime records
    driverOvertimes.forEach(ot => {
      const d = parseISO(ot.date || ot.createdAt);
      const hrs = ot.hours ?? ot.otHours ?? 0;
      items.push({
        id: `ot-${ot.id}`,
        date: d,
        dateStr: format(d, "dd MMM"),
        title: `OT ${hrs} h ${ot.status}`,
        desc: `Reason: ${ot.reason}${ot.note ? ` · Note: "${ot.note}"` : ""}`,
        type: "overtime",
        tag: ot.status === "approved" ? "Approved" : ot.status === "rejected" ? "Rejected" : "Pending",
        tagColor: ot.status === "approved" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ot.status === "rejected" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"
      });
    });

    // 4. Licence reminder alert
    if (selectedDriver.license_expiry) {
      try {
        const exp = parseISO(selectedDriver.license_expiry);
        const diff = differenceInDays(exp, new Date());
        if (diff < 30) {
          items.push({
            id: `lic-${selectedDriver.id}`,
            date: exp,
            dateStr: format(exp, "dd MMM yyyy"),
            title: diff < 0 ? "Licence Expired" : `Licence expires in ${diff} days`,
            desc: `Driver licence ${selectedDriver.license_no || ""} needs renewal`,
            type: "license",
            tag: diff < 0 ? "Expired" : "Expiring Soon",
            tagColor: diff < 0 ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"
          });
        }
      } catch {}
    }

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedDriver, leaveRequests, tasks, driverOvertimes]);

  // Last 30 Days attendance, shifts & worked hours (Fix 9 / P5, P7)
  const last30DaysList = useMemo(() => {
    if (!selectedDriver) return [];
    const today = new Date();
    const list = [];
    for (let i = 0; i < 30; i++) {
      const d = subDays(today, i);
      const dateStr = format(d, "yyyy-MM-dd");
      const isDayToday = i === 0;
      const shiftVal = getDriverShiftForDate ? getDriverShiftForDate(selectedDriver.id, dateStr) : "No shift assigned";
      const isLeave = shiftVal.toLowerCase().includes("leave");
      const isOff = shiftVal.toLowerCase().includes("off");
      const endDay = endDayRecords.find(
        r => r.driverId === selectedDriver.id && (r.date === dateStr || r.submittedAt.startsWith(dateStr))
      );
      const dayTasks = tasks.filter(
        t => t.driverId === selectedDriver.id && (t.startDate === dateStr || t.dueDate === dateStr)
      );
      const ot = safeOvertimes.find(o => o.driverId === selectedDriver.id && o.date === dateStr);

      list.push({
        dateStr,
        formattedDate: format(d, "dd MMM (EEE)"),
        isToday: isDayToday,
        shift: shiftVal,
        isLeave,
        isOff,
        workedHours: endDay ? `${endDay.workedHours} hrs` : (isDayToday ? "In progress" : "—"),
        tasksCount: dayTasks.length,
        hasEndDay: Boolean(endDay),
        hasOt: Boolean(ot),
        otHours: ot ? (ot.hours ?? ot.otHours ?? 0) : 0,
      });
    }
    return list;
  }, [selectedDriver, endDayRecords, tasks, safeOvertimes, getDriverShiftForDate]);

  // Calendar month days calculation
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start, end });
    const startDayIndex = (getDay(start) + 6) % 7; // Monday = 0
    return {
      days,
      prefixBlanks: Array(startDayIndex).fill(null),
    };
  }, [calendarMonth]);

  const handleDayClick = async (dateStr: string) => {
    if (!selectedDriver) return;
    const currentShift = getDriverShiftForDate(selectedDriver.id, dateStr);
    const newShift = currentShift === selectedShiftTool ? "" : selectedShiftTool;

    try {
      await updateShift.mutateAsync({
        driverId: selectedDriver.id,
        shift: newShift,
        date: dateStr,
      });
      toast({
        title: "Shift Updated",
        description: `${format(parseISO(dateStr), "MMM d")}: ${newShift || "Shift Cleared"}`,
      });
    } catch {
      toast({ title: "Failed to update shift", variant: "destructive" });
    }
  };

  const handleSendLicenseWhatsApp = async () => {
    if (!selectedDriver || !selectedDriver.phone) return;
    const licStatus = getLicenseStatus(selectedDriver.license_expiry);
    if (!licStatus) return;

    setSendingReminder(true);
    try {
      const msg = `*FleetOps Driving Licence Notice*\n\nHello ${selectedDriver.name},\nYour driving licence (${selectedDriver.license_no || "on record"}) ${
        licStatus.isExpired ? "has EXPIRED on " + licStatus.formatted : "expires on " + licStatus.formatted + ` (in ${licStatus.daysLeft} days).`
      }\nPlease renew your licence promptly to maintain shift eligibility.`;

      await sendWhatsAppMessage(selectedDriver.phone, msg);
      toast({
        title: "WhatsApp Reminder Sent",
        description: `Sent to ${selectedDriver.name} (${selectedDriver.phone})`,
      });
    } catch {
      toast({ title: "Failed to send WhatsApp", variant: "destructive" });
    } finally {
      setSendingReminder(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Group Filters (Suggestion 6) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">Driver Accounts</p>
          <p className="text-xs text-muted-foreground">{filteredDrivers.length} accounts in system</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Group Chips: All | Centres | Tropical */}
          <div className="flex bg-secondary/50 rounded-xl p-0.5 border border-border">
            {(["All", "Centres", "Tropical"] as const).map(grp => (
              <button
                key={grp}
                onClick={() => setGroupFilter(grp)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  groupFilter === grp
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {grp}
              </button>
            ))}
          </div>

          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-xs px-3 py-2 rounded-xl hover:opacity-90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Account
          </button>
        </div>
      </div>

      {/* Driver cards list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No drivers found in {groupFilter} group.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDrivers.map(d => {
            const age = calculateAge(d.dob);
            const licStatus = getLicenseStatus(d.license_expiry);

            return (
              <div 
                key={d.id} 
                onClick={() => setProfileDriverId(d.id)}
                className="bg-card border border-border rounded-xl p-4 shadow-sm hover:border-primary/50 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {d.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground text-sm group-hover:text-primary transition-colors">{d.name}</p>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize border ${
                            d.role === "manager" || d.role === "admin"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : d.role === "team_leader" || d.role === "head_of_teams" || d.role === "team_head"
                              ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                              : d.role === "security"
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {d.role === "team_leader" || d.role === "head_of_teams" || d.role === "team_head" ? "Head of Teams" : d.role.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                          {d.group || "Centres"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</span>
                        {age !== null && (
                          <span className="text-foreground font-medium">· Age {age} (calculated)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(d);
                      }}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground"
                      title="Edit driver"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAdmin) {
                          toast({
                            title: "Action Restricted",
                            description: "Only Admin accounts can delete driver or staff accounts.",
                            variant: "destructive",
                          });
                          return;
                        }
                        setConfirmDel({ open: true, id: d.id, name: d.name });
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isAdmin
                          ? "hover:bg-destructive/10 text-destructive"
                          : "opacity-40 hover:opacity-60 text-muted-foreground"
                      }`}
                      title={isAdmin ? "Delete account" : "Delete restricted to Admin"}
                    >
                      {isAdmin ? <Trash2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* License Details & Expiry Chip (Issue 17 item 6) */}
                <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-border/50 text-xs flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      Licence: <span className="font-mono text-foreground font-medium">{d.license_no || "—"}</span>
                    </span>
                    {d.license_expiry && (
                      <span className="text-muted-foreground">
                        Exp: <span className="text-foreground">{format(parseISO(d.license_expiry), "MMM d, yyyy")}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {licStatus && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${licStatus.color}`}>
                        {licStatus.isExpired && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        {licStatus.label}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-primary group-hover:underline flex items-center gap-0.5 ml-2">
                      Profile & Log <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Dialog */}
      {confirmDel.open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-foreground">Delete Account</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete driver &ldquo;{confirmDel.name}&rdquo;? This action is permanent and restricted to Administrators.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDel({ open: false, id: "", name: "" })}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!isAdmin) {
                    toast({
                      title: "Action Restricted",
                      description: "Only Admin accounts can delete accounts.",
                      variant: "destructive",
                    });
                    setConfirmDel({ open: false, id: "", name: "" });
                    return;
                  }
                  try {
                    await deleteDriver.mutateAsync(confirmDel.id);
                    toast({ title: "Account deleted" });
                  } catch {
                    toast({ title: "Failed to delete", variant: "destructive" });
                  } finally {
                    setConfirmDel({ open: false, id: "", name: "" });
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Driver Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">{editingId ? "Edit Account" : "Add Account"}</h3>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Sri lal Rodrigo"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Phone *</label>
                  <input
                    type="text"
                    placeholder="e.g. 07X XXXXXXX"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                    PIN {editingId ? "(leave blank to keep)" : "*"}
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="4 digits"
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Role & Group */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Role *</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}
                    className="w-full bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="driver">Driver</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="head_of_teams">Head of Teams</option>
                    <option value="team_leader">Team Leader</option>
                    <option value="team_head">Team Head</option>
                    <option value="security">Security</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Group *</label>
                  <select
                    value={form.group}
                    onChange={e => setForm(f => ({ ...f, group: e.target.value as any }))}
                    className="w-full bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Centres">Centres</option>
                    <option value="Tropical">Tropical</option>
                  </select>
                </div>
              </div>

              {/* Date of Birth */}
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                  Date of Birth (DOB)
                </label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {calculateAge(form.dob) !== null && (
                  <p className="text-[11px] text-primary mt-1 font-medium">
                    Calculated Age: {calculateAge(form.dob)} years old
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Licence No</label>
                  <input
                    type="text"
                    placeholder="B1234567"
                    value={form.license_no}
                    onChange={e => setForm(f => ({ ...f, license_no: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Licence Expiry</label>
                  <input
                    type="date"
                    value={form.license_expiry}
                    onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update Account" : "Add Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Profile Modal (Page 9 & 10 Mockup: Shifts, Overtime, Driver Log) */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border bg-card/60 backdrop-blur-sm flex items-start justify-between gap-4">
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
                      {selectedDriver.role.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1 font-mono text-foreground"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {selectedDriver.phone}</span>
                    {calculateAge(selectedDriver.dob) !== null && (
                      <span className="text-muted-foreground font-medium">· Age {calculateAge(selectedDriver.dob)} (calculated)</span>
                    )}
                    <span className="text-muted-foreground">· Lic: <span className="font-mono text-foreground">{selectedDriver.license_no || "—"}</span></span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setProfileDriverId(null)}
                className="w-8 h-8 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center text-sm font-bold shrink-0 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* License Expiry Banner (Page 10 requirement) */}
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
                        <span>Expires in {licStatus.daysLeft} days ({licStatus.formatted}). Driver receives daily home banner & weekly WhatsApp.</span>
                      )}
                    </span>
                  </div>

                  <button
                    onClick={handleSendLicenseWhatsApp}
                    disabled={sendingReminder}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary/80 hover:bg-secondary border border-border text-[11px] font-bold text-foreground transition-all shrink-0"
                  >
                    <Send className="w-3 h-3 text-primary" />
                    {sendingReminder ? "Sending WhatsApp..." : "Send WhatsApp Reminder"}
                  </button>
                </div>
              );
            })()}

            {/* Modal Body - 2 Columns */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Left Column: Last 30 Days Shifts & Attendance (Fix 9 / P5, P7) */}
                <div className="bg-secondary/20 border border-border rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 text-primary" />
                          LAST 30 DAYS SHIFTS & WORKED HOURS
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Driver shifts, End Day attendance, worked hours, and assigned tasks.
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

                {/* Right Column: Overtime to Approve (Page 9 & 10 Mockup) */}
                <div className="bg-secondary/20 border border-border rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-primary" />
                          OVERTIME TO APPROVE
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Hours & reason auto-filled by app. Note is optional.
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg inline-block">
                          {monthlyTotalHours} h approved this month
                        </span>
                      </div>
                    </div>

                    {/* Overtime List */}
                    {driverOvertimes.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground bg-card/40 border border-border/50 rounded-xl">
                        <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5 opacity-30 text-emerald-400" />
                        <p className="text-xs">No overtime entries recorded for this driver.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {driverOvertimes.map(ot => {
                          const hrs = ot.hours ?? ot.otHours ?? 0;
                          const isVavuniya = ot.reason?.toLowerCase().includes("vavuniya") || ot.capReason?.toLowerCase().includes("vavuniya");

                          return (
                            <div key={ot.id} className="bg-card border border-border/70 rounded-xl p-2.5 text-xs flex flex-col gap-1.5 shadow-sm">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">
                                    {ot.day || (ot.date ? format(parseISO(ot.date), "EEE") : "—")}
                                  </span>
                                  <span className="text-muted-foreground text-[11px]">
                                    {ot.date ? format(parseISO(ot.date), "dd MMM") : format(parseISO(ot.createdAt), "dd MMM")}
                                  </span>
                                  <span className="font-extrabold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-[11px]">
                                    {hrs} h {isVavuniya && <span className="text-[9px] text-amber-300 font-normal">[Vavuniya]</span>}
                                  </span>
                                </div>

                                {/* Status / Actions */}
                                {ot.status === "pending" ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={async () => {
                                        try {
                                          await approveOvertime.mutateAsync(ot.id);
                                          toast({ title: "Overtime Approved", description: `${hrs} h approved for ${selectedDriver.name}` });
                                        } catch {
                                          toast({ title: "Failed to approve OT", variant: "destructive" });
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={async () => {
                                        try {
                                          await rejectOvertime.mutateAsync(ot.id);
                                          toast({ title: "Overtime Rejected" });
                                        } catch {
                                          toast({ title: "Failed to reject OT", variant: "destructive" });
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/40 rounded-lg text-xs font-bold hover:bg-red-500/30 transition-colors"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    ot.status === "approved" 
                                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                                      : "bg-red-500/15 text-red-400 border-red-500/30"
                                  }`}>
                                    {ot.status.toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-foreground font-medium">{ot.reason}</span>
                                  {ot.note && (
                                    <span className="italic text-muted-foreground ml-1">· &ldquo;{ot.note}&rdquo;</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Two Rules Card (Page 10 Mockup) */}
                  <div className="bg-card/70 border border-border/80 rounded-xl p-3 text-[11px] space-y-1 mt-3">
                    <p className="font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                      Two Rules (Head Office)
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground font-semibold">Normal day:</strong> OT = End Day time − shift end, in half hours (under 30 min = 0 h).
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground font-semibold">Vavuniya trip that day:</strong> OT = 2 h, fixed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Full-Width Section: Driver Log (Page 10 Mockup) */}
              <div className="bg-secondary/20 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-primary" />
                      DRIVER LOG
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Consolidated chronological activity log: emergency leaves, unfinished tasks, overtime, and licence warnings.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {driverLogItems.length} records
                  </span>
                </div>

                {driverLogItems.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground bg-card/40 border border-border/50 rounded-xl">
                    <p className="text-xs">No recent logs recorded for this driver.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {driverLogItems.map(item => (
                      <div key={item.id} className="bg-card border border-border/60 rounded-xl p-2.5 flex items-start justify-between gap-3 text-xs">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5">
                            {item.type === "leave" ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            ) : item.type === "unfinished_task" ? (
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                            ) : item.type === "overtime" ? (
                              <Clock className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <Shield className="w-3.5 h-3.5 text-primary" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-muted-foreground text-[11px]">{item.dateStr}</span>
                              <span className="text-muted-foreground">—</span>
                              <p className="font-bold text-foreground text-xs">{item.title}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                          </div>
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${item.tagColor}`}>
                          {item.tag}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-card/80 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Driver ID: <span className="font-mono text-foreground">{selectedDriver.id}</span>
              </span>
              <button
                onClick={() => setProfileDriverId(null)}
                className="px-4 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-bold text-xs border border-border"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
