import { useState, useMemo } from "react";
import { useDrivers } from "@/hooks/use-drivers";
import { useVehicles } from "@/hooks/use-vehicles";
import { useShifts } from "@/hooks/use-shifts";
import { useTasks, DriverTask, timeStringToMinutes } from "@/hooks/use-tasks";
import { useChecklists } from "@/hooks/use-checklists";
import { useEndDays } from "@/hooks/use-end-days";
import { useOvertime, OvertimeRecord } from "@/hooks/use-overtime";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Clock, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, 
  Phone, Plus, Trash2, Pencil, Calendar, ShieldCheck, DollarSign, Car,
  ChevronLeft, ChevronRight, CalendarDays, Check, Sun, Moon, Palmtree
} from "lucide-react";
import { 
  format, parseISO, isToday, differenceInHours,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addDays
} from "date-fns";

export function ManagerShiftTab() {
  const { data: drivers = [], isLoading: driversLoading } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const { 
    shifts, 
    shiftOptions, 
    updateShift, 
    updateShiftOptions, 
    calendarShifts,
    getDriverShiftForDate,
    isLoading: shiftsLoading 
  } = useShifts();
  const { tasks = [] } = useTasks();
  const { data: checklists = [] } = useChecklists();
  const { records: endDayRecords = [] } = useEndDays();
  const { overtimes = [], approveOvertime, caps } = useOvertime();
  const safeOvertimes = Array.isArray(overtimes) ? overtimes : [];
  const { toast } = useToast();

  const [groupFilter, setGroupFilter] = useState<"All" | "Centres" | "Tropical">("All");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [editingShiftDriverId, setEditingShiftDriverId] = useState<string | null>(null);
  const [shiftInput, setShiftInput] = useState("");
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [newOption, setNewOption] = useState("");

  // Set Shift Modal (Fix 9 / P6: start time, end time, days off, leave dates)
  const [setShiftModal, setSetShiftModal] = useState<{
    open: boolean;
    driver: any | null;
    startTime: string;
    endTime: string;
    daysOff: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    leaveStartDate: string;
    leaveEndDate: string;
    leaveReason: string;
    saving: boolean;
  }>({
    open: false,
    driver: null,
    startTime: "08:00",
    endTime: "17:00",
    daysOff: [0], // Default Sun off
    leaveStartDate: "",
    leaveEndDate: "",
    leaveReason: "Annual leave",
    saving: false,
  });

  const openSetShiftModal = (driver: any) => {
    const currentShift = shifts?.[driver.id]?.shift || "8:00 AM - 5:00 PM";
    let start = "08:00";
    let end = "17:00";
    const m = currentShift.match(/(\d{1,2}):(\d{2})?\s*(am|pm)?\s*-\s*(\d{1,2}):(\d{2})?\s*(am|pm)?/i);
    if (m) {
      let h1 = parseInt(m[1], 10);
      const m1 = m[2] || "00";
      if (m[3]?.toLowerCase() === "pm" && h1 < 12) h1 += 12;
      if (m[3]?.toLowerCase() === "am" && h1 === 12) h1 = 0;
      start = `${String(h1).padStart(2, "0")}:${m1}`;

      let h2 = parseInt(m[4], 10);
      const m2 = m[5] || "00";
      if (m[6]?.toLowerCase() === "pm" && h2 < 12) h2 += 12;
      if (m[6]?.toLowerCase() === "am" && h2 === 12) h2 = 0;
      end = `${String(h2).padStart(2, "0")}:${m2}`;
    }

    setSetShiftModal({
      open: true,
      driver,
      startTime: start,
      endTime: end,
      daysOff: [0],
      leaveStartDate: "",
      leaveEndDate: "",
      leaveReason: "Annual leave",
      saving: false,
    });
  };

  const handleSaveSetShift = async () => {
    if (!setShiftModal.driver) return;
    setSetShiftModal(prev => ({ ...prev, saving: true }));
    try {
      const formatTimeAmPm = (t: string) => {
        const [hStr, mStr] = t.split(":");
        let h = parseInt(hStr || "0", 10);
        const m = mStr || "00";
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12;
        if (h === 0) h = 12;
        return `${h}:${m} ${ampm}`;
      };

      const shiftStr = `${formatTimeAmPm(setShiftModal.startTime)} - ${formatTimeAmPm(setShiftModal.endTime)}`;
      await updateShift.mutateAsync({
        driverId: setShiftModal.driver.id,
        shift: shiftStr,
      });

      // If leave dates entered, schedule leave for that period
      if (setShiftModal.leaveStartDate && setShiftModal.leaveEndDate) {
        const start = parseISO(setShiftModal.leaveStartDate);
        const end = parseISO(setShiftModal.leaveEndDate);
        if (start <= end) {
          const leaveDays = eachDayOfInterval({ start, end });
          for (const d of leaveDays) {
            try {
              await updateShift.mutateAsync({
                driverId: setShiftModal.driver.id,
                shift: "Leave",
                date: format(d, "yyyy-MM-dd"),
              });
            } catch {}
          }
        }
      }

      toast({
        title: "Shift Assigned ✓",
        description: `${setShiftModal.driver.name}: ${shiftStr}${setShiftModal.leaveStartDate ? " with leave scheduled" : ""}`,
      });
      setSetShiftModal(prev => ({ ...prev, open: false, saving: false }));
    } catch (err: any) {
      toast({ title: "Failed to save shift", description: err.message, variant: "destructive" });
      setSetShiftModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Interactive Month Calendar & Date Shift Scheduler modal
  const [calendarModalDriver, setCalendarModalDriver] = useState<any | null>(null);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>(todayStr);
  const [calendarSelectedShift, setCalendarSelectedShift] = useState<string>("");
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());

  const driverList = useMemo(() => {
    return (drivers || []).filter(d => {
      if (d.role !== "driver") return false;
      if (groupFilter === "All") return true;
      return d.group === groupFilter;
    });
  }, [drivers, groupFilter]);

  // Compute status for driver (Fix N1 / Issue 4)
  const getDriverStatus = (driverId: string, shiftStr: string) => {
    if (!shiftStr || shiftStr === "Leave" || shiftStr.toLowerCase().includes("leave")) {
      return { label: "On leave", color: "bg-slate-500/15 text-slate-400 border-slate-500/20" };
    }

    const driverChecklistToday = checklists.some(
      c => c.driver_id === driverId && isToday(parseISO(c.submitted_at))
    );

    // If checklist done today: check if end day reading is completed
    const hasEndDay = endDayRecords.some(
      r => r.driverId === driverId && (r.date === todayStr || r.submittedAt.startsWith(todayStr))
    );

    if (hasEndDay) {
      return { label: "Completed Day", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
    }

    if (driverChecklistToday && !hasEndDay) {
      return { label: "Online", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    }

    // Check if starts in X hours before shift
    const timeMatch = shiftStr.match(/(\d{1,2})[:.](\d{2})?\s*(am|pm)/i);
    if (timeMatch) {
      try {
        let hour = parseInt(timeMatch[1], 10);
        const meridiem = (timeMatch[3] || "").toLowerCase();
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        
        const now = new Date();
        const currentHour = now.getHours();
        const diff = hour - currentHour;
        if (diff > 0 && diff <= 4) {
          return { label: `Available in ${diff} h`, color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
        }
      } catch {
        // Fallback
      }
    }

    return { label: "Offline", color: "bg-slate-500/15 text-slate-400 border-slate-500/20" };
  };

  const getDriverTasksToday = (driverId: string) => {
    return (tasks || [])
      .filter(t => t.driverId === driverId && (t.startDate === todayStr || t.dueDate === todayStr))
      .sort((a, b) => {
        const timeA = a.startTime ? timeStringToMinutes(a.startTime) : 9999;
        const timeB = b.startTime ? timeStringToMinutes(b.startTime) : 9999;
        return timeA - timeB;
      });
  };

  const handleOpenCalendarModal = (driver: any) => {
    setCalendarModalDriver(driver);
    setCalendarSelectedDate(todayStr);
    const existing = getDriverShiftForDate(driver.id, todayStr);
    setCalendarSelectedShift(existing === "No shift assigned" ? "" : existing);
    setCurrentCalendarMonth(new Date());
  };

  const handleSelectCalendarDate = (dateStr: string) => {
    setCalendarSelectedDate(dateStr);
    if (calendarModalDriver) {
      const existing = getDriverShiftForDate(calendarModalDriver.id, dateStr);
      setCalendarSelectedShift(existing === "No shift assigned" ? "" : existing);
    }
  };

  const handleSaveCalendarShift = async (shiftToSave?: string) => {
    if (!calendarModalDriver) return;
    try {
      const shiftVal = (shiftToSave !== undefined ? shiftToSave : calendarSelectedShift).trim() || "No shift assigned";
      await updateShift.mutateAsync({
        driverId: calendarModalDriver.id,
        shift: shiftVal,
        date: calendarSelectedDate
      });
      setCalendarSelectedShift(shiftVal === "No shift assigned" ? "" : shiftVal);
      toast({
        title: "Shift Scheduled Successfully ✓",
        description: `${calendarModalDriver.name} on ${calendarSelectedDate}: ${shiftVal}`
      });
    } catch (err: any) {
      toast({
        title: "Failed to schedule shift",
        description: err?.message || "Could not save shift. Please try again.",
        variant: "destructive"
      });
    }
  };

  const calendarDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(currentCalendarMonth);
      const monthEnd = endOfMonth(monthStart);
      const startDate = startOfWeek(monthStart);
      const endDate = endOfWeek(monthEnd);
      return eachDayOfInterval({ start: startDate, end: endDate });
    } catch {
      return [];
    }
  }, [currentCalendarMonth]);

  const handleSaveShift = async (driverId: string) => {
    try {
      const shiftValue = shiftInput.trim() || "No shift assigned";
      await updateShift.mutateAsync({ driverId, shift: shiftValue });
      toast({ title: "Shift updated successfully", description: `Shift set to ${shiftValue}` });
      setEditingShiftDriverId(null);
    } catch (err: any) {
      console.error("Save shift error:", err);
      toast({
        title: "Failed to update shift",
        description: err?.message || "Could not save shift. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleAddShiftOption = async () => {
    if (!newOption.trim()) return;
    try {
      const updated = [...(shiftOptions || []), newOption.trim()];
      await updateShiftOptions.mutateAsync(updated);
      setNewOption("");
      toast({ title: "Option added" });
    } catch {
      toast({ title: "Failed to add option", variant: "destructive" });
    }
  };

  const handleRemoveShiftOption = async (opt: string) => {
    try {
      const updated = (shiftOptions || []).filter(o => o !== opt);
      await updateShiftOptions.mutateAsync(updated);
      toast({ title: "Option removed" });
    } catch {
      toast({ title: "Failed to remove option", variant: "destructive" });
    }
  };

  const selectedDriver = drivers.find(d => d.id === selectedDriverId);
  const selectedDriverTasks = selectedDriverId ? getDriverTasksToday(selectedDriverId) : [];
  const selectedDriverShift = selectedDriverId ? (shifts?.[selectedDriverId]?.shift || "No shift assigned") : "";

  return (
    <div className="space-y-4">
      {/* Header and Group Filters (Suggestion 6) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">Drivers Shift & Day View</p>
          <p className="text-xs text-muted-foreground">Tap a name to inspect his schedule and tasks for today</p>
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
            onClick={() => setShowOptionsModal(true)}
            className="flex items-center gap-1 bg-secondary text-foreground font-medium text-xs px-2.5 py-1.5 rounded-xl hover:bg-secondary/80 border border-border"
          >
            <Clock className="w-3.5 h-3.5 text-primary" /> Options
          </button>
        </div>
      </div>

      {/* Driver Shifts Table / List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-12 gap-2 p-3 bg-secondary/30 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-4 sm:col-span-3">Driver / Vehicle</div>
          <div className="col-span-3 sm:col-span-3">Shift</div>
          <div className="col-span-2 sm:col-span-2 text-center">Status</div>
          <div className="col-span-3 sm:col-span-2 text-center">Tasks</div>
          <div className="hidden sm:block sm:col-span-2 text-right">OT / Action</div>
        </div>

        {driverList.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No drivers found in {groupFilter} group.
          </div>
        ) : (
          driverList.map(d => {
            const currentShift = shifts?.[d.id]?.shift || "No shift assigned";
            const isEditing = editingShiftDriverId === d.id;
            const isSelected = selectedDriverId === d.id;
            const assignedVehicle = vehicles.find(v => v.assigned_driver_id === d.id);
            const status = getDriverStatus(d.id, currentShift);
            const driverTasks = getDriverTasksToday(d.id) || [];
            const doneTasks = driverTasks.filter(t => t.status === "done").length;
            const pendingOT = safeOvertimes.find(o => o?.driverId === d.id && o?.status === "pending");

            return (
              <div key={d.id} className="border-b border-border/60 last:border-0">
                <div
                  onClick={() => setSelectedDriverId(isSelected ? null : d.id)}
                  className={`grid grid-cols-12 gap-2 p-3 items-center cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/10" : "hover:bg-secondary/40"
                  }`}
                >
                  {/* Driver & Vehicle */}
                  <div className="col-span-4 sm:col-span-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {d.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-foreground truncate hover:text-primary transition-colors">
                          {d.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {assignedVehicle ? assignedVehicle.vehicle_no : "No vehicle"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Shift */}
                  <div className="col-span-3 sm:col-span-3 text-xs" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOpenCalendarModal(d)}
                        className={`font-semibold text-xs truncate px-2.5 py-1 rounded-lg border text-left transition-all flex items-center gap-1.5 group ${
                          currentShift === "Leave" || currentShift.toLowerCase().includes("leave")
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                            : currentShift !== "No shift assigned"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                            : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                        }`}
                        title="Click to schedule shift on Calendar"
                      >
                        <Calendar className="w-3.5 h-3.5 shrink-0 text-primary group-hover:scale-110 transition-transform" />
                        <span className="truncate max-w-[95px] sm:max-w-none">{currentShift}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openSetShiftModal(d)}
                        className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Set Driver Shift & Working Hours"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Status Badge (Issue 4) */}
                  <div className="col-span-2 sm:col-span-2 text-center">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  {/* Tasks progress */}
                  <div className="col-span-3 sm:col-span-2 text-center">
                    <span className="text-xs font-mono font-medium text-foreground">
                      {doneTasks} of {driverTasks.length} done
                    </span>
                  </div>

                  {/* OT / Expand icon */}
                  <div className="hidden sm:flex sm:col-span-2 items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                    {pendingOT ? (
                      <button
                        onClick={() => {
                          approveOvertime.mutate(pendingOT.id);
                          toast({ title: "Overtime approved" });
                        }}
                        className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-amber-500/30 transition-colors"
                      >
                        {pendingOT.otHours ?? pendingOT.hours ?? 0}h approve
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {isSelected ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Day View (Issue 3 & Mockup on Page 3) */}
                {isSelected && (
                  <div className="bg-background/90 p-4 border-t border-border space-y-3 animate-in fade-in-50 duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-card border border-border rounded-xl p-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {d.name} · shift {currentShift}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Tasks shown under his shift, soonest first. Late tasks highlighted in red.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const formatted = d.phone.startsWith("0") ? "+94" + d.phone.slice(1) : d.phone;
                            window.open(`https://wa.me/${formatted.replace(/\+/g, "")}?text=${encodeURIComponent(`Hello ${d.name}, your shift today is: ${currentShift}`)}`, "_blank");
                          }}
                          className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-emerald-500/25 transition-colors"
                        >
                          <Phone className="w-3 h-3" /> WhatsApp
                        </button>
                      </div>
                    </div>

                    {/* Timeline visualization based on real shift & tasks (Issue 9.1) */}
                    {driverTasks.length > 0 ? (() => {
                      const totalT = driverTasks.length;
                      const nowTimeStr = format(new Date(), "HH:mm");
                      const doneCount = driverTasks.filter(t => t.status === "done").length;
                      const lateCount = driverTasks.filter(t => t.status !== "done" && t.endTime && t.endTime < nowTimeStr).length;
                      const inProgCount = driverTasks.filter(t => t.status === "in_progress" && (!t.endTime || t.endTime >= nowTimeStr)).length;
                      const waitingCount = driverTasks.filter(t => t.status === "pending" && (!t.endTime || t.endTime >= nowTimeStr)).length;

                      const donePct = (doneCount / totalT) * 100;
                      const latePct = (lateCount / totalT) * 100;
                      const inProgPct = (inProgCount / totalT) * 100;
                      const waitPct = (waitingCount / totalT) * 100;

                      return (
                        <div className="bg-card border border-border rounded-xl p-3">
                          <div className="flex justify-between text-[11px] font-mono text-muted-foreground mb-1.5">
                            <span>{currentShift.split("-")[0]?.trim() || "Shift Start"}</span>
                            <span>Real Task Progress</span>
                            <span>{currentShift.split("-")[1]?.trim() || "Shift End"}</span>
                          </div>
                          <div className="h-3.5 bg-secondary rounded-full overflow-hidden flex gap-0.5 p-0.5">
                            {donePct > 0 && <div className="h-full bg-emerald-500 rounded-l transition-all" style={{ width: `${donePct}%` }} title={`Done: ${doneCount}`} />}
                            {latePct > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${latePct}%` }} title={`Late: ${lateCount}`} />}
                            {inProgPct > 0 && <div className="h-full bg-blue-500 transition-all" style={{ width: `${inProgPct}%` }} title={`In Progress: ${inProgCount}`} />}
                            {waitPct > 0 && <div className="h-full bg-primary/40 rounded-r flex-1 transition-all" style={{ width: `${waitPct}%` }} title={`Waiting: ${waitingCount}`} />}
                          </div>
                          <div className="flex flex-wrap gap-4 mt-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Done ({doneCount})</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Late ({lateCount})</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress ({inProgCount})</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Waiting ({waitingCount})</span>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="bg-card border border-border rounded-xl p-3 text-center">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden mb-1.5">
                          <div className="h-full bg-slate-500/30 rounded" style={{ width: "100%" }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">No tasks scheduled for today</p>
                      </div>
                    )}

                    {/* Vehicles Today (Two vehicles in one shift - Page 12 Mockup) */}
                    {(() => {
                      const driverChecklistsToday = checklists.filter(c => {
                        if (c.driver_id !== d.id) return false;
                        const dateStr = (c as any).submitted_at || (c as any).created_at || (c as any).date;
                        if (!dateStr || typeof dateStr !== "string") return false;
                        try {
                          return isToday(parseISO(dateStr));
                        } catch {
                          return false;
                        }
                      });
                      const assignedVeh = vehicles.find(v => v.assigned_driver_id === d.id);
                      const distinctVehicleIds = Array.from(new Set([
                        ...(assignedVeh ? [assignedVeh.id] : []),
                        ...driverChecklistsToday.map(c => c.vehicle_id).filter(Boolean) as string[],
                      ]));
                      const distinctVehiclesList = distinctVehicleIds.map(id => vehicles.find(v => v.id === id)).filter(Boolean) as typeof vehicles;

                      if (distinctVehiclesList.length === 0) return null;

                      return (
                        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Car className="w-4 h-4 text-primary" />
                              <span className="text-xs font-bold text-foreground">Vehicles Today</span>
                              {distinctVehiclesList.length > 1 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                                  Two vehicles in one shift
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {distinctVehiclesList.length} vehicle{distinctVehiclesList.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            {distinctVehiclesList.map((veh, idx) => {
                              const vChecklist = driverChecklistsToday.find(c => c.vehicle_id === veh.id);
                              const isSwitch = idx > 0;
                              const rawTime = vChecklist ? ((vChecklist as any).submitted_at || (vChecklist as any).created_at || (vChecklist as any).date) : null;
                              let handoverTime = idx === 0 ? "8:00 AM" : "1:40 PM";
                              if (rawTime && typeof rawTime === "string") {
                                try {
                                  handoverTime = format(parseISO(rawTime), "h:mm a");
                                } catch {}
                              }
                              const odo = vChecklist?.odometer ?? veh.current_km;

                              return (
                                <div key={veh.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-background border border-border/80 rounded-lg px-3 py-2 text-xs gap-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isSwitch && <span className="text-primary font-bold">→</span>}
                                    <span className="font-bold text-foreground font-mono">{veh.vehicle_no}</span>
                                    <span className="text-muted-foreground font-mono">({handoverTime})</span>
                                    {isSwitch && <span className="text-[11px] text-amber-400 font-medium">handed over {handoverTime}</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground font-mono">{odo ? odo.toLocaleString() : "—"} km</span>
                                    {vChecklist ? (
                                      <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                        checklist ✓
                                      </span>
                                    ) : (
                                      <span className="text-amber-400 text-[11px]">checklist pending</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Task List under his shift */}
                    <div className="space-y-2">
                      {driverTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center">
                          No tasks scheduled for {d.name} today.
                        </p>
                      ) : (
                        driverTasks.map(task => {
                          const isLate = task.status !== "done" && task.endTime && task.endTime < format(new Date(), "HH:mm");
                          return (
                            <div
                              key={task.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                                isLate ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-card border-border"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Clock className={`w-3.5 h-3.5 shrink-0 ${isLate ? "text-red-400" : "text-primary"}`} />
                                <span className="font-mono font-bold text-foreground">
                                  {task.startTime || "--:--"} - {task.endTime || "--:--"}
                                </span>
                                <span className="font-medium text-foreground truncate">{task.title}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                isLate ? "bg-red-500/20 text-red-400" : task.status === "done" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
                              }`}>
                                {isLate ? "Late" : task.status.replace("_", " ")}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Overtime Review Section (Suggestion 5 & Page 13 Mockup) */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">Overtime · This Week</p>
            <p className="text-xs text-muted-foreground">
              Shift = 9 h. Worked time − 9 h = OT. Times calculated from Start and End Day.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            Auto-calculated
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground font-bold uppercase tracking-wider">
                <th className="pb-2">Driver</th>
                <th className="pb-2">Day</th>
                <th className="pb-2">Worked</th>
                <th className="pb-2">OT</th>
                <th className="pb-2">Reason (Auto/Driver)</th>
                <th className="pb-2 text-right">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {safeOvertimes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    No overtime records submitted this week.
                  </td>
                </tr>
              ) : (
                safeOvertimes.map(ot => {
                  const driver = drivers.find(d => d.id === ot.driverId);
                  const isPending = ot.status === "pending";

                  return (
                    <tr key={ot.id} className="py-2">
                      <td className="py-2.5 font-bold text-foreground">{driver?.name || "Driver"}</td>
                      <td className="py-2.5 text-muted-foreground">{ot.date}</td>
                      <td className="py-2.5 font-mono">{ot.workedHours} h</td>
                      <td className="py-2.5 font-mono font-bold text-amber-400">
                        {ot.hours} h {ot.capHours && <span className="text-[10px] text-muted-foreground font-normal">(cap {ot.capHours}h)</span>}
                      </td>
                      <td className="py-2.5 text-foreground">{ot.reason}</td>
                      <td className="py-2.5 text-right">
                        {isPending ? (
                          <button
                            onClick={() => {
                              approveOvertime.mutate(ot.id);
                              toast({ title: "Overtime approved" });
                            }}
                            className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                          >
                            Approve
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center justify-end gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Approved
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-secondary/30 rounded-xl p-2.5 text-[11px] text-muted-foreground flex flex-wrap justify-between items-center gap-2">
          <span>Fixed Cap per Area: Vavuniya 2 h · Polonnaruwa 1.5 h · Other: no cap</span>
          <span className="text-primary font-medium">OT paid = real OT, but never more than the cap of the area visited that day.</span>
        </div>
      </div>

      {/* Customize Shift Options Modal */}
      {showOptionsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm">Customize Shift Options</h3>
              <button onClick={() => setShowOptionsModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 6:00 AM - 3:00 PM"
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                className="flex-1 bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleAddShiftOption}
                className="bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {(shiftOptions || []).map(opt => (
                <div key={opt} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-1.5 text-xs">
                  <span className="font-medium text-foreground">{opt}</span>
                  <button onClick={() => handleRemoveShiftOption(opt)} className="text-destructive p-1 rounded hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Month Calendar & Date Shift Scheduler Modal */}
      {calendarModalDriver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl animate-in fade-in-50 duration-200 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                  {calendarModalDriver.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base flex items-center gap-2">
                    {calendarModalDriver.name}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Shift Calendar
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {vehicles.find(v => v.assigned_driver_id === calendarModalDriver.id)?.vehicle_no || "No vehicle"} · {calendarModalDriver.group || "Driver"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalendarModalDriver(null)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Month Header & Navigation */}
            <div className="flex items-center justify-between bg-secondary/40 p-2.5 rounded-xl border border-border">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentCalendarMonth(prev => subMonths(prev, 1))}
                  className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-sm text-foreground px-2">
                  {format(currentCalendarMonth, "MMMM yyyy")}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentCalendarMonth(prev => addMonths(prev, 1))}
                  className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCurrentCalendarMonth(now);
                    handleSelectCalendarDate(format(now, "yyyy-MM-dd"));
                  }}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Interactive Month Calendar Grid */}
            <div className="space-y-1">
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground uppercase py-1">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isCurrentMonth = isSameMonth(day, currentCalendarMonth);
                  const isDayToday = isToday(day);
                  const isSelected = dateStr === calendarSelectedDate;
                  const dayShift = getDriverShiftForDate(calendarModalDriver.id, dateStr);
                  const hasShift = dayShift && dayShift !== "No shift assigned";
                  const isDayLeave = dayShift && (dayShift === "Leave" || dayShift.toLowerCase().includes("leave"));
                  const isDayNight = dayShift && dayShift.toLowerCase().includes("pm") && !dayShift.toLowerCase().startsWith("8:00 am") && !dayShift.toLowerCase().startsWith("6:00 am");

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => handleSelectCalendarDate(dateStr)}
                      className={`min-h-[58px] sm:min-h-[64px] p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/40 shadow-sm"
                          : isDayToday
                          ? "border-primary/50 bg-primary/10"
                          : isCurrentMonth
                          ? "border-border/60 bg-card hover:border-primary/40 hover:bg-secondary/40"
                          : "border-border/20 bg-card/20 opacity-35 hover:opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs font-bold ${
                          isSelected ? "text-emerald-400 font-extrabold" : isDayToday ? "text-primary font-bold" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {format(day, "d")}
                        </span>
                        {isDayToday && (
                          <span className="text-[8px] font-extrabold px-1 rounded bg-primary text-primary-foreground">
                            Today
                          </span>
                        )}
                      </div>

                      <div className="w-full truncate mt-1">
                        {hasShift ? (
                          <span className={`block truncate text-[9px] font-bold px-1 py-0.5 rounded leading-tight text-center ${
                            isDayLeave
                              ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
                              : isDayNight
                              ? "bg-indigo-500/25 text-indigo-300 border border-indigo-500/40"
                              : "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
                          }`}>
                            {isDayLeave ? "Leave" : dayShift.length > 12 ? dayShift.slice(0, 10) + "…" : dayShift}
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/40 block text-center">—</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Shift Assignment Panel for the Selected Date */}
            <div className="bg-secondary/30 border border-border rounded-xl p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <CalendarDays className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Selected Date:
                    </span>
                    <span className="text-xs font-extrabold text-emerald-400 font-mono">
                      {format(parseISO(calendarSelectedDate), "EEEE, dd MMMM yyyy")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Current scheduled shift: <strong className="text-foreground">{getDriverShiftForDate(calendarModalDriver.id, calendarSelectedDate)}</strong>
                  </p>
                </div>

                {/* Quick Date Switchers */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleSelectCalendarDate(todayStr)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                      calendarSelectedDate === todayStr ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary text-foreground"
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectCalendarDate(format(addDays(new Date(), 1), "yyyy-MM-dd"))}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                      calendarSelectedDate === format(addDays(new Date(), 1), "yyyy-MM-dd") ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-secondary text-foreground"
                    }`}
                  >
                    Tomorrow
                  </button>
                  <input
                    type="date"
                    value={calendarSelectedDate}
                    onChange={e => e.target.value && handleSelectCalendarDate(e.target.value)}
                    className="bg-card border border-input rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Shift Preset Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                  Quick Assign Shift Preset:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarSelectedShift("8:00 AM - 5:00 PM")}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${
                      calendarSelectedShift === "8:00 AM - 5:00 PM"
                        ? "bg-emerald-500/25 text-emerald-300 border-emerald-500 ring-1 ring-emerald-500"
                        : "bg-card hover:bg-secondary text-foreground border-border"
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-400" /> Day 8–5
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarSelectedShift("2:00 PM - 11:00 PM")}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${
                      calendarSelectedShift === "2:00 PM - 11:00 PM"
                        ? "bg-indigo-500/25 text-indigo-300 border-indigo-500 ring-1 ring-indigo-500"
                        : "bg-card hover:bg-secondary text-foreground border-border"
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-indigo-400" /> Night 2–11
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarSelectedShift("Leave")}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${
                      calendarSelectedShift === "Leave"
                        ? "bg-amber-500/25 text-amber-300 border-amber-500 ring-1 ring-amber-500"
                        : "bg-card hover:bg-secondary text-foreground border-border"
                    }`}
                  >
                    <Palmtree className="w-3.5 h-3.5 text-amber-400" /> Leave
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarSelectedShift("No shift assigned")}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all ${
                      calendarSelectedShift === "No shift assigned"
                        ? "bg-destructive/20 text-destructive border-destructive"
                        : "bg-card hover:bg-secondary text-muted-foreground border-border"
                    }`}
                  >
                    Clear / Off
                  </button>
                </div>
              </div>

              {/* Custom Shift Selector & Save */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <div className="flex-1">
                  <select
                    value={calendarSelectedShift}
                    onChange={e => setCalendarSelectedShift(e.target.value)}
                    className="w-full bg-card border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose or Custom Shift --</option>
                    <option value="No shift assigned">No shift assigned / Day Off</option>
                    <option value="Leave">Leave</option>
                    {(shiftOptions || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={updateShift.isPending}
                  onClick={() => handleSaveCalendarShift()}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Check className="w-4 h-4" />
                  {updateShift.isPending ? "Saving..." : `Save Shift for ${format(parseISO(calendarSelectedDate), "MMM d")}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set Shift Modal (Fix 9 / P6: Start time, End time, Days off, Leave dates) */}
      {setShiftModal.open && setShiftModal.driver && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Set Driver Shift & Working Hours
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Driver: <strong className="text-foreground">{setShiftModal.driver.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setSetShiftModal(prev => ({ ...prev, open: false }))}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Working Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-muted-foreground block mb-1">Start Time *</label>
                  <input
                    type="time"
                    value={setShiftModal.startTime}
                    onChange={e => setSetShiftModal(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground block mb-1">End Time *</label>
                  <input
                    type="time"
                    value={setShiftModal.endTime}
                    onChange={e => setSetShiftModal(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Days Off Selector */}
              <div>
                <label className="font-bold text-muted-foreground block mb-1.5">Weekly Days Off</label>
                <div className="grid grid-cols-7 gap-1">
                  {[
                    { label: "Mon", idx: 1 },
                    { label: "Tue", idx: 2 },
                    { label: "Wed", idx: 3 },
                    { label: "Thu", idx: 4 },
                    { label: "Fri", idx: 5 },
                    { label: "Sat", idx: 6 },
                    { label: "Sun", idx: 0 },
                  ].map(d => {
                    const isOff = setShiftModal.daysOff.includes(d.idx);
                    return (
                      <button
                        key={d.label}
                        type="button"
                        onClick={() => {
                          setSetShiftModal(prev => ({
                            ...prev,
                            daysOff: isOff ? prev.daysOff.filter(x => x !== d.idx) : [...prev.daysOff, d.idx],
                          }));
                        }}
                        className={`py-1.5 rounded-lg border text-xs font-bold text-center transition-all ${
                          isOff
                            ? "bg-zinc-600/30 text-zinc-300 border-zinc-500 font-extrabold"
                            : "bg-background text-muted-foreground border-border hover:border-primary/40"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Highlighted days are off-shift.</p>
              </div>

              {/* Leave Scheduling */}
              <div className="border-t border-border pt-3 space-y-2">
                <label className="font-bold text-muted-foreground block">Schedule Upcoming Leave (Optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">From</span>
                    <input
                      type="date"
                      value={setShiftModal.leaveStartDate}
                      onChange={e => setSetShiftModal(prev => ({ ...prev, leaveStartDate: e.target.value }))}
                      className="w-full bg-background border border-input rounded-xl px-2.5 py-1.5 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">To</span>
                    <input
                      type="date"
                      value={setShiftModal.leaveEndDate}
                      onChange={e => setSetShiftModal(prev => ({ ...prev, leaveEndDate: e.target.value }))}
                      className="w-full bg-background border border-input rounded-xl px-2.5 py-1.5 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Leave reason (e.g. Annual leave, Personal)"
                  value={setShiftModal.leaveReason}
                  onChange={e => setSetShiftModal(prev => ({ ...prev, leaveReason: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-1.5 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSetShiftModal(prev => ({ ...prev, open: false }))}
                className="flex-1 border border-border text-muted-foreground hover:bg-secondary py-2.5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSetShift}
                disabled={setShiftModal.saving}
                className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-xs disabled:opacity-50 shadow-md"
              >
                {setShiftModal.saving ? "Saving..." : "Save Shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
