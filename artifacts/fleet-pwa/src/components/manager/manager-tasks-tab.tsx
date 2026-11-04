import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks, DriverTask, TaskPriority, TaskStatus, timeStringToMinutes } from "@/hooks/use-tasks";
import { useDrivers } from "@/hooks/use-drivers";
import { useVehicles } from "@/hooks/use-vehicles";
import { useShifts } from "@/hooks/use-shifts";
import { useToast } from "@/hooks/use-toast";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { logAuditEvent } from "@/lib/audit-logger";
import { 
  Plus, Pencil, Trash2, CalendarDays, Clock, Users, Car, 
  Route, CheckCircle2, AlertTriangle, ArrowUpDown, Filter, Camera,
  Ban, XCircle, AlertCircle, Check
} from "lucide-react";
import { format, parseISO, isAfter, isBefore, addHours } from "date-fns";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-blue-400/15 text-blue-400 border-blue-400/30",
  medium: "bg-amber-400/15 text-amber-400 border-amber-400/30",
  high: "bg-red-400/15 text-red-400 border-red-400/30",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "bg-slate-400/15 text-slate-400 border-slate-400/30",
  in_progress: "bg-blue-400/15 text-blue-400 border-blue-400/30",
  done: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  unfinished: "bg-amber-400/15 text-amber-400 border-amber-400/30",
};

function parseShiftRangeMinutes(shiftStr?: string | null): {
  isLeave: boolean;
  isOff: boolean;
  startMins: number | null;
  endMins: number | null;
} {
  if (!shiftStr || shiftStr === "No shift assigned") {
    return { isLeave: false, isOff: false, startMins: null, endMins: null };
  }
  const lower = shiftStr.toLowerCase().trim();
  if (lower === "leave" || lower.includes("leave")) {
    return { isLeave: true, isOff: false, startMins: null, endMins: null };
  }
  if (lower === "off" || lower.includes("day off")) {
    return { isLeave: false, isOff: true, startMins: null, endMins: null };
  }

  const m = shiftStr.match(
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i
  );
  if (!m) {
    return { isLeave: false, isOff: false, startMins: null, endMins: null };
  }

  let h1 = parseInt(m[1], 10);
  const min1 = m[2] ? parseInt(m[2], 10) : 0;
  const ampm1 = (m[3] || "").toLowerCase();

  let h2 = parseInt(m[4], 10);
  const min2 = m[5] ? parseInt(m[5], 10) : 0;
  const ampm2 = (m[6] || "").toLowerCase();

  if (ampm1 === "pm" && h1 < 12) h1 += 12;
  if (ampm1 === "am" && h1 === 12) h1 = 0;

  if (ampm2 === "pm" && h2 < 12) h2 += 12;
  if (ampm2 === "am" && h2 === 12) h2 = 0;

  return {
    isLeave: false,
    isOff: false,
    startMins: h1 * 60 + min1,
    endMins: h2 * 60 + min2,
  };
}

export type Row1Filter = "today" | "all";
export type Row2Filter = "all" | "pending" | "in_progress" | "done" | "unfinished" | "cancelled";
export type SortMode = "start_time" | "newest" | "driver" | "vehicle" | "status";

