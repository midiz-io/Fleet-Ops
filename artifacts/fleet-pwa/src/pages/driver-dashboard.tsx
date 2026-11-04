import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { notifyManagers } from "@/lib/whatsapp";
import {
  useVehiclesByDriver,
  useVehicles,
  useUpdateVehicle,
  VehicleWithFuelType,
  getDriverDailyVehicleId,
  setDriverDailyVehicleId,
  getTodaySriLankaDate,
} from "@/hooks/use-vehicles";
import { useDriverChecklists, useChecklists, useCreateChecklist } from "@/hooks/use-checklists";
import { useDriverRepairs } from "@/hooks/use-repairs";
import { useDriverFuelLogs } from "@/hooks/use-fuel";
import { useTasks, DriverTask, timeStringToMinutes } from "@/hooks/use-tasks";
import { useShifts } from "@/hooks/use-shifts";
import { useDrivers } from "@/hooks/use-drivers";
import { useVehicleWashing } from "@/hooks/use-washing";
import { useOvertime } from "@/hooks/use-overtime";
import { useEndDays } from "@/hooks/use-end-days";
import { uploadImage } from "@/lib/image-upload";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { logAuditEvent } from "@/lib/audit-logger";
import { useGateClearance } from "@/hooks/use-gate-clearance";
import { supabase } from "@/lib/supabase";
import { 
  ClipboardCheck, Fuel, Wrench, Car, AlertTriangle, CheckCircle, Clock, 
  TrendingDown, ListTodo, Camera, CheckSquare, Route, ExternalLink, Lock, 
  ShieldCheck, Sparkles, BellRing, RefreshCw, Gauge, ArrowRight,
  Calendar, CalendarDays, ChevronLeft, ChevronRight, Palmtree, Sun, Moon
} from "lucide-react";
import { 
  format, isToday, differenceInDays, parseISO, differenceInMinutes,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, addMonths, subMonths
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { VehicleSwitchModal } from "@/components/vehicle-switch-modal";
import {
  triggerTaskRing,
  requestNotificationPermission,
  getNotificationPermissionStatus,
  playPhoneRingChime,
  registerPushSubscription,
  PushPermissionStatus,
} from "@/lib/web-push-manager";

// Complete Audio notification, Vibration & Service Worker Push Ring (Change 6)
const playTaskRing = (title: string, body: string) => {
  triggerTaskRing(title, body, "/");
};

// Backward-compatible alias
const playTaskBeep = () => playTaskRing("FleetOps Task Alert", "New task assigned");

function ExpiryBadge({ label, date }: { label: string; date: string | null }) {
  if (!date) return null;
  const days = differenceInDays(parseISO(date), new Date());
  if (days > 60) return null;
  const color = days < 30 ? "text-red-400 bg-red-400/10 border-red-400/30" : "text-amber-400 bg-amber-400/10 border-amber-400/30";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${color}`}>
      <AlertTriangle className="w-3.5 h-3.5" />
      {label} {days < 0 ? "expired" : `expires in ${days}d`}
    </div>
  );
}

export function DriverDashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const { getVehicleGateStatus } = useGateClearance();
  const { data: vehiclesByDriver, isLoading: vLoading } = useVehiclesByDriver(user?.id ?? null);
  const { data: allVehicles } = useVehicles();
  const { data: allDrivers } = useDrivers();
  const updateVehicle = useUpdateVehicle();
  const { data: checklists } = useDriverChecklists(user?.id ?? null);
  const { data: allChecklists } = useChecklists();
  const { data: repairs } = useDriverRepairs(user?.id ?? null);
  const { data: fuelLogs } = useDriverFuelLogs(user?.id ?? null);
  const { tasks, updateStatus, updateTask } = useTasks(user?.id ?? null);
  const { shifts, calendarShifts, getDriverShiftForDate } = useShifts();
  const { recordOvertime } = useOvertime();
  const { submitEndDay, getDriverTodayEndDay } = useEndDays();
  const createChecklist = useCreateChecklist();
  const { toast } = useToast();

  // Driver "My Month Calendar" state
  const [showDriverCalendarModal, setShowDriverCalendarModal] = useState(false);
  const [driverCalendarMonth, setDriverCalendarMonth] = useState<Date>(new Date());

  const driverCalendarDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(driverCalendarMonth);
      const monthEnd = endOfMonth(monthStart);
      const startDate = startOfWeek(monthStart);
      const endDate = endOfWeek(monthEnd);
      return eachDayOfInterval({ start: startDate, end: endDate });
    } catch {
      return [];
    }
  }, [driverCalendarMonth]);

  // Notification permission state (Change 6: Page 11-12)
  const [pushPermission, setPushPermission] = useState<PushPermissionStatus>(() => getNotificationPermissionStatus());

  // Request browser notification permission once on mount or register subscription if already granted
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const status = getNotificationPermissionStatus();
      setPushPermission(status);
      if (status === "granted" && user?.id) {
        registerPushSubscription(user.id, user.name);
      }
    }
  }, [user]);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    const updatedStatus = getNotificationPermissionStatus();
    setPushPermission(updatedStatus);
    if (granted) {
      if (user?.id) {
        await registerPushSubscription(user.id, user.name);
      }
      toast({
        title: "Phone Notifications Active ✓",
        description: "FleetOps will now ring and vibrate your phone for new and cancelled tasks.",
      });
    } else {
      toast({
        title: "Notification Permission",
        description: "You can enable notifications anytime in your phone browser site settings.",
        variant: "destructive",
      });
    }
  };

  // Monitor tasks for new and cancelled tasks to ring & vibrate (Change 6)
  const prevTasksRef = useRef<DriverTask[]>(tasks);
  useEffect(() => {
    if (!prevTasksRef.current || prevTasksRef.current.length === 0) {
      prevTasksRef.current = tasks;
      return;
    }
    const prevMap = new Map(prevTasksRef.current.map(t => [t.id, t]));
    for (const task of tasks) {
      const prev = prevMap.get(task.id);
      if (!prev) {
        // Brand new task assigned to driver
        playTaskRing("New Task Assigned 🚗", `Task: ${task.title}${task.route ? ` (${task.route})` : ""}`);
        toast({ title: "New Task Assigned", description: task.title });
        break;
      } else if (prev.status !== "cancelled" && task.status === "cancelled") {
        // Task was cancelled by manager
        playTaskRing("Task Cancelled ⚠️", `Task "${task.title}" was cancelled by manager.`);
        toast({ title: "Task Cancelled", description: task.title, variant: "destructive" });
        break;
      }
    }
    prevTasksRef.current = tasks;
  }, [tasks, toast]);

  const todayStr = getTodaySriLankaDate();

  // Shared One-Vehicle-for-the-Day state (Fix 1 / A4 / O2 / O8)
  const [switchedVehicleId, setSwitchedVehicleId] = useState<string | null>(() => {
    if (typeof window !== "undefined" && user?.id) {
      return getDriverDailyVehicleId(user.id, null, null) || null;
    }
    return null;
  });

  // Morning vehicle picker state (Page 7)
  const [morningVehicleId, setMorningVehicleId] = useState<string>(() => {
    if (typeof window !== "undefined" && user?.id) {
      return getDriverDailyVehicleId(user.id, null, null) || "";
    }
    return "";
  });

  useEffect(() => {
    if (!user?.id) return;
    const resolved = getDriverDailyVehicleId(user.id, allVehicles, checklists);
    if (resolved) {
      setSwitchedVehicleId(resolved);
      setMorningVehicleId(resolved);
    }
  }, [user?.id, allVehicles, checklists]);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ userId?: string; vehicleId?: string }>;
      if (custom.detail?.userId === user?.id) {
        setSwitchedVehicleId(custom.detail?.vehicleId || null);
        setMorningVehicleId(custom.detail?.vehicleId || "");
      }
    };
    window.addEventListener("fleet:daily_vehicle_changed", handler);
    return () => window.removeEventListener("fleet:daily_vehicle_changed", handler);
  }, [user?.id]);

  // Determine assigned vehicle with hierarchical fallback (Daily vehicle -> Assigned -> Active Task)
  const taskWithVehicle = useMemo(() => {
    return tasks.find(
      t => t.vehicleId && t.status !== "done" && t.status !== "cancelled" && t.status !== "unfinished"
    );
  }, [tasks]);

  const assignedVehicle: VehicleWithFuelType | undefined = useMemo(() => {
    const dailyId = switchedVehicleId || morningVehicleId;
    if (dailyId && allVehicles) {
      const found = allVehicles.find(v => v.id === dailyId);
      if (found) return found;
    }
    if (vehiclesByDriver && vehiclesByDriver.length > 0) return vehiclesByDriver[0];
    if (taskWithVehicle && allVehicles) {
      return allVehicles.find(v => v.id === taskWithVehicle.vehicleId);
    }
    return undefined;
  }, [switchedVehicleId, morningVehicleId, vehiclesByDriver, taskWithVehicle, allVehicles]);

  // Today checklist vehicle IDs for quick check & map of vehicles in use by other drivers today
  const todayChecklistVehicleIds = useMemo(() => {
    if (!allChecklists) return [];
    return allChecklists
      .filter(c => c.date === todayStr || isToday(parseISO(c.submitted_at)))
      .map(c => c.vehicle_id);
  }, [allChecklists, todayStr]);

  const inUseByOtherDriverMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!allChecklists) return map;
    for (const c of allChecklists) {
      if ((c.date === todayStr || isToday(parseISO(c.submitted_at))) && c.driver_id !== user?.id) {
        const dName = allDrivers?.find(d => d.id === c.driver_id)?.name || "Another driver";
        map[c.vehicle_id] = dName;
      }
    }
    return map;
  }, [allChecklists, allDrivers, todayStr, user?.id]);

  // Driver license expiry checking (< 30 days alert)
  const currentDriverMeta = useMemo(() => {
    return allDrivers?.find(d => d.id === user?.id);
  }, [allDrivers, user?.id]);

  const driverLicenseDays = useMemo(() => {
    if (!currentDriverMeta?.license_expiry) return null;
    return differenceInDays(parseISO(currentDriverMeta.license_expiry), new Date());
  }, [currentDriverMeta]);

  // Washing hook for active vehicle
  const { weeklyCount: washCount, logWash } = useVehicleWashing(assignedVehicle?.id);

  // Switch Vehicle modal state
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [targetSwitchVehicle, setTargetSwitchVehicle] = useState<VehicleWithFuelType | null>(null);

  // Wash photo state
  const [uploadingWash, setUploadingWash] = useState(false);
  const washInputRef = useRef<HTMLInputElement>(null);

  // End Day Modal state
  const [showEndDayModal, setShowEndDayModal] = useState(false);
  const [endDayMeter, setEndDayMeter] = useState("");
  const [endDayConfirmMeter, setEndDayConfirmMeter] = useState("");
  const [endDayBars, setEndDayBars] = useState<number>(4);
  const [endDayPhoto, setEndDayPhoto] = useState<File | null>(null);
  const [endDayPhotoPreview, setEndDayPhotoPreview] = useState<string | null>(null);
  const [isVavuniyaTrip, setIsVavuniyaTrip] = useState<boolean>(false);
  const [otReason, setOtReason] = useState<string>("");
  const [otNote, setOtNote] = useState<string>("");
  const [submittingEndDay, setSubmittingEndDay] = useState(false);

  // Emergency End Task modal state
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyTask, setEmergencyTask] = useState<DriverTask | null>(null);
  const [emergencyReason, setEmergencyReason] = useState("Sudden illness / Medical");
  const [emergencyNotes, setEmergencyNotes] = useState("");
  const [submittingEmergency, setSubmittingEmergency] = useState(false);

  // Task proof modal state
  const [taskTab, setTaskTab] = useState<"active" | "completed">("active");
  const [showEarlierUnfinished, setShowEarlierUnfinished] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [activeTask, setActiveTask] = useState<DriverTask | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const endDayInputRef = useRef<HTMLInputElement>(null);

  // Track previous tasks count for audio beep alert
  const prevActiveTasksCountRef = useRef<number | null>(null);
  const [newTasksBanner, setNewTasksBanner] = useState<string | null>(null);

  // Today's active tasks only (Fix 4 / A3 / A7 / O1: past unfinished tasks move out of Today's Active list)
  const activeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === "done" || t.status === "cancelled" || t.status === "unfinished") return false;
      const checkDate = String(t.endDate || t.startDate || t.dueDate || "").slice(0, 10);
      if (checkDate && /^\d{4}-\d{2}-\d{2}$/.test(checkDate) && checkDate < todayStr) return false;
      return true;
    });
  }, [tasks, todayStr]);

  // Earlier unfinished tasks from previous days (Fix 4 collapsible greyed section)
  const earlierUnfinishedTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (t.status === "unfinished") return true;
      const checkDate = String(t.endDate || t.startDate || t.dueDate || "").slice(0, 10);
      return Boolean(checkDate && /^\d{4}-\d{2}-\d{2}$/.test(checkDate) && checkDate < todayStr);
    });
  }, [tasks, todayStr]);

  useEffect(() => {
    if (prevActiveTasksCountRef.current !== null && activeTasks.length > prevActiveTasksCountRef.current) {
      playTaskBeep();
      const latestTask = activeTasks[0];
      setNewTasksBanner(`New Task: ${latestTask.title}`);
      toast({
        title: "New Task Assigned! 🔔",
        description: latestTask.title,
      });
      setTimeout(() => setNewTasksBanner(null), 8000);
    }
    prevActiveTasksCountRef.current = activeTasks.length;
  }, [activeTasks.length, toast]);

  const todayChecklist = checklists?.find(c => c.date === todayStr || isToday(parseISO(c.submitted_at)));
  const todayStartKm = useMemo(() => {
    const startCl = (checklists || [])
      .filter(
        c =>
          (c.date === todayStr || isToday(parseISO(c.submitted_at))) &&
          (!assignedVehicle || c.vehicle_id === assignedVehicle.id)
      )
      .sort((a, b) => new Date(a.submitted_at || a.date).getTime() - new Date(b.submitted_at || b.date).getTime())[0];
    return Number(startCl?.meter_reading || assignedVehicle?.current_km || 0);
  }, [checklists, todayStr, assignedVehicle]);
  const pendingRepairs = repairs?.filter(r => r.status === "pending") ?? [];

  // Free vehicles for morning vehicle picker (lists driver's group first, then all fleet vehicles)
  const availableFreeVehicles = useMemo(() => {
    const driverGroup = currentDriverMeta?.group || "Tropical";
    return [...(allVehicles || [])].sort((a, b) => {
      const aInGroup = (a.group || "Tropical") === driverGroup;
      const bInGroup = (b.group || "Tropical") === driverGroup;
      if (aInGroup !== bInGroup) return aInGroup ? -1 : 1;
      return a.vehicle_no.localeCompare(b.vehicle_no);
    });
  }, [allVehicles, currentDriverMeta]);

  // Unfinished tasks for today (Page 7)
  const unfinishedTasksToday = useMemo(() => {
    return activeTasks;
  }, [activeTasks]);

  // Derive overtime reason automatically from driver's latest task today (Page 8 & 9)
  const latestTaskToday = useMemo(() => {
    const todayList = tasks.filter(t => {
      const tDate = t.startDate || t.dueDate;
      return (tDate === todayStr || (!tDate && isToday(parseISO(t.createdAt)))) && t.status !== "cancelled";
    });
    return todayList[todayList.length - 1] || null;
  }, [tasks, todayStr]);

  const autoOtReason = useMemo(() => {
    if (isVavuniyaTrip) return "Vavuniya shipment / Outstation";
    if (latestTaskToday) return `${latestTaskToday.title} (your task)`;
    return "Shift extended";
  }, [isVavuniyaTrip, latestTaskToday]);

  // Current driver shift data & timing status
  const currentShift = useMemo(() => {
    if (!user?.id) return "No shift assigned";
    const fromCalendar = getDriverShiftForDate(user.id, todayStr);
    if (fromCalendar && fromCalendar !== "No shift assigned") return fromCalendar;
    const directShift = shifts?.[user.id];
    if (typeof directShift === "object" && directShift !== null) return directShift.shift;
    if (typeof directShift === "string") return directShift;
    return "No shift assigned";
  }, [user?.id, todayStr, getDriverShiftForDate, shifts]);

  const isLeave = Boolean(currentShift && (currentShift === "Leave" || currentShift.toLowerCase().includes("leave")));
  const hasAssignedShift = Boolean(currentShift && currentShift !== "No shift assigned" && currentShift.trim() !== "");

  // Shift parsing for shift timing & overtime
  const shiftTimes = useMemo(() => {
    if (!currentShift || currentShift === "No shift assigned" || isLeave) return null;
    // Format like "8:00 AM - 5:00 PM"
    const rangeMatch = currentShift.match(/(\d{1,2})[:.](\d{2})?\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2})[:.](\d{2})?\s*(am|pm)/i);
    if (rangeMatch) {
      let endH = parseInt(rangeMatch[4], 10);
      const endM = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
      const meridiem = (rangeMatch[6] || "").toLowerCase();
      if (meridiem === "pm" && endH < 12) endH += 12;
      if (meridiem === "am" && endH === 12) endH = 0;
      return { endH, endM, label: `${rangeMatch[4]}:${rangeMatch[5] || "00"} ${rangeMatch[6] || ""}`.trim() };
    }
    // Single start time like "8:00 AM" -> +9 hrs standard duty
    const singleMatch = currentShift.match(/(\d{1,2})[:.](\d{2})?\s*(am|pm)/i);
    if (singleMatch) {
      let startH = parseInt(singleMatch[1], 10);
      const startM = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
      const meridiem = (singleMatch[3] || "").toLowerCase();
      if (meridiem === "pm" && startH < 12) startH += 12;
      if (meridiem === "am" && startH === 12) startH = 0;
      const endH = (startH + 9) % 24;
      const label = `${endH > 12 ? endH - 12 : endH}:${startM < 10 ? '0' : ''}${startM} ${endH >= 12 ? 'PM' : 'AM'}`;
      return { endH, endM: startM, label };
    }
    return { endH: 17, endM: 0, label: "5:00 PM" };
  }, [currentShift, isLeave]);

  // Overtime calculation:
  // Vavuniya trip = 2h fixed
  // Normal day = (endDayTime - shiftEnd) in 30-min blocks (< 30 min = 0)
  const calculatedOt = useMemo(() => {
    if (isVavuniyaTrip) {
      return { hours: 2.0, reasonText: "Vavuniya Outstation Trip (Fixed 2.0 hrs OT)" };
    }
    if (!shiftTimes) {
      return { hours: 0, reasonText: "Normal day (0.0 hrs OT)" };
    }
    const now = new Date();
    const shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), shiftTimes.endH, shiftTimes.endM, 0);
    const diffMins = differenceInMinutes(now, shiftEnd);
    if (diffMins < 30) {
      return {
        hours: 0,
        reasonText: diffMins <= 0
          ? `Returned on or before shift end (${shiftTimes.label})`
          : `Under 30 mins late (+${diffMins}m, 0 OT)`
      };
    }
    const blocks = Math.floor(diffMins / 30);
    const otHrs = blocks * 0.5;
    return {
      hours: otHrs,
      reasonText: `+${diffMins} mins past shift end (${shiftTimes.label}) = ${otHrs.toFixed(1)} hrs OT`
    };
  }, [isVavuniyaTrip, shiftTimes]);

  const shiftTimingStatus = useMemo(() => {
    if (!currentShift || currentShift === "No shift assigned") return null;
    if (isLeave) return "On Leave Today";

    const timeMatch = currentShift.match(/(\d{1,2})[:.](\d{2})?\s*(am|pm)/i);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = (timeMatch[3] || "").toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const shiftStartMins = hour * 60 + minute;
    const diff = shiftStartMins - currentMins;

    if (diff > 0) {
      const hoursLeft = Math.floor(diff / 60);
      const minsLeft = diff % 60;
      if (hoursLeft > 0) {
        return `Starts in ${hoursLeft}h ${minsLeft > 0 ? `${minsLeft}m` : ""}`;
      }
      return `Starts in ${minsLeft} mins`;
    } else if (diff >= -540) {
      const elapsedHours = Math.floor(Math.abs(diff) / 60);
      return `On duty · ${elapsedHours}h elapsed`;
    } else {
      return "Shift ended";
    }
  }, [currentShift, isLeave]);

  // Handle vehicle switch confirmation with full audit & shared daily vehicle persistence
  const handleConfirmSwitch = async (vehicle: VehicleWithFuelType, handoverOdo: number, needsChecklist: boolean) => {
    if (!user?.id) return;
    setSwitchedVehicleId(vehicle.id);
    setMorningVehicleId(vehicle.id);
    setDriverDailyVehicleId(user.id, vehicle.id);

    await updateVehicle.mutateAsync({
      id: vehicle.id,
      updates: { 
        current_km: handoverOdo,
        assigned_driver_id: user.id 
      },
    });

    try {
      await logAuditEvent({
        driver_id: user.id,
        driver_name: user.name,
        vehicle_id: vehicle.id,
        vehicle_no: vehicle.vehicle_no,
        action_type: "VEHICLE_SWITCH",
        status: "success",
        odometer: handoverOdo,
        details: `Driver switched to vehicle ${vehicle.vehicle_no}. Hand-over reading: ${handoverOdo.toLocaleString()} km. Needs checklist: ${needsChecklist ? 'Yes' : 'No'}.`,
      });
    } catch {}

    toast({
      title: "Vehicle Switched ✓",
      description: `Now operating ${vehicle.vehicle_no}. Hand-over reading: ${Number(handoverOdo || 0).toLocaleString()} km.`,
    });

    if (needsChecklist) {
      navigate(`/checklist?vehicleId=${vehicle.id}&type=start`);
    }
  };

  // Handle emergency end of task
  const handleConfirmEmergencyEnd = async () => {
    if (!emergencyTask || !user?.id) return;
    setSubmittingEmergency(true);
    try {
      // 1. Mark task as needing new driver
      await updateTask(emergencyTask.id, {
        status: "pending",
        description: `${emergencyTask.description || ""}\n⚠️ [NEEDS NEW DRIVER: Emergency End by ${user.name} - ${emergencyReason}${emergencyNotes ? ` (${emergencyNotes})` : ""}]`.trim(),
      });

      // 2. Save emergency leave request to settings
      try {
        const { data: curLeaves } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "emergency_leave_requests")
          .maybeSingle();
        const list = (curLeaves?.value as any[]) || [];
        const newLeave = {
          id: `el-${Date.now()}`,
          driver_id: user.id,
          driver_name: user.name,
          task_id: emergencyTask.id,
          task_title: emergencyTask.title,
          reason: emergencyReason,
          notes: emergencyNotes,
          status: "pending",
          created_at: new Date().toISOString(),
        };
        await supabase
          .from("settings")
          .upsert({ key: "emergency_leave_requests", value: [newLeave, ...list] });
      } catch {}

      // 3. WhatsApp notification to managers
      notifyManagers(
        `🚨 *EMERGENCY END TASK ALERT*\n` +
        `Driver: *${user.name}*\n` +
        `Task: *${emergencyTask.title}*\n` +
        `Reason: *${emergencyReason}*\n` +
        (emergencyNotes ? `Notes: ${emergencyNotes}\n` : "") +
        `Action Required: Task marked as "Needs New Driver" for re-assignment.`
      );

      // 4. Audit Log
      try {
        await logAuditEvent({
          driver_id: user.id,
          driver_name: user.name,
          vehicle_id: assignedVehicle?.id,
          vehicle_no: assignedVehicle?.vehicle_no,
          action_type: "EMERGENCY_LEAVE",
          status: "success",
          details: `Driver ended task "${emergencyTask.title}" early due to ${emergencyReason}. Notes: ${emergencyNotes || "None"}.`,
        });
      } catch {}

      toast({
        title: "Task Ended Early",
        description: "Manager notified. Task released for reassignment.",
      });

      setShowEmergencyModal(false);
      setEmergencyTask(null);
    } catch (err: any) {
      toast({ title: "Failed to submit emergency end", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingEmergency(false);
    }
  };

  // Wash photo upload
  const handleWashPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !assignedVehicle || !user?.id) return;
    setUploadingWash(true);
    try {
      const url = await uploadImage(file);
      await logWash.mutateAsync({
        vehicleId: assignedVehicle.id,
        driverId: user.id,
        photoUrl: url,
      });
      toast({
        title: "Wash Photo Saved ✓",
        description: "Counted towards this week's 3 required washes.",
      });
    } catch (err: any) {
      toast({ title: "Failed to upload wash photo", description: err.message, variant: "destructive" });
    } finally {
      setUploadingWash(false);
      if (washInputRef.current) washInputRef.current.value = "";
    }
  };

  // Start Task with compulsory checklist check (Suggestion 7)
  const handleStartTask = (task: DriverTask) => {
    if (!todayChecklist) {
      toast({
        title: "Daily Checklist Compulsory ⚠️",
        description: "Please complete today's vehicle start checklist before beginning tasks.",
        variant: "destructive",
      });
      return;
    }
    updateStatus(task.id, "in_progress");
    toast({
      title: "Task Started",
      description: `${task.title} is now in progress.`,
    });
  };

  // Submit Task Proof (Photo optional if photoRequired is false - Issue 17 item 8)
  const handleSubmitProof = async () => {
    if (!activeTask) return;
    const isPhotoRequired = activeTask.photoRequired ?? false;
    if (isPhotoRequired && !proofFile) {
      toast({ title: "Proof photo required for this task", variant: "destructive" });
      return;
    }

    setSubmittingProof(true);
    try {
      let url: string | null = null;
      if (proofFile) {
        url = await uploadImage(proofFile);
      }
      await updateTask(activeTask.id, {
        status: "done",
        proofUrl: url || undefined,
        finishedAt: new Date().toISOString(),
      });
      toast({ title: "Task completed!", description: "Status updated to Done." });
      setShowProofModal(false);
      setActiveTask(null);
      setProofFile(null);
      setProofPreview(null);
    } catch (err: any) {
      toast({
        title: "Failed to complete task",
        description: err.message || "Error submitting proof",
        variant: "destructive",
      });
    } finally {
      setSubmittingProof(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4 pb-20">
      {/* Audio/Banner alert for new task (Suggestion 7) */}
      {newTasksBanner && (
        <div className="bg-amber-500 text-black p-3 rounded-xl shadow-lg flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold">{newTasksBanner}</span>
          </div>
          <button onClick={() => setNewTasksBanner(null)} className="text-black font-bold text-xs p-1">
            ✕
          </button>
        </div>
      )}

      {/* Driver License Expiry Alert (Amber 30-day banner / Red if expired - Fix A12) */}
      {driverLicenseDays !== null && driverLicenseDays <= 30 && (
        <div className={`border rounded-2xl p-4 flex items-center gap-3 shadow-md ${
          driverLicenseDays < 0
            ? "bg-red-500/15 border-red-500/40 text-red-200"
            : "bg-amber-500/15 border-amber-500/40 text-amber-200"
        }`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 animate-pulse ${driverLicenseDays < 0 ? "text-red-400" : "text-amber-400"}`} />
          <div className="text-xs">
            <p className={`font-bold uppercase tracking-wide ${driverLicenseDays < 0 ? "text-red-300" : "text-amber-300"}`}>
              {driverLicenseDays < 0 ? "Driving License Expired" : "Driving License Expiring Soon"}
            </p>
            <p className="mt-0.5 text-foreground/90">
              {driverLicenseDays < 0
                ? `Your driving license EXPIRED ${Math.abs(driverLicenseDays)} days ago (${format(parseISO(currentDriverMeta!.license_expiry!), "dd MMM yyyy")}). Please report to the fleet manager immediately.`
                : `Your driving license will expire in ${driverLicenseDays} days (${format(parseISO(currentDriverMeta!.license_expiry!), "dd MMM yyyy")}). Please submit renewal proof.`}
            </p>
          </div>
        </div>
      )}

      {/* Notification Ring & Vibration Banner */}
      {pushPermission === "default" && (
        <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/40 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-blue-100 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4 text-blue-400 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wider">Ring for New Tasks</p>
              <p className="text-[11px] text-blue-200/80 mt-0.5">
                Enable phone notifications so FleetOps rings and vibrates when tasks are assigned or cancelled.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => playPhoneRingChime()}
              type="button"
              className="px-2.5 py-1.5 rounded-xl border border-blue-400/30 text-blue-300 text-xs font-semibold hover:bg-blue-500/20 transition-colors"
            >
              Test Ring 🔊
            </button>
            <button
              onClick={handleEnableNotifications}
              type="button"
              className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-md transition-colors"
            >
              Allow Notifications
            </button>
          </div>
        </div>
      )}

      {/* Top Greeting */}
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          <h1 className="text-xl font-bold text-foreground mt-0.5">
            Good day, {user?.name?.split(" ")[0]}
          </h1>
        </div>
        <Link href={`/checklist?type=start&vehicleId=${morningVehicleId || assignedVehicle?.id || availableFreeVehicles[0]?.id || ""}`}>
          <button className="flex items-center gap-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-xl border border-border shrink-0 self-start sm:self-auto transition-colors">
            <ClipboardCheck className="w-3.5 h-3.5 text-primary" /> Checklist
          </button>
        </Link>
      </div>

      {/* Prominently Highlighted Standout Shift Card (Vibrant Emerald Theme) */}
      <div
        id="driver-today-shift-card"
        className={`rounded-2xl border-2 p-4 sm:p-5 shadow-xl transition-all relative overflow-hidden ${
          isLeave
            ? "bg-gradient-to-br from-amber-950/40 via-card to-card border-amber-500/50 shadow-amber-950/20 text-amber-100"
            : hasAssignedShift
            ? "bg-gradient-to-br from-emerald-950/50 via-slate-900 to-card border-emerald-500/60 shadow-emerald-950/40 text-emerald-100"
            : "bg-card border-border text-foreground"
        }`}
      >
        {/* Glow ambient background effect */}
        <div className={`absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-25 ${
          isLeave ? "bg-amber-500" : hasAssignedShift ? "bg-emerald-500" : "bg-primary"
        }`} />

        <div className="relative z-10 space-y-3.5">
          {/* Card Top Row: Date & My Month Calendar button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                isLeave
                  ? "bg-amber-500/25 text-amber-300 border-amber-500/40"
                  : hasAssignedShift
                  ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                  : "bg-secondary text-muted-foreground border-border"
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  isLeave ? "bg-amber-400" : hasAssignedShift ? "bg-emerald-400 animate-ping" : "bg-muted-foreground"
                }`} />
                Scheduled Shift · නියමිත ෂිෆ්ට් කාලය
              </span>

              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-emerald-400" />
                Today · {format(new Date(), "EEEE, dd MMMM yyyy")}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowDriverCalendarModal(true)}
              className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-3 py-1.5 rounded-xl self-start sm:self-auto transition-all shadow-sm active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>My Month Calendar</span>
            </button>
          </div>

          {/* Card Main Shift Display */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Assigned Shift for Today
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className={`text-2xl sm:text-3xl font-black font-mono tracking-tight drop-shadow-sm ${
                  isLeave
                    ? "text-amber-400"
                    : hasAssignedShift
                    ? "text-emerald-400"
                    : "text-muted-foreground font-sans text-xl"
                }`}>
                  {currentShift}
                </h2>

                {shiftTimingStatus && (
                  <span className="text-xs font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-xl shadow-inner">
                    {shiftTimingStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Inspection Status Badge */}
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-sm ${
                todayChecklist
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
              }`}>
                {todayChecklist ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" /> Start Inspection Done
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Start Inspection Pending
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Clarification note */}
          <p className="text-[11px] text-muted-foreground border-t border-border/30 pt-2 flex items-center gap-1.5">
            <span>ℹ️</span> Manager assigned schedule for {format(new Date(), "dd MMM yyyy")}. All dispatch tasks and overtime run against this schedule.
          </p>
        </div>
      </div>

      {/* Next Morning / Pick Today's Vehicle Card (Fix 1: One vehicle for the day) */}
      {!todayChecklist && (
        <div className="rounded-2xl border border-blue-500/40 bg-gradient-to-br from-blue-950/40 via-card to-card p-4 sm:p-5 space-y-3 shadow-md animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {assignedVehicle ? `Selected: ${assignedVehicle.vehicle_no}` : "No vehicle yet"}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    TODAY'S VEHICLE
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">All vehicles are un-assigned at midnight</p>
              </div>
            </div>
          </div>

          <div className="bg-secondary/50 rounded-xl p-3 border border-border space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              CHECKLIST · PICK TODAY'S VEHICLE
            </label>
            <select
              value={morningVehicleId || assignedVehicle?.id || (availableFreeVehicles[0]?.id || "")}
              onChange={e => {
                const vid = e.target.value;
                setMorningVehicleId(vid);
                setSwitchedVehicleId(vid);
                if (user?.id && vid) {
                  setDriverDailyVehicleId(user.id, vid);
                }
              }}
              className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {availableFreeVehicles.map(v => {
                const busyBy = inUseByOtherDriverMap[v.id];
                return (
                  <option key={v.id} value={v.id} disabled={Boolean(busyBy)}>
                    {v.vehicle_no} · {busyBy ? `In use (${busyBy})` : "free"} ({v.model} - {Number(v.current_km || 0).toLocaleString()} km)
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-muted-foreground">
              The vehicle you pick here becomes your vehicle for today (Home, Checklist, Fuel Log, Tasks, End Day).
            </p>
          </div>

          <Link
            href={`/checklist?type=start&vehicleId=${morningVehicleId || assignedVehicle?.id || availableFreeVehicles[0]?.id || ""}`}
            onClick={() => {
              const vid = morningVehicleId || assignedVehicle?.id || availableFreeVehicles[0]?.id || "";
              if (user?.id && vid) {
                setDriverDailyVehicleId(user.id, vid);
              }
            }}
            className="block"
          >
            <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs py-2.5 rounded-xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer">
              <ClipboardCheck className="w-4 h-4" /> Start checklist
            </button>
          </Link>
        </div>
      )}

      {/* Daily Driver Workflow Steps */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Daily Driver Workflow
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {/* Step 1: Start Checklist */}
          <div className={`rounded-xl border p-3 flex flex-col items-center justify-between text-center gap-1.5 ${
            todayChecklist ? "bg-emerald-500/10 border-emerald-500/30" : "bg-card border-border"
          }`}>
            <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Step 1</span>
            {todayChecklist ? (
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            ) : (
              <Clock className="w-6 h-6 text-amber-400" />
            )}
            <p className="font-bold text-foreground text-xs leading-tight">Checklist</p>
            {!todayChecklist ? (
              <Link
                href={`/checklist?type=start&vehicleId=${morningVehicleId || assignedVehicle?.id || availableFreeVehicles[0]?.id || ""}`}
                onClick={() => {
                  const vid = morningVehicleId || assignedVehicle?.id || availableFreeVehicles[0]?.id || "";
                  if (user?.id && vid) {
                    setDriverDailyVehicleId(user.id, vid);
                  }
                }}
                className="w-full"
              >
                <button className="w-full bg-amber-500 text-black text-[11px] font-bold py-1 rounded-lg">
                  Start
                </button>
              </Link>
            ) : (
              <span className="text-[10px] text-emerald-400 font-bold">Done ✓</span>
            )}
          </div>

          {/* Step 2: Tasks */}
          <button
            type="button"
            onClick={() => {
              setTaskTab("active");
              const el = document.getElementById("driver-assigned-tasks-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 active:scale-95 transition-all p-3 flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer"
          >
            <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Step 2</span>
            <ListTodo className="w-6 h-6 text-blue-400" />
            <p className="font-bold text-foreground text-xs leading-tight">Today's Tasks</p>
            <span className="text-[10px] text-blue-400 font-bold">
              {activeTasks.length} Active
            </span>
          </button>

          {/* Step 3: End Day */}
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 flex flex-col items-center justify-between text-center gap-1.5">
            <span className="text-[9px] font-extrabold uppercase text-muted-foreground">Step 3</span>
            <Camera className="w-6 h-6 text-purple-400" />
            <p className="font-bold text-foreground text-xs leading-tight">End Day</p>
            {getDriverTodayEndDay(user?.id, todayStr) ? (
              <div className="w-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold py-1 rounded-lg">
                Done ({getDriverTodayEndDay(user?.id, todayStr)?.endKm.toLocaleString()} km) ✓
              </div>
            ) : (
              <button
                onClick={() => {
                  setEndDayMeter(assignedVehicle?.current_km ? String(assignedVehicle.current_km) : "");
                  setShowEndDayModal(true);
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold py-1 rounded-lg shadow-sm"
              >
                End Day
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Assigned Vehicle Card */}
      {vLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-28" />
      ) : assignedVehicle ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Assigned Vehicle</span>
            </div>
            <button
              onClick={() => {
                setTargetSwitchVehicle(null);
                setSwitchModalOpen(true);
              }}
              className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Switch Vehicle
            </button>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground font-mono">{assignedVehicle.vehicle_no}</span>
                <span className="text-sm text-muted-foreground">{assignedVehicle.model}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                  {assignedVehicle.fuel_type || "Diesel"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Benchmark: <span className="text-foreground font-semibold">{assignedVehicle.benchmark_kmpl} km/L</span> &bull; 
                Tank: <span className="text-foreground font-semibold">{assignedVehicle.tank_size || 45} L</span> &bull; 
                Live KM: <span className="text-foreground font-semibold font-mono">{Number(assignedVehicle.current_km || 0).toLocaleString()} km</span>
              </p>
            </div>

            {/* Wash Counter & Wash Photo Button (Suggestion 6 & 7) */}
            <div className="bg-secondary/60 p-2.5 rounded-xl border border-border flex items-center gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Washed This Week</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-sm font-bold ${washCount >= 3 ? "text-emerald-400" : "text-amber-400"}`}>
                    {washCount} of 3
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {washCount >= 3 ? "Done ✓" : `(${3 - washCount} more needed)`}
                  </span>
                </div>
              </div>
              <input
                ref={washInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleWashPhotoUpload}
              />
              <button
                type="button"
                onClick={() => washInputRef.current?.click()}
                disabled={uploadingWash}
                className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                title="Capture wash photo"
              >
                <Camera className="w-3.5 h-3.5" />
                {uploadingWash ? "..." : "Wash Photo"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <ExpiryBadge label="License" date={assignedVehicle.license_expiry} />
            <ExpiryBadge label="Insurance" date={assignedVehicle.insurance_expiry} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">No Assigned Vehicle</span>
          </div>
          <p className="text-xs text-muted-foreground">Select a vehicle from the fleet to assign to yourself and start working:</p>
          <div className="flex gap-2">
            <select
              onChange={e => {
                const v = allVehicles?.find(veh => veh.id === e.target.value);
                if (v) {
                  setTargetSwitchVehicle(v);
                  setSwitchModalOpen(true);
                }
              }}
              defaultValue=""
              className="flex-1 bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>-- Choose Vehicle --</option>
              {allVehicles?.map(v => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_no} - {v.model} ({Number(v.current_km || 0).toLocaleString()} km)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Assigned Tasks Section (Fix 4 / A3 / A7 / O1: Today's Tasks + Collapsible "Earlier · not finished") */}
      <div id="driver-assigned-tasks-section" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Today's Tasks</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setTaskTab("active")}
              className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                taskTab === "active" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              Active ({activeTasks.length})
            </button>
            <button
              onClick={() => setTaskTab("completed")}
              className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                taskTab === "completed" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              Done ({tasks.filter(t => t.status === "done").length})
            </button>
          </div>
        </div>

        {(taskTab === "active" ? activeTasks : tasks.filter(t => t.status === "done")).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-xs">
            {taskTab === "active"
              ? "No tasks for today — you're all caught up!"
              : "No completed tasks recorded yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {(taskTab === "active" ? activeTasks : tasks.filter(t => t.status === "done")).map(task => {
              return (
                <div key={task.id} className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-foreground text-sm">{task.title}</h3>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                        task.priority === "high"
                          ? "bg-red-500/15 text-red-400 border-red-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>

                  {task.route && (
                    <p className="text-xs text-primary font-medium flex items-center gap-1">
                      <Route className="w-3.5 h-3.5" /> {task.route}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/40">
                    {task.startTime && (
                      <span className="font-semibold text-amber-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {task.startTime} {task.endTime ? `- ${task.endTime}` : ""}
                      </span>
                    )}
                    <span>📅 {task.startDate || task.dueDate}</span>
                    {task.photoRequired && (
                      <span className="text-purple-400 font-semibold text-[10px]">📸 Photo required</span>
                    )}
                  </div>

                  <div className="pt-1">
                    {task.status === "pending" && (
                      <button
                        onClick={() => handleStartTask(task)}
                        className="w-full bg-primary text-primary-foreground font-bold text-xs py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm"
                      >
                        Start Task / Route
                      </button>
                    )}
                    {task.status === "in_progress" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setActiveTask(task);
                            setProofFile(null);
                            setProofPreview(null);
                            setShowProofModal(true);
                          }}
                          className="flex-1 bg-emerald-500 text-black font-bold text-xs py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm"
                        >
                          {task.photoRequired ? "Complete Task (Photo Proof)" : "Complete Task"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEmergencyTask(task);
                            setEmergencyReason("Sudden illness / Medical");
                            setEmergencyNotes("");
                            setShowEmergencyModal(true);
                          }}
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold text-xs px-3 py-2.5 rounded-xl active:scale-95 transition-all shrink-0"
                          title="End early due to emergency"
                        >
                          End Early
                        </button>
                      </div>
                    )}
                    {task.status === "done" && (
                      <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                        <span>Completed ✓</span>
                        {task.proofUrl && (
                          <button
                            onClick={() => window.open(task.proofUrl!, "_blank")}
                            className="text-primary hover:underline text-[11px]"
                          >
                            View Proof
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Closed greyed section: "Earlier · not finished" (Fix 4 mockup) */}
        {earlierUnfinishedTasks.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowEarlierUnfinished(prev => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-semibold">
                Earlier · not finished ({earlierUnfinishedTasks.length})
              </span>
              <span className="text-[11px] font-medium">
                {showEarlierUnfinished ? "Hide ▴" : "Tap to show ▾"}
              </span>
            </button>

            {showEarlierUnfinished && (
              <div className="px-3.5 pb-3 space-y-2 border-t border-border/40 pt-2">
                {earlierUnfinishedTasks.map(t => (
                  <div
                    key={t.id}
                    className="rounded-lg bg-card/60 border border-border/50 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="font-mono text-[11px] text-amber-400/90 mr-1.5">
                        {t.startDate || t.dueDate}
                      </span>
                      <span className="font-semibold text-foreground/80">{t.title}</span>
                      {t.route && <span className="text-muted-foreground"> · {t.route}</span>}
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                      Waiting for manager
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Switch Vehicle Modal (Fix 2: All groups, free vs in-use, opens checklist) */}
      <VehicleSwitchModal
        isOpen={switchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
        currentVehicle={assignedVehicle || null}
        availableVehicles={allVehicles || []}
        todayChecklistVehicleIds={todayChecklistVehicleIds}
        inUseByOtherDriverMap={inUseByOtherDriverMap}
        onConfirm={handleConfirmSwitch}
      />

      {/* Task Proof Modal (Photo optional if photoRequired is false) */}
      {showProofModal && activeTask && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm">Finish: {activeTask.title}</h3>
              <button onClick={() => setShowProofModal(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {activeTask.photoRequired
                  ? "A verification photo is required for this task. Please snap a photo before finishing."
                  : "Photo is optional for this task. You can complete directly or attach a photo."}
              </p>

              <input
                ref={proofInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setProofFile(f);
                    const r = new FileReader();
                    r.onload = () => setProofPreview(r.result as string);
                    r.readAsDataURL(f);
                  }
                }}
              />

              {proofPreview ? (
                <div className="relative h-40 rounded-xl overflow-hidden border border-border">
                  <img src={proofPreview} alt="Proof" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setProofFile(null); setProofPreview(null); }}
                    className="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => proofInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-input rounded-xl p-6 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                  <Camera className="w-6 h-6 text-primary" />
                  {activeTask.photoRequired ? "Take Proof Photo *" : "Add Photo (Optional)"}
                </button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowProofModal(false)}
                className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitProof}
                disabled={submittingProof || (activeTask.photoRequired && !proofFile)}
                className="flex-1 bg-emerald-500 text-black font-bold py-2.5 rounded-xl text-xs disabled:opacity-50 shadow-md"
              >
                {submittingProof ? "Saving..." : "Finish Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Day Modal (Fix 2 / O10 / A1 / Fix 5: Vehicle chip at top, "X km today", scrollable body, pinned "Complete End Day" button) */}
      {showEndDayModal && (() => {
        const lastKm = Number(assignedVehicle?.current_km || todayStartKm || 0);
        const enteredEndKm = Number(endDayMeter) || 0;
        const deltaTodayKm = endDayMeter !== "" && todayStartKm > 0 && enteredEndKm >= todayStartKm ? enteredEndKm - todayStartKm : null;
        const isEndLower = endDayMeter !== "" && lastKm > 0 && enteredEndKm < lastKm;
        const isEndOver500 = endDayMeter !== "" && lastKm > 0 && enteredEndKm - lastKm > 500;
        const isEndJumpConfirmed = !isEndOver500 || endDayConfirmMeter.trim() === endDayMeter.trim();

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
              {/* Sticky Modal Header + Vehicle Chip */}
              <div className="p-4 border-b border-border bg-card shrink-0 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                    <Camera className="w-4 h-4 text-purple-400" /> End Day Check-Out
                  </h3>
                  <button
                    onClick={() => setShowEndDayModal(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>

                {/* Vehicle Chip at the Top of End Day (Fix 2 / O10) */}
                {assignedVehicle && (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold text-foreground font-mono">{assignedVehicle.vehicle_no}</span>
                      <span className="text-muted-foreground">· {assignedVehicle.model}</span>
                    </div>
                    <span className="text-emerald-300 font-mono text-[11px]">
                      Started today at {todayStartKm.toLocaleString()} km
                    </span>
                  </div>
                )}
              </div>

              {/* Scrollable Modal Body */}
              <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
                {/* Unfinished Tasks Alert Box (Page 7 Mockup) */}
                {unfinishedTasksToday.length > 0 && (
                  <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 space-y-1.5 text-xs text-red-200">
                    <div className="flex items-center gap-1.5 font-bold text-red-300">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>
                        {unfinishedTasksToday.length} task{unfinishedTasksToday.length > 1 ? "s" : ""} not finished
                      </span>
                    </div>
                    <div className="space-y-1 pl-5 font-mono text-[11px]">
                      {unfinishedTasksToday.map(t => (
                        <div key={t.id} className="truncate">
                          <span className="text-muted-foreground mr-1.5">{t.startTime || "Today"}</span>
                          <span className="text-foreground font-semibold">{t.title}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-5 pt-0.5">
                      They will be marked unfinished and the manager is told.
                    </p>
                  </div>
                )}

                {/* Final Odometer with "X km today" and 500 km plausibility check */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      End Odometer (km) *
                    </label>
                    {deltaTodayKm !== null && (
                      <span className="text-xs font-bold text-emerald-400 font-mono bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        {deltaTodayKm.toLocaleString()} km today
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={endDayMeter}
                    onChange={e => {
                      setEndDayMeter(e.target.value);
                      setEndDayConfirmMeter("");
                    }}
                    placeholder={`e.g. ${lastKm > 0 ? lastKm + 42 : 76420}`}
                    className={`w-full bg-background border rounded-xl px-3 py-2.5 text-foreground font-mono font-bold text-base focus:outline-none focus:ring-2 ${
                      isEndLower
                        ? "border-red-500 focus:ring-red-500"
                        : isEndOver500
                        ? "border-amber-500 focus:ring-amber-500"
                        : "border-input focus:ring-primary"
                    }`}
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-400">
                      Last recorded: {lastKm.toLocaleString()} km
                    </span>
                    {deltaTodayKm !== null && (
                      <span className="text-muted-foreground font-mono">
                        +{deltaTodayKm.toLocaleString()} km driven today
                      </span>
                    )}
                  </div>

                  {isEndLower && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                      Reading cannot be lower than {lastKm.toLocaleString()} km.
                    </div>
                  )}

                  {isEndOver500 && !isEndLower && (
                    <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 space-y-2 text-xs">
                      <p className="text-amber-300">
                        Reading is <strong>{(enteredEndKm - lastKm).toLocaleString()} km</strong> higher than last reading ({lastKm.toLocaleString()} km) — more than 500 km off. Retype to confirm:
                      </p>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder={`Retype ${endDayMeter} to confirm`}
                        value={endDayConfirmMeter}
                        onChange={e => setEndDayConfirmMeter(e.target.value)}
                        className="w-full bg-background border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </div>

                {/* Fuel Bars Left */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Fuel Left in Tank (1 to 6 bars)
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setEndDayBars(b)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          endDayBars === b
                            ? "bg-amber-500 text-black border-amber-500 scale-105"
                            : "bg-secondary text-foreground border-border"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {endDayBars} bars ≈ {((endDayBars / 6) * (assignedVehicle?.tank_size || 45)).toFixed(1)} L left
                  </p>
                </div>

                {/* Vavuniya Outstation Trip Toggle (Fixed 2h OT) */}
                <div className="flex items-center justify-between p-3 rounded-xl border bg-secondary/30 border-border">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-foreground block">Vavuniya Outstation Trip</span>
                    <span className="text-[11px] text-muted-foreground block">Fixed 2.0 hours overtime allocation</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isVavuniyaTrip}
                    onChange={e => setIsVavuniyaTrip(e.target.checked)}
                    className="w-5 h-5 accent-primary cursor-pointer rounded"
                  />
                </div>

                {/* Calculated Overtime Display */}
                <div className="p-3 rounded-xl border bg-primary/10 border-primary/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
                      Calculated Overtime
                    </span>
                    <span className="text-xs text-foreground/90 font-medium mt-0.5 block">
                      {calculatedOt.reasonText}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black font-mono text-primary">
                      {calculatedOt.hours.toFixed(1)} hrs
                    </span>
                  </div>
                </div>

                {/* Overtime Reason Auto-derived from Task */}
                <div className="bg-secondary/40 p-3 rounded-xl border border-border space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Reason (Auto from your task)
                    </label>
                    {isVavuniyaTrip && (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Vavuniya 2h Fixed
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-primary font-mono bg-background/80 px-2.5 py-2 rounded-xl border border-border">
                    {autoOtReason}
                  </p>
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={otNote}
                    onChange={e => setOtNote(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary mt-1"
                  />
                </div>

                {/* Dashboard Photo */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Odometer Photo (Optional)
                  </label>
                  <input
                    ref={endDayInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setEndDayPhoto(f);
                        const r = new FileReader();
                        r.onload = () => setEndDayPhotoPreview(r.result as string);
                        r.readAsDataURL(f);
                      }
                    }}
                  />
                  {endDayPhotoPreview ? (
                    <div className="relative h-28 rounded-xl overflow-hidden border border-border">
                      <img src={endDayPhotoPreview} alt="End day preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => {
                          setEndDayPhoto(null);
                          setEndDayPhotoPreview(null);
                        }}
                        className="absolute top-1 right-1 bg-black/80 text-white text-xs px-2 py-0.5 rounded-lg"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => endDayInputRef.current?.click()}
                      className="w-full border border-dashed border-input rounded-xl p-4 flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-secondary/40"
                    >
                      <Camera className="w-4 h-4 text-purple-400" /> Capture Dashboard Photo
                    </button>
                  )}
                </div>
              </div>

              {/* Sticky Footer Pinned at the Bottom of End Day Modal (Fix 2 / O10) */}
              <div className="p-4 border-t border-border bg-card shrink-0 flex gap-2">
                <button
                  onClick={() => setShowEndDayModal(false)}
                  className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-xs font-semibold hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!endDayMeter) {
                      toast({ title: "Final Odometer required", variant: "destructive" });
                      return;
                    }
                    const meterNum = Number(endDayMeter);
                    if (isNaN(meterNum) || meterNum <= 0) {
                      toast({ title: "Valid Odometer reading required", variant: "destructive" });
                      return;
                    }

                    if (lastKm > 0 && meterNum < lastKm) {
                      toast({
                        title: "Odometer lower than last reading",
                        description: `Entered ${meterNum.toLocaleString()} km cannot be lower than last reading (${lastKm.toLocaleString()} km).`,
                        variant: "destructive",
                      });
                      return;
                    }

                    if (isEndOver500 && !isEndJumpConfirmed) {
                      toast({
                        title: "Confirm Large Odometer Jump",
                        description: `Reading is ${(meterNum - lastKm).toLocaleString()} km above last reading. Please retype it in the confirmation box.`,
                        variant: "destructive",
                      });
                      return;
                    }

                    setSubmittingEndDay(true);
                    try {
                      let photoUrl: string | null = null;
                      if (endDayPhoto) {
                        photoUrl = await uploadImage(endDayPhoto);
                      }

                      // 1. Update vehicle live odometer in settings/DB safely (Fix A1)
                      if (assignedVehicle?.id) {
                        await updateVehicle.mutateAsync({
                          id: assignedVehicle.id,
                          updates: { current_km: meterNum },
                        });
                      }

                      // Calculate actual worked hours dynamically (Fix A12 / N1)
                      let startTimeMs = Date.now() - (8 * 3600 * 1000);
                      const morningCheck = checklists?.find(
                        c => (c.vehicle_id === assignedVehicle?.id || c.driver_id === user?.id) && (c.date === todayStr || (c.submitted_at && c.submitted_at.startsWith(todayStr)))
                      );
                      if (morningCheck?.submitted_at) {
                        startTimeMs = new Date(morningCheck.submitted_at).getTime();
                      } else {
                        const driverShiftStr = shifts?.[user?.id || ""]?.shift;
                        const startPart = driverShiftStr?.split("-")[0]?.trim();
                        if (startPart) {
                          const shiftStartMins = timeStringToMinutes(startPart);
                          if (shiftStartMins < 9999) {
                            const d = new Date();
                            d.setHours(Math.floor(shiftStartMins / 60), shiftStartMins % 60, 0, 0);
                            startTimeMs = d.getTime();
                          }
                        }
                      }
                      const elapsedHours = (Date.now() - startTimeMs) / (1000 * 60 * 60);
                      const dynamicWorkedHours = Math.max(1, Math.round(elapsedHours * 10) / 10);

                      const finalReason = isVavuniyaTrip
                        ? otNote
                          ? `[Vavuniya Trip] ${otNote}`
                          : "Vavuniya Outstation Trip"
                        : autoOtReason + (otNote ? ` · Note: ${otNote}` : "");

                      // 2. Submit end-day record (Fix N1: saved in separate store, never touches checklists table)
                      if (assignedVehicle?.id && user?.id) {
                        await submitEndDay.mutateAsync({
                          vehicleId: assignedVehicle.id,
                          vehicleNo: assignedVehicle.vehicle_no,
                          driverId: user.id,
                          driverName: user.name || "Driver",
                          date: todayStr,
                          endKm: meterNum,
                          startKm: todayStartKm || lastKm,
                          deltaKm: deltaTodayKm,
                          fuelBars: endDayBars,
                          fuelLitersRemaining: Number(((endDayBars / 6) * (assignedVehicle.tank_size || 45)).toFixed(1)),
                          photoUrl,
                          workedHours: dynamicWorkedHours,
                          otHours: calculatedOt.hours,
                          otReason: finalReason,
                          otNote: otNote || undefined,
                        });
                      }

                      // 3. Mark unfinished tasks as status: "unfinished" & alert manager (Fix 4 / A3 / A7)
                      if (unfinishedTasksToday.length > 0) {
                        for (const t of unfinishedTasksToday) {
                          try {
                            await updateTask(t.id, {
                              status: "unfinished",
                              notes: t.notes ? `${t.notes} | Unfinished at End Day` : "Unfinished at End Day",
                            });
                          } catch {}
                        }
                        try {
                          notifyManagers(
                            `⚠️ *UNFINISHED TASKS REPORT (End Day)*\n` +
                              `Driver: *${user?.name}*\n` +
                              `Vehicle: *${assignedVehicle?.vehicle_no}*\n` +
                              `*${unfinishedTasksToday.length} task(s) not finished:*\n` +
                              unfinishedTasksToday
                                .map(t => `• ${t.startTime ? `${t.startTime} ` : ""}${t.title}`)
                                .join("\n")
                          );
                        } catch {}
                      }

                      // 4. Record overtime with dynamic calculation & auto-derived reason
                      await recordOvertime.mutateAsync({
                        driverId: user?.id || "",
                        driverName: user?.name || "Driver",
                        date: todayStr,
                        day: format(new Date(), "EEE"),
                        workedHours: dynamicWorkedHours,
                        otHours: calculatedOt.hours,
                        reason: finalReason,
                        note: otNote || undefined,
                      });

                      // 5. Log single audit trail event
                      try {
                        await logAuditEvent({
                          driver_id: user?.id,
                          driver_name: user?.name,
                          vehicle_id: assignedVehicle?.id,
                          vehicle_no: assignedVehicle?.vehicle_no,
                          action_type: "END_DAY_CHECKOUT",
                          status: "success",
                          odometer: meterNum,
                          photos_count: photoUrl ? 1 : 0,
                          details: `Driver completed end-of-day check-out for ${assignedVehicle?.vehicle_no}. Final Odometer: ${meterNum.toLocaleString()} km (${deltaTodayKm !== null ? `+${deltaTodayKm.toLocaleString()} km today` : ""}), Fuel left: ${endDayBars} bars. Overtime: ${calculatedOt.hours} hrs.`,
                        });
                      } catch {}

                      toast({
                        title: "End Day Recorded ✓",
                        description: `Final KM: ${meterNum.toLocaleString()} km saved. Vehicle odometer updated.`,
                      });
                      setShowEndDayModal(false);
                      setEndDayPhoto(null);
                      setEndDayPhotoPreview(null);
                    } catch (e: any) {
                      try {
                        await logAuditEvent({
                          driver_id: user?.id,
                          driver_name: user?.name,
                          vehicle_id: assignedVehicle?.id,
                          vehicle_no: assignedVehicle?.vehicle_no,
                          action_type: "END_DAY_CHECKOUT",
                          status: "error",
                          odometer: meterNum,
                          details: `End day check-out failed.`,
                          error_message: e.message || "Failed to record End Day",
                        });
                      } catch {}
                      toast({ title: "Failed to record End Day", description: e.message, variant: "destructive" });
                    } finally {
                      setSubmittingEndDay(false);
                    }
                  }}
                  disabled={submittingEndDay || isEndLower || !isEndJumpConfirmed}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md"
                >
                  {submittingEndDay ? "Submitting..." : "Complete End Day"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Emergency End Task / Leave Request Modal */}
      {showEmergencyModal && emergencyTask && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-red-500/30 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-foreground text-sm">Emergency End Task</h3>
              </div>
              <button onClick={() => setShowEmergencyModal(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                Ending <strong className="text-foreground">{emergencyTask.title}</strong> early will release this task back to the team as <strong>"Needs new driver"</strong> and submit an Emergency Leave / Assistance alert to Fleet Management.
              </p>

              <div>
                <label className="font-bold text-foreground block mb-1.5">Reason for Emergency End *</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    "Sudden illness / Medical",
                    "Vehicle breakdown / Flat tire",
                    "Family emergency",
                    "Accident / Incident",
                    "Other urgent issue",
                  ].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setEmergencyReason(r)}
                      className={`text-left px-3 py-2 rounded-xl font-medium border text-xs transition-all ${
                        emergencyReason === r
                          ? "bg-red-500/20 text-red-300 border-red-500/40 font-bold"
                          : "bg-secondary text-muted-foreground border-border"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Additional details (Optional)</label>
                <textarea
                  rows={2}
                  value={emergencyNotes}
                  onChange={e => setEmergencyNotes(e.target.value)}
                  placeholder="e.g. Current location, breakdown details..."
                  className="w-full bg-background border border-input rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>

              {/* Direct Call Fleet Office / Manager Hotline (Fix A13: Ring and End Early) */}
              <div className="pt-1">
                <a
                  href="tel:0771234567"
                  className="w-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl py-2 px-3 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  📞 Call Fleet Office / Dispatch Hotline
                </a>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEmergencyEnd}
                disabled={submittingEmergency}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md"
              >
                {submittingEmergency ? "Submitting..." : "Confirm & Alert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver "My Month Calendar" Read-Only Modal */}
      {showDriverCalendarModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 shadow-2xl animate-in fade-in-50 duration-200 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-border">
              <div>
                <h3 className="font-bold text-foreground text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  My Shift Schedule · මාසික කාලසටහන
                </h3>
                <p className="text-xs text-muted-foreground">
                  Manager assigned monthly schedule (Read-only)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDriverCalendarModal(false)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center justify-between bg-secondary/40 p-2.5 rounded-xl border border-border">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDriverCalendarMonth(prev => subMonths(prev, 1))}
                  className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-sm text-foreground px-2">
                  {format(driverCalendarMonth, "MMMM yyyy")}
                </span>
                <button
                  type="button"
                  onClick={() => setDriverCalendarMonth(prev => addMonths(prev, 1))}
                  className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setDriverCalendarMonth(new Date())}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border"
              >
                Current Month
              </button>
            </div>

            {/* Calendar Grid */}
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
                {driverCalendarDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isCurrentMonth = isSameMonth(day, driverCalendarMonth);
                  const isDayToday = isToday(day);
                  const dayShift = user?.id ? getDriverShiftForDate(user.id, dateStr) : "No shift assigned";
                  const hasShift = dayShift && dayShift !== "No shift assigned";
                  const isDayLeave = dayShift && (dayShift === "Leave" || dayShift.toLowerCase().includes("leave"));
                  const isDayNight = dayShift && dayShift.toLowerCase().includes("pm") && !dayShift.toLowerCase().startsWith("8:00 am") && !dayShift.toLowerCase().startsWith("6:00 am");

                  return (
                    <div
                      key={dateStr}
                      className={`min-h-[58px] p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        isDayToday
                          ? "border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/40 shadow-sm"
                          : isCurrentMonth
                          ? "border-border/60 bg-card"
                          : "border-border/20 bg-card/20 opacity-30"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs font-bold ${
                          isDayToday ? "text-emerald-400 font-extrabold underline" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {format(day, "d")}
                        </span>
                        {isDayToday && (
                          <span className="text-[8px] font-extrabold px-1 rounded bg-emerald-500 text-black">
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
                            {isDayLeave ? "Leave" : dayShift.length > 11 ? dayShift.slice(0, 9) + "…" : dayShift}
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/30 block text-center">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend & Close */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border">
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Day Shift
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Night Shift
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Leave
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowDriverCalendarModal(false)}
                className="bg-secondary hover:bg-secondary/80 text-foreground px-4 py-1.5 rounded-xl text-xs font-bold border border-border"
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