export function ManagerTasksTab() {
  const { user } = useAuth();
  const { tasks = [], createTask, updateTask, deleteTask, updateStatus } = useTasks();
  const { data: drivers = [] } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const { shifts, getDriverShiftForDate } = useShifts();
  const { toast } = useToast();

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<DriverTask | null>(null);
  const [driverGroupFilter, setDriverGroupFilter] = useState<"Tropical" | "All">("Tropical");

  // Row 1 filter (Today | All tasks) persisted in localStorage
  const [row1Filter, setRow1Filter] = useState<Row1Filter>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("fleet_manager_tasks_row1") as Row1Filter) || "today";
    }
    return "today";
  });

  // Row 2 filter (All | Pending | In progress | Done | Unfinished | Cancelled) persisted in localStorage
  const [row2Filter, setRow2Filter] = useState<Row2Filter>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("fleet_manager_tasks_row2") as Row2Filter) || "all";
    }
    return "all";
  });

  const [filterDriver, setFilterDriver] = useState<string>("all");
  const [filterVehicle, setFilterVehicle] = useState<string>("all");

  // Sort mode persisted in localStorage
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("fleet_manager_tasks_sort") as SortMode) || "start_time";
    }
    return "start_time";
  });

  // Task Cancel Modal State (Issue 5)
  const [cancelModal, setCancelModal] = useState<{
    open: boolean;
    task: DriverTask | null;
    reason: string;
    customNote: string;
    notifyWhatsApp: boolean;
    submitting: boolean;
  }>({
    open: false,
    task: null,
    reason: "Trip rescheduled",
    customNote: "",
    notifyWhatsApp: true,
    submitting: false,
  });

  const [confirmDel, setConfirmDel] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" });
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const defaultStartTime = format(now, "HH:mm");
  const defaultEndTime = format(addHours(now, 1), "HH:mm");

  const [form, setForm] = useState({
    title: "",
    description: "",
    driverId: "",
    vehicleId: "",
    priority: "medium" as TaskPriority,
    status: "pending" as TaskStatus,
    startDate: todayStr,
    startTime: defaultStartTime,
    endDate: todayStr,
    endTime: defaultEndTime,
    route: "",
    notes: "",
    photoRequired: false,
  });

  const handleRow1Change = (val: Row1Filter) => {
    setRow1Filter(val);
    try {
      localStorage.setItem("fleet_manager_tasks_row1", val);
    } catch (e) {}
  };

  const handleRow2Change = (val: Row2Filter) => {
    setRow2Filter(val);
    try {
      localStorage.setItem("fleet_manager_tasks_row2", val);
    } catch (e) {}
  };

  const handleSortChange = (val: SortMode) => {
    setSortMode(val);
    try {
      localStorage.setItem("fleet_manager_tasks_sort", val);
    } catch (e) {}
  };

  const openNew = () => {
    const cur = new Date();
    const curToday = format(cur, "yyyy-MM-dd");
    setForm({
      title: "",
      description: "",
      driverId: "",
      vehicleId: "",
      priority: "medium",
      status: "pending",
      startDate: curToday,
      startTime: format(cur, "HH:mm"),
      endDate: curToday,
      endTime: format(addHours(cur, 1), "HH:mm"),
      route: "",
      notes: "",
      photoRequired: false,
    });
    setEditing(null);
    setModal(true);
  };

  const openEdit = (t: DriverTask) => {
    setForm({
      title: t.title,
      description: t.description || "",
      driverId: t.driverId || "",
      vehicleId: t.vehicleId || "",
      priority: t.priority,
      status: t.status,
      startDate: t.startDate || t.dueDate || todayStr,
      startTime: t.startTime || defaultStartTime,
      endDate: t.endDate || t.startDate || t.dueDate || todayStr,
      endTime: t.endTime || defaultEndTime,
      route: t.route || "",
      notes: t.notes || "",
      photoRequired: t.photoRequired ?? false,
    });
    setEditing(t);
    setModal(true);
  };

  // Auto-fill vehicle when driver is selected (Change 3)
  const handleDriverChange = (driverId: string) => {
    const assignedVehicle = vehicles.find(v => v.assigned_driver_id === driverId);
    setForm(prev => ({
      ...prev,
      driverId,
      vehicleId: assignedVehicle ? assignedVehicle.id : prev.vehicleId,
    }));
  };

  const handleAddAsStopOnTrip = async (conflictingTask: DriverTask) => {
    if (!conflictingTask) return;
    try {
      const extraDesc = form.title + (form.route ? ` (${form.route})` : "");
      const newNotes = conflictingTask.notes
        ? `${conflictingTask.notes} | Extra Stop: ${extraDesc}`
        : `Extra Stop: ${extraDesc}`;
      await updateTask(conflictingTask.id, {
        notes: newNotes,
      });
      await logAuditEvent({
        action_type: "TASK_EDITED",
        status: "success",
        driver_id: conflictingTask.driverId || null,
        details: `Extra stop "${extraDesc}" appended to task "${conflictingTask.title}" by ${user?.name || "Manager"}.`,
        metadata: { managerId: user?.id, managerName: user?.name, taskId: conflictingTask.id }
      }).catch(() => {});
      toast({
        title: "Added as Stop ✓",
        description: `Added "${form.title}" as an additional stop on "${conflictingTask.title}".`,
      });
      setModal(false);
    } catch (e: any) {
      toast({ title: "Failed to add stop", description: e.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    let isOverlap = false;
    let conflictRef: DriverTask | null = null;
    if (form.driverId) {
      const avail = getDriverAvailability(form.driverId);
      if (avail?.status === "leave" && (!editing || editing.driverId !== form.driverId)) {
        toast({
          title: "Driver on Leave",
          description: `Cannot assign task: ${avail.label}`,
          variant: "destructive",
        });
        return;
      }
      if (avail?.status === "busy") {
        isOverlap = true;
        conflictRef = (avail as any).conflictingTask || null;
      }
    }
    setSaving(true);
    try {
      const v = vehicles.find(veh => veh.id === form.vehicleId);
      const d = drivers.find(dr => dr.id === form.driverId);

      if (editing) {
        await updateTask(editing.id, {
          ...form,
          dueDate: form.startDate,
        });
        await logAuditEvent({
          action_type: "TASK_EDITED",
          status: "success",
          driver_id: form.driverId || null,
          driver_name: d?.name || "Driver",
          vehicle_id: form.vehicleId || null,
          vehicle_no: v?.vehicle_no || null,
          details: `Task "${form.title}" edited by ${user?.name || "Manager"}. Scheduled for ${form.startDate} ${form.startTime || ""}.`,
          metadata: { managerId: user?.id, managerName: user?.name, taskId: editing.id }
        }).catch(() => {});
        toast({ title: "Task updated successfully" });
      } else {
        await createTask({
          ...form,
          dueDate: form.startDate,
        });
        if (isOverlap) {
          await logAuditEvent({
            action_type: "TASK_OVERLAP_CREATED",
            status: "warning",
            driver_id: form.driverId || null,
            driver_name: d?.name || "Driver",
            vehicle_id: form.vehicleId || null,
            vehicle_no: v?.vehicle_no || null,
            details: `Manager ${user?.name || "Manager"} scheduled overlapping task "${form.title}" (${form.startTime} - ${form.endTime}) for ${d?.name || "Driver"} while busy with "${conflictRef?.title || "another trip"}".`,
            metadata: { managerId: user?.id, managerName: user?.name, conflictingTaskId: conflictRef?.id }
          }).catch(() => {});
          toast({ title: "Task Created (Overlap Allowed) ✓" });
        } else {
          await logAuditEvent({
            action_type: "TASK_CREATED",
            status: "success",
            driver_id: form.driverId || null,
            driver_name: d?.name || "Driver",
            vehicle_id: form.vehicleId || null,
            vehicle_no: v?.vehicle_no || null,
            details: `Task "${form.title}" created by ${user?.name || "Manager"} for ${d?.name || "Driver"}. Scheduled: ${form.startDate} ${form.startTime || ""}.`,
            metadata: { managerId: user?.id, managerName: user?.name }
          }).catch(() => {});
          toast({ title: "Task created successfully" });
        }
      }
      setModal(false);
    } catch (error: any) {
      toast({ 
        title: "Failed to save task", 
        description: error.message || "Could not save task. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  // Open Cancel Task Modal (Issue 5)
  const openCancelModal = (task: DriverTask) => {
    setCancelModal({
      open: true,
      task,
      reason: "Trip rescheduled",
      customNote: "",
      notifyWhatsApp: true,
      submitting: false,
    });
  };

  // Confirm Task Cancellation with WhatsApp and Audit Log (Issue 5)
  const handleConfirmCancel = async () => {
    if (!cancelModal.task) return;
    setCancelModal(prev => ({ ...prev, submitting: true }));
    const task = cancelModal.task;
    const driver = drivers.find(d => d.id === task.driverId);
    const cancelReasonText = cancelModal.customNote.trim()
      ? `${cancelModal.reason}: ${cancelModal.customNote.trim()}`
      : cancelModal.reason;

    try {
      await updateTask(task.id, {
        status: "cancelled",
        notes: task.notes ? `${task.notes} | Cancelled: ${cancelReasonText}` : `Cancelled: ${cancelReasonText}`
      });

      // Send WhatsApp notice to driver if enabled and driver has phone
      if (cancelModal.notifyWhatsApp && driver?.phone) {
        const dateDisplay = task.startDate || task.dueDate || "today";
        const timeDisplay = task.startTime ? ` at ${task.startTime}` : "";
        const msg = `*Task Cancelled*\n\nYour task *"${task.title}"* scheduled for ${dateDisplay}${timeDisplay} has been cancelled.\n*Reason:* ${cancelReasonText}`;
        sendWhatsAppMessage(driver.phone, msg);
      }

      // Log audit event with manager attribution (Fix 10 / P4)
      await logAuditEvent({
        action_type: "task_cancelled",
        status: "warning",
        driver_id: task.driverId,
        driver_name: driver?.name,
        details: `Task "${task.title}" cancelled by Manager ${user?.name || "Manager"}. Reason: ${cancelReasonText}`,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          driverId: task.driverId,
          driverName: driver?.name,
          cancelledBy: user?.name || "Manager",
          managerId: user?.id,
          reason: cancelReasonText
        }
      });

      toast({
        title: "Task Cancelled",
        description: `Task marked as cancelled${cancelModal.notifyWhatsApp && driver?.phone ? " & driver notified via WhatsApp" : ""}.`
      });
      setCancelModal({
        open: false,
        task: null,
        reason: "Trip rescheduled",
        customNote: "",
        notifyWhatsApp: true,
        submitting: false
      });
    } catch (err: any) {
      toast({
        title: "Cancellation Failed",
        description: err.message || "Failed to cancel task",
        variant: "destructive"
      });
      setCancelModal(prev => ({ ...prev, submitting: false }));
    }
  };

  const isTaskLate = (t: DriverTask) => {
    if (t.status === "done" || t.status === "cancelled" || t.status === "unfinished") return false;
    if (!t.endTime) return false;
    const taskEndDay = t.endDate || t.startDate || t.dueDate;
    if (!taskEndDay) return false;

    try {
      const endDateTime = parseISO(`${taskEndDay}T${t.endTime}:00`);
      return isAfter(new Date(), endDateTime);
    } catch {
      return false;
    }
  };

  // Strictly filter "today": checks startDate or dueDate matching todayStr
  const isTaskScheduledToday = (t: DriverTask) => {
    const sDate = t.startDate || t.dueDate;
    return sDate === todayStr;
  };

  // Unfinished task detection: explicitly marked "unfinished", or past date/schedule and not completed
  const isTaskUnfinished = (t: DriverTask) => {
    if (t.status === "done") return false;
    if (t.status === "cancelled") return false;
    if (t.status === "unfinished") return true;
    const taskEndDay = t.endDate || t.startDate || t.dueDate;
    if (!taskEndDay) return false;
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

  // Base list filtered by Row 1 ("today" vs "all")
  const baseTasks = useMemo(() => {
    if (row1Filter === "today") {
      return tasks.filter(isTaskScheduledToday);
    }
    return tasks;
  }, [tasks, row1Filter, todayStr]);

  // Dynamic counts for Row 2: Unfinished and Cancelled always count across all tasks when Today is selected so past unfinished/cancelled tasks never read 0
  const row2Counts = useMemo(() => {
    return {
      all: baseTasks.length,
      pending: baseTasks.filter(t => t.status === "pending").length,
      in_progress: baseTasks.filter(t => t.status === "in_progress").length,
      done: baseTasks.filter(t => t.status === "done").length,
      unfinished: tasks.filter(isTaskUnfinished).length,
      cancelled: tasks.filter(t => t.status === "cancelled").length,
    };
  }, [baseTasks, tasks, todayStr]);

  // Filter tasks by Row 2, Driver, Vehicle and sort
  const filteredAndSorted = useMemo(() => {
    const pool = (row2Filter === "unfinished" || row2Filter === "cancelled") ? tasks : baseTasks;
    let result = pool.filter(t => {
      // Row 2 Status filter
      if (row2Filter === "pending" && t.status !== "pending") return false;
      if (row2Filter === "in_progress" && t.status !== "in_progress") return false;
      if (row2Filter === "done" && t.status !== "done") return false;
      if (row2Filter === "cancelled" && t.status !== "cancelled") return false;
      if (row2Filter === "unfinished" && !isTaskUnfinished(t)) return false;

      // Driver filter
      if (filterDriver !== "all" && t.driverId !== filterDriver) return false;
      // Vehicle filter
      if (filterVehicle !== "all" && t.vehicleId !== filterVehicle) return false;
      return true;
    });

    // Sorting
    return [...result].sort((a, b) => {
      if (sortMode === "start_time") {
        const dateA = a.startDate || a.dueDate || "9999-99-99";
        const dateB = b.startDate || b.dueDate || "9999-99-99";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        const timeA = a.startTime ? timeStringToMinutes(a.startTime) : 9999;
        const timeB = b.startTime ? timeStringToMinutes(b.startTime) : 9999;
        return timeA - timeB;
      }
      if (sortMode === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortMode === "driver") {
        const dA = drivers.find(d => d.id === a.driverId)?.name || "zzz";
        const dB = drivers.find(d => d.id === b.driverId)?.name || "zzz";
        return dA.localeCompare(dB);
      }
      if (sortMode === "vehicle") {
        const vA = vehicles.find(v => v.id === a.vehicleId)?.vehicle_no || "zzz";
        const vB = vehicles.find(v => v.id === b.vehicleId)?.vehicle_no || "zzz";
        return vA.localeCompare(vB);
      }
      if (sortMode === "status") {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });
  }, [baseTasks, tasks, row2Filter, filterDriver, filterVehicle, sortMode, drivers, vehicles, todayStr]);

  // Drivers sorted: Tropical drivers first, Centres drivers second (or filtered to Tropical only unless All selected)
  const sortedDriversForModal = useMemo(() => {
    return [...drivers]
      .filter(d => {
        if (d.role && d.role !== "driver") return false;
        if (driverGroupFilter === "Tropical" && d.id !== form.driverId) {
          return (d.group || "Tropical") === "Tropical";
        }
        return true;
      })
      .sort((a, b) => {
        const aGroup = a.group === "Tropical" ? 0 : 1;
        const bGroup = b.group === "Tropical" ? 0 : 1;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [drivers, driverGroupFilter, form.driverId]);

  // Driver availability check based on shift hours, leave, and schedule overlap (A10, O1)
  const getDriverAvailability = (driverId: string) => {
    if (!driverId) return null;
    const targetDate = form.startDate || todayStr;
    const shiftInfo = getDriverShiftForDate
      ? getDriverShiftForDate(driverId, targetDate)
      : (shifts?.[driverId]?.shift || "8:00 AM - 5:00 PM");
    const shiftParsed = parseShiftRangeMinutes(shiftInfo);

    if (shiftParsed.isOff) {
      return { status: "leave", label: `On leave / Off (${shiftInfo})`, isAvailable: false, color: "text-red-400" };
    }

    const taskStartMins = timeStringToMinutes(form.startTime);
    const taskEndMins = timeStringToMinutes(form.endTime);

    // Check if task time falls outside the driver's shift window on the same day
    if (
      form.startDate === form.endDate &&
      shiftParsed.startMins !== null &&
      shiftParsed.endMins !== null &&
      (taskStartMins < shiftParsed.startMins || taskEndMins > shiftParsed.endMins)
    ) {
      return {
        status: "off_shift",
        label: `Off shift (Shift: ${shiftInfo})`,
        isAvailable: false,
        color: "text-red-400",
      };
    }

    const conflictingTask = tasks.find(t => {
      if (t.driverId !== driverId) return false;
      if (editing && t.id === editing.id) return false;
      if (t.status === "cancelled" || t.status === "done" || t.status === "unfinished") return false;
      const tDate = t.startDate || t.dueDate;
      if (tDate !== targetDate) return false;
      if (!t.startTime || !t.endTime) return false;
      const tStart = timeStringToMinutes(t.startTime);
      const tEnd = timeStringToMinutes(t.endTime);
      return taskStartMins < tEnd && taskEndMins > tStart;
    });

    if (conflictingTask) {
      return {
        status: "busy",
        label: `Busy (${conflictingTask.startTime || ""} - ${conflictingTask.endTime || ""}: ${conflictingTask.title})`,
        isAvailable: false,
        color: "text-amber-400",
        conflictingTask,
      };
    }

    if (shiftInfo) {
      return { status: "available", label: `Available (Shift: ${shiftInfo})`, isAvailable: true, color: "text-emerald-400" };
    }

    return { status: "available", label: "Available", isAvailable: true, color: "text-emerald-400" };
  };

  // Drivers available for quick reassignment (Change 6: free now, Tropical first)
  const availableReassignDrivers = useMemo(() => {
    return drivers.filter(d => {
      if (d.role !== "driver") return false;
      const shift = shifts?.[d.id]?.shift || "";
      if (shift === "Leave" || shift.toLowerCase().includes("leave") || shift.toLowerCase() === "off") return false;
      const isBusy = tasks.some(t => t.driverId === d.id && t.status === "in_progress");
      return !isBusy;
    }).sort((a, b) => {
      const aGrp = a.group === "Tropical" ? 0 : 1;
      const bGrp = b.group === "Tropical" ? 0 : 1;
      if (aGrp !== bGrp) return aGrp - bGrp;
      return a.name.localeCompare(b.name);
    });
  }, [drivers, shifts, tasks]);

  // 1-Tap "Do it today" on an unfinished task (Fix 4)
  const handleDoItToday = async (task: DriverTask) => {
    const cur = new Date();
    const nextStart = format(cur, "HH:mm");
    const nextEnd = format(addHours(cur, 1), "HH:mm");
    try {
      await createTask({
        title: task.title,
        description: task.description || "",
        driverId: task.driverId || "",
        vehicleId: task.vehicleId || "",
        priority: task.priority,
        status: "pending",
        startDate: todayStr,
        startTime: task.startTime || nextStart,
        endDate: todayStr,
        endTime: task.endTime || nextEnd,
        dueDate: todayStr,
        route: task.route || "",
        notes: task.notes ? `${task.notes} | Copied from ${task.startDate || task.dueDate}` : `Copied from ${task.startDate || task.dueDate}`,
        photoRequired: task.photoRequired ?? false,
      });
      await updateTask(task.id, {
        status: "done",
        notes: task.notes ? `${task.notes} | Rescheduled to today (${todayStr})` : `Rescheduled to today (${todayStr})`,
      });
      await logAuditEvent({
        action_type: "TASK_RESCHEDULED_TODAY",
        status: "success",
        driver_id: task.driverId,
        details: `Unfinished task "${task.title}" copied to today (${todayStr}) and original closed.`,
      });
      toast({
        title: "Scheduled for Today",
        description: `"${task.title}" copied to today's active tasks and old item closed.`,
      });
    } catch (err: any) {
      toast({ title: "Failed to reschedule", description: err.message, variant: "destructive" });
    }
  };

  // 1-Tap "Close" on an unfinished task (Fix 4)
  const handleCloseUnfinished = async (task: DriverTask) => {
    try {
      await updateTask(task.id, {
        status: "cancelled",
        notes: task.notes ? `${task.notes} | Closed by manager` : "Closed by manager",
      });
      await logAuditEvent({
        action_type: "TASK_UNFINISHED_CLOSED",
        status: "warning",
        driver_id: task.driverId,
        details: `Unfinished task "${task.title}" closed by manager.`,
      });
      toast({
        title: "Unfinished Task Closed",
        description: `"${task.title}" marked as closed.`,
      });
    } catch (err: any) {
      toast({ title: "Failed to close task", description: err.message, variant: "destructive" });
    }
  };

  // Quick 1-tap reassign for emergency-ended or unfinished tasks (Page 12 Mockup & Fix 4)
  const handleQuickReassign = async (task: DriverTask, newDriverId: string) => {
    if (!newDriverId) {
      toast({ title: "Please pick a driver", variant: "destructive" });
      return;
    }
    const targetDriver = drivers.find(d => d.id === newDriverId);
    if (!targetDriver) return;
    const targetVeh = vehicles.find(v => v.assigned_driver_id === newDriverId);
    const vehicleId = targetVeh ? targetVeh.id : (task.vehicleId || null);

    // Clean description removing [NEEDS NEW DRIVER...] prefix
    const cleanedDesc = (task.description || "").replace(/⚠️\s*\[NEEDS NEW DRIVER:[^\]]*\]/g, "").trim();

    try {
      await updateTask(task.id, {
        driverId: newDriverId,
        vehicleId: vehicleId || undefined,
        status: "pending",
        startDate: todayStr,
        endDate: todayStr,
        dueDate: todayStr,
        description: cleanedDesc,
      });

      await logAuditEvent({
        driver_id: newDriverId,
        driver_name: targetDriver.name,
        vehicle_id: vehicleId || undefined,
        vehicle_no: targetVeh?.vehicle_no || undefined,
        action_type: "TASK_REASSIGN",
        status: "success",
        details: `Manager reassigned task "${task.title}" to ${targetDriver.name} for today.`,
      });

      if (targetDriver.phone) {
        const msg = `*New Assigned Task (Reassigned)*\n\nTask: *${task.title}*\nRoute: ${task.route || "Local"}\nWhen: ${task.startTime || "Today"}\nVehicle: ${targetVeh?.vehicle_no || "Assigned"}\n\nPlease check your FleetOps app.`;
        sendWhatsAppMessage(targetDriver.phone, msg);
      }

      toast({
        title: "Task Reassigned",
        description: `Task reassigned to ${targetDriver.name}. WhatsApp alert sent.`,
      });
    } catch (err: any) {
      toast({ title: "Failed to reassign", description: err.message, variant: "destructive" });
    }
  };

  const formatScheduleRange = (t: DriverTask) => {
    const sDate = t.startDate || t.dueDate;
    const eDate = t.endDate || sDate;
    const sTime = t.startTime || "";
    const eTime = t.endTime || "";

    if (sDate && eDate && sDate !== eDate) {
      try {
        const d1 = format(parseISO(sDate), "EEE d MMM");
        const d2 = format(parseISO(eDate), "EEE d MMM");
        return `${d1} ${sTime} → ${d2} ${eTime}`;
      } catch {
        return `${sDate} ${sTime} → ${eDate} ${eTime}`;
      }
    }

    try {
      const d1 = sDate ? format(parseISO(sDate), "dd-MM-yyyy") : "";
      return `${d1} ${sTime ? sTime + (eTime ? ` - ${eTime}` : "") : ""}`;
    } catch {
      return `${sDate || ""} ${sTime} - ${eTime}`;
    }
  };

  const getElapsedTimeText = (t: DriverTask) => {
    if (!t.startedAt) return null;
    try {
      const start = parseISO(t.startedAt);
      const end = t.finishedAt ? parseISO(t.finishedAt) : new Date();
      const diffMins = Math.round((end.getTime() - start.getTime()) / 60000);
      const startTimeFormatted = format(start, "h:mm a");
      if (t.finishedAt) {
        const endTimeFormatted = format(parseISO(t.finishedAt), "h:mm a");
        return `Started ${startTimeFormatted} · Finished ${endTimeFormatted} · ${diffMins} min`;
      }
      return `Started ${startTimeFormatted} · In progress (${diffMins}m)`;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground">Tasks & Schedule</p>
          <p className="text-xs text-muted-foreground">Manage and track driver assignments</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-xs px-3.5 py-2 rounded-xl self-start sm:self-auto hover:opacity-90 transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> New Task
        </button>
      </div>

      {/* Two-Row Filter & Sort Controls (Change 3 & Issue 6) */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        {/* Row 1: Timeframe Scope (Today | All tasks) */}
        <div className="flex items-center gap-2 pb-2.5 border-b border-border/40">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Time:</span>
          {(["today", "all"] as const).map(scope => (
            <button
              key={scope}
              onClick={() => handleRow1Change(scope)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                row1Filter === scope
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              {scope === "today" ? "Today" : "All tasks"}
            </button>
          ))}
        </div>

        {/* Row 2: Status Pills with Dynamic Counts relative to Row 1 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(["all", "pending", "in_progress", "done", "unfinished", "cancelled"] as const).map(s => {
            const count = row2Counts[s] || 0;
            const label =
              s === "all" ? "All" :
              s === "in_progress" ? "In Progress" :
              s === "unfinished" ? "Unfinished" :
              s.charAt(0).toUpperCase() + s.slice(1);
            return (
              <button
                key={s}
                onClick={() => handleRow2Change(s)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                  row2Filter === s
                    ? "bg-foreground text-background border-foreground font-bold shadow-sm"
                    : "border-border text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                <span>{label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  row2Filter === s ? "bg-background/20 text-background font-bold" : "bg-secondary text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dropdowns for Driver, Vehicle & Sort Menu */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border/50 text-xs">
          {/* Driver filter */}
          <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2 py-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={filterDriver}
              onChange={e => setFilterDriver(e.target.value)}
              className="bg-transparent text-foreground w-full focus:outline-none"
            >
              <option value="all">All Drivers</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Vehicle filter */}
          <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2 py-1.5">
            <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={filterVehicle}
              onChange={e => setFilterVehicle(e.target.value)}
              className="bg-transparent text-foreground w-full focus:outline-none"
            >
              <option value="all">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.vehicle_no}</option>
              ))}
            </select>
          </div>

          {/* Sort Menu */}
          <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2 py-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-primary shrink-0" />
            <select
              value={sortMode}
              onChange={e => handleSortChange(e.target.value as SortMode)}
              className="bg-transparent text-foreground font-medium w-full focus:outline-none"
            >
              <option value="start_time">Sort: Start time (earliest first)</option>
              <option value="newest">Sort: Newest added</option>
              <option value="driver">Sort: Driver name</option>
              <option value="vehicle">Sort: Vehicle number</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task list */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card/40 border border-border rounded-xl">
          <Route className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tasks match the selected filters</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredAndSorted.map(task => {
            const driver = drivers.find(d => d.id === task.driverId);
            const vehicle = vehicles.find(v => v.id === task.vehicleId);
            const late = isTaskLate(task);
            const unfinished = isTaskUnfinished(task);
            const isCancelled = task.status === "cancelled";
            const elapsedTimeStr = getElapsedTimeText(task);

            return (
              <div
                key={task.id}
                className={`bg-card border rounded-xl p-3.5 transition-all ${
                  isCancelled
                    ? "opacity-75 border-zinc-700/60 bg-zinc-900/30"
                    : late || unfinished
                    ? "border-red-500/50 bg-red-500/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className={`text-sm font-bold leading-snug ${isCancelled ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {task.title}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                      {isCancelled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-500/30 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Cancelled
                        </span>
                      )}
                      {!isCancelled && late && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Late
                        </span>
                      )}
                      {!isCancelled && unfinished && !late && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Unfinished
                        </span>
                      )}
                      {task.photoRequired && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center gap-1">
                          <Camera className="w-2.5 h-2.5" /> Photo Required
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-muted-foreground mb-1.5">{task.description}</p>
                    )}

                    {task.route && (
                      <p className="text-xs text-primary flex items-center gap-1 mb-1 font-medium">
                        <Route className="w-3 h-3 shrink-0" />
                        <span>{task.route}</span>
                      </p>
                    )}

                    {/* Elapsed Time / Start Time */}
                    {elapsedTimeStr && (
                      <p className="text-xs text-blue-400 font-medium mb-1">
                        {elapsedTimeStr}
                      </p>
                    )}

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono font-medium text-foreground bg-secondary/50 px-2 py-0.5 rounded">
                        <Clock className="w-3 h-3 text-primary" />
                        {formatScheduleRange(task)}
                      </span>
                      {driver && (
                        <span className="flex items-center gap-1 text-foreground">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          {driver.name}
                        </span>
                      )}
                      {vehicle && (
                        <span className="flex items-center gap-1 text-foreground">
                          <Car className="w-3 h-3 text-muted-foreground" />
                          {vehicle.vehicle_no}
                        </span>
                      )}
                    </div>

                    {/* Cancellation reason note */}
                    {task.notes && task.notes.includes("Cancelled:") && (
                      <p className="mt-2 text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-2.5 py-1 inline-block">
                        {task.notes}
                      </p>
                    )}

                    {/* When a driver ends a task early OR task is Unfinished (Fix 4 & Page 12 Mockup) */}
                    {(task.description?.includes("NEEDS NEW DRIVER") || (unfinished && !isCancelled)) && (
                      <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            {task.description?.includes("NEEDS NEW DRIVER") ? "Needs new driver" : "Unfinished"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {task.description?.includes("NEEDS NEW DRIVER")
                              ? "Ended early · Leave sent to Admin"
                              : `Scheduled ${task.startDate || task.dueDate || "earlier"} · Not finished`}
                          </span>
                        </div>

                        {/* 3 Quick 1-Tap Action Buttons for Unfinished Tasks (Fix 4 Mockup) */}
                        {unfinished && !isCancelled && (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleDoItToday(task)}
                              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                            >
                              Do it today
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCloseUnfinished(task)}
                              className="bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                            >
                              Close
                            </button>
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide shrink-0">
                            Reassign to (free now):
                          </span>
                          <div className="flex items-center gap-2 flex-1">
                            <select
                              id={`quick-reassign-${task.id}`}
                              defaultValue={availableReassignDrivers[0]?.id || ""}
                              className="flex-1 bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {availableReassignDrivers.map(d => {
                                const v = vehicles.find(veh => veh.assigned_driver_id === d.id);
                                return (
                                  <option key={d.id} value={d.id}>
                                    {d.name} {v ? `· ${v.vehicle_no}` : ""}
                                  </option>
                                );
                              })}
                            </select>
                            <button
                              onClick={() => {
                                const el = document.getElementById(`quick-reassign-${task.id}`) as HTMLSelectElement;
                                if (el && el.value) {
                                  handleQuickReassign(task, el.value);
                                }
                              }}
                              className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-sm shrink-0"
                            >
                              Reassign
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions (Pencil for edit, Cancel task button) */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(task)}
                      className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
                      title="Edit task"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {!isCancelled ? (
                      <button
                        onClick={() => openCancelModal(task)}
                        className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                        title="Cancel task"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDel({ open: true, id: task.id, name: task.title })}
                        className="p-1.5 hover:bg-destructive/10 text-zinc-500 hover:text-destructive rounded-lg transition-colors"
                        title="Delete task record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Status Bar */}
                <div className="flex gap-1.5 mt-3 pt-2 border-t border-border/40">
                  {(["pending", "in_progress", "done"] as TaskStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(task.id, s)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg border transition-all ${
                        task.status === s
                          ? STATUS_COLORS[s]
                          : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                  {isCancelled && (
                    <button
                      onClick={() => updateStatus(task.id, "pending")}
                      className="px-2.5 text-[11px] font-bold py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-all"
                      title="Reopen task"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Task Modal (Issue 5) */}
      {cancelModal.open && cancelModal.task && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-destructive font-bold">
              <Ban className="w-5 h-5" />
              <h3 className="text-base text-foreground">Cancel Task</h3>
            </div>
            
            <p className="text-xs text-muted-foreground">
              Are you sure you want to cancel &ldquo;<span className="text-foreground font-semibold">{cancelModal.task.title}</span>&rdquo;? The task will remain in records as cancelled.
            </p>

            {/* Cancellation Reason Dropdown */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Cancellation Reason *
              </label>
              <select
                value={cancelModal.reason}
                onChange={e => setCancelModal(f => ({ ...f, reason: e.target.value }))}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Trip rescheduled">Trip rescheduled</option>
                <option value="Driver unavailable / On leave">Driver unavailable / On leave</option>
                <option value="Vehicle breakdown / Maintenance">Vehicle breakdown / Maintenance</option>
                <option value="Client cancelled">Client cancelled</option>
                <option value="Weather / Road closure">Weather / Road closure</option>
                <option value="Emergency / Other">Emergency / Other</option>
              </select>
            </div>

            {/* Custom Notes */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Additional Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Moved to tomorrow 9 AM"
                value={cancelModal.customNote}
                onChange={e => setCancelModal(f => ({ ...f, customNote: e.target.value }))}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* WhatsApp notification toggle */}
            <div className="bg-secondary/30 border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-foreground">Notify Driver via WhatsApp</p>
                <p className="text-[11px] text-muted-foreground">
                  Send immediate cancellation alert to driver
                </p>
              </div>
              <input
                type="checkbox"
                checked={cancelModal.notifyWhatsApp}
                onChange={e => setCancelModal(f => ({ ...f, notifyWhatsApp: e.target.checked }))}
                className="w-4 h-4 rounded text-primary focus:ring-primary"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={cancelModal.submitting}
                onClick={() => setCancelModal({ open: false, task: null, reason: "Trip rescheduled", customNote: "", notifyWhatsApp: true, submitting: false })}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                Keep Task
              </button>
              <button
                type="button"
                disabled={cancelModal.submitting}
                onClick={handleConfirmCancel}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm hover:opacity-90 transition-opacity"
              >
                {cancelModal.submitting ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation (Retained for purging old/cancelled tasks) */}
      {confirmDel.open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-foreground">Delete Task Record</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete task &ldquo;{confirmDel.name}&rdquo;?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDel({ open: false, id: "", name: "" })}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteTask(confirmDel.id);
                  setConfirmDel({ open: false, id: "", name: "" });
                  toast({ title: "Task deleted" });
                }}
                className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Task Modal (Issues 1, 8, Change 3) */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">{editing ? "Edit Task" : "New Task"}</h3>
              <button onClick={() => setModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="overflow-y-auto p-4 space-y-3.5 flex-1">
              {/* Task Title */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vavuniya shipment / Collect ice Pitipana"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Route */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Route (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Colombo → Vavuniya"
                  value={form.route}
                  onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Dates & Times */}
              <div className="bg-secondary/20 border border-border rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between mb-1">
                      <span>Start Date *</span>
                      {form.startDate && (
                        <span className="text-[10px] font-mono text-primary normal-case">
                          {(() => { try { return format(parseISO(form.startDate), "dd-MM-yyyy"); } catch { return form.startDate; } })()}
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between mb-1">
                      <span>End Date *</span>
                      {form.endDate && (
                        <span className="text-[10px] font-mono text-primary normal-case">
                          {(() => { try { return format(parseISO(form.endDate), "dd-MM-yyyy"); } catch { return form.endDate; } })()}
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      End Time *
                    </label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Format: Day-Month-Year (dd-MM-yyyy). Overnight trips automatically calculate across dates.
                </p>
              </div>

              {/* Driver & Vehicle (Change 3: Tropical first, availability status, auto-fill vehicle) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Assign Driver
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDriverGroupFilter("Tropical")}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          driverGroupFilter === "Tropical"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        Tropical only
                      </button>
                      <button
                        type="button"
                        onClick={() => setDriverGroupFilter("All")}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          driverGroupFilter === "All"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        All groups
                      </button>
                    </div>
                  </div>
                  <select
                    value={form.driverId}
                    onChange={e => handleDriverChange(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">- Unassigned -</option>
                    {sortedDriversForModal.map(d => {
                      const avail = getDriverAvailability(d.id);
                      const groupTag = d.group ? `[${d.group}] ` : "";
                      const statusTag = avail ? ` • ${avail.label}` : "";
                      const isDisabled = avail ? (avail.status === "leave" && d.id !== form.driverId) : false;
                      return (
                        <option key={d.id} value={d.id} disabled={isDisabled}>
                          {groupTag}{d.name}{statusTag}
                        </option>
                      );
                    })}
                  </select>

                  {/* Driver availability indicator badge & overlap resolution (Fix 7 / P8 / A10) */}
                  {form.driverId && (() => {
                    const avail = getDriverAvailability(form.driverId);
                    if (!avail) return null;
                    const conflictTask = (avail as any).conflictingTask as DriverTask | undefined;
                    return (
                      <div className="space-y-2 mt-1.5">
                        <div className={`text-[11px] font-medium flex items-center gap-1.5 ${avail.color}`}>
                          <span className={`w-2 h-2 rounded-full ${avail.isAvailable ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                          <span>{avail.label}</span>
                        </div>
                        {avail.status === "busy" && conflictTask && (
                          <div className="p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2 text-xs">
                            <p className="text-amber-200 font-medium">
                              ⚠️ Driver has another task: <strong>"{conflictTask.title}"</strong> ({conflictTask.startTime} – {conflictTask.endTime}).
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleAddAsStopOnTrip(conflictTask)}
                                className="bg-amber-600 hover:bg-amber-500 active:scale-95 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-sm"
                              >
                                Add as a stop on this trip
                              </button>
                              <span className="text-[11px] text-amber-300">
                                or click Save below to Add anyway (overlap)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Assign Vehicle (Auto-fills for Driver)
                  </label>
                  <select
                    value={form.vehicleId}
                    onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">- No vehicle -</option>
                    {vehicles.filter(v => !(v as any).is_hidden).map(v => (
                      <option key={v.id} value={v.id}>{v.vehicle_no} - {v.model}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority & Photo Needed Switch */}
              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Photo Needed to Finish?
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, photoRequired: false }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        !form.photoRequired
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, photoRequired: true }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        form.photoRequired
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      Yes
                    </button>
                  </div>
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional cargo or client instructions..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <button
                onClick={() => setModal(false)}
                className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-sm hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 cursor-pointer transition-opacity flex items-center justify-center gap-1.5"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
