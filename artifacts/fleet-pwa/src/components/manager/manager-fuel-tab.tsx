import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { 
  useFuelLogs, useFuelPrices, useCreateFuelLog, useUpdateFuelLog, useDeleteFuelLog, FuelLog,
  UUID_REGEX, tempToRealFuelLogIdMap
} from "@/hooks/use-fuel";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { uploadImage, compressImage } from "@/lib/image-upload";
import { calculateFuelLogKmpl, evaluateFuelRowStatus } from "@/lib/fuel-calc";
import { logAuditEvent } from "@/lib/audit-logger";
import { MultiPhotoViewer, PhotoItem } from "@/components/multi-photo-viewer";
import { 
  Fuel, Plus, Pencil, Trash2, Camera, AlertTriangle, 
  CheckCircle2, Clock, Eye, AlertCircle, ArrowUpDown, ExternalLink, Upload, History
} from "lucide-react";
import { format, parseISO } from "date-fns";

export interface FuelLogMetaEntry {
  is_past_entry?: boolean;
  added_by?: string;
  time?: string;
}

export function ManagerFuelTab() {
  const { user } = useAuth();
  const { data: rawVehicles = [] } = useVehicles();
  const { data: rawDrivers = [] } = useDrivers();
  const { data: rawFuelLogs = [], isLoading } = useFuelLogs();
  const vehicles = useMemo(() => (Array.isArray(rawVehicles) ? rawVehicles : []), [rawVehicles]);
  const drivers = useMemo(() => (Array.isArray(rawDrivers) ? rawDrivers : []), [rawDrivers]);
  const fuelLogs: FuelLog[] = useMemo(() => (Array.isArray(rawFuelLogs) ? rawFuelLogs : []), [rawFuelLogs]);
  const { data: fuelPrices } = useFuelPrices();
  const createFuelLog = useCreateFuelLog();
  const updateFuelLog = useUpdateFuelLog();
  const deleteFuelLog = useDeleteFuelLog();
  const { toast } = useToast();

  const [filterVehicle, setFilterVehicle] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editLog, setEditLog] = useState<FuelLog | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fuel Log Meta (tracks past entries & "added by Manager")
  const [fuelLogMeta, setFuelLogMeta] = useState<Record<string, FuelLogMetaEntry>>(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("fleet_fuel_log_meta_cache") || "{}");
      } catch {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    supabase
      .from("settings")
      .select("value")
      .eq("key", "fuel_log_meta")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "object") {
          setFuelLogMeta(prev => {
            const merged = { ...prev, ...(data.value as Record<string, FuelLogMetaEntry>) };
            try {
              localStorage.setItem("fleet_fuel_log_meta_cache", JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      });
  }, []);

  const saveFuelLogMeta = async (logId: string, entry: FuelLogMetaEntry) => {
    if (!logId) return;
    const next = { ...fuelLogMeta, [logId]: { ...(fuelLogMeta[logId] || {}), ...entry } };
    setFuelLogMeta(next);
    try {
      localStorage.setItem("fleet_fuel_log_meta_cache", JSON.stringify(next));
    } catch {}
    try {
      const { data: existing } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "fuel_log_meta")
        .maybeSingle();
      const base = (existing?.value && typeof existing.value === "object") ? existing.value : {};
      await supabase
        .from("settings")
        .upsert({ key: "fuel_log_meta", value: { ...base, [logId]: next[logId] } }, { onConflict: "key" });
    } catch (e) {
      console.warn("Could not persist fuel_log_meta", e);
    }
  };

  // Photo viewer modal state (Suggestion 3)
  const [viewerPhotos, setViewerPhotos] = useState<PhotoItem[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Missing / Update Proof modal state for manager
  const [attachModalLog, setAttachModalLog] = useState<FuelLog | null>(null);
  const [attachBeforeFile, setAttachBeforeFile] = useState<File | null>(null);
  const [attachBeforePrev, setAttachBeforePrev] = useState<string | null>(null);
  const [attachPumpFile, setAttachPumpFile] = useState<File | null>(null);
  const [attachPumpPrev, setAttachPumpPrev] = useState<string | null>(null);
  const [attachMeterFile, setAttachMeterFile] = useState<File | null>(null);
  const [attachMeterPrev, setAttachMeterPrev] = useState<string | null>(null);
  const [attachBillFile, setAttachBillFile] = useState<File | null>(null);
  const [attachBillPrev, setAttachBillPrev] = useState<string | null>(null);
  const [attachingProof, setAttachingProof] = useState(false);

  const attachBeforeRef = useRef<HTMLInputElement>(null);
  const attachPumpRef = useRef<HTMLInputElement>(null);
  const attachMeterRef = useRef<HTMLInputElement>(null);
  const attachBillRef = useRef<HTMLInputElement>(null);

  const openAttachModal = (log: FuelLog) => {
    let actualLog = log;
    if (!UUID_REGEX.test(log.id)) {
      const mappedId = tempToRealFuelLogIdMap.get(log.id);
      const match = fuelLogs.find(l => 
        (mappedId && l.id === mappedId) ||
        (UUID_REGEX.test(l.id) && l.vehicle_id === log.vehicle_id && l.date === log.date)
      );
      if (match) actualLog = match;
    }
    setAttachModalLog(actualLog);
    setAttachBeforeFile(null);
    setAttachBeforePrev(actualLog.before_meter_photo_url || null);
    setAttachPumpFile(null);
    setAttachPumpPrev(actualLog.pump_meter_photo_url || null);
    setAttachMeterFile(null);
    setAttachMeterPrev(actualLog.meter_photo_url || null);
    setAttachBillFile(null);
    setAttachBillPrev(actualLog.bill_photo_url || null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setFile: (f: File | null) => void, setPreview: (s: string | null) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 0.5, 1000);
        const readyFile = new File([compressed], file.name.replace(/\.[^/.]+$/, ".jpg"), {
          type: "image/jpeg",
        });
        const previewUrl = URL.createObjectURL(compressed);
        setFile(readyFile);
        setPreview(previewUrl);
      } catch {
        setFile(file);
        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);
      }
    }
  };

  const handleSaveAttachedProofs = async () => {
    if (!attachModalLog) return;
    setAttachingProof(true);
    try {
      const updates: any = {};
      const uploads: Promise<void>[] = [];

      if (attachBeforeFile) {
        uploads.push(uploadImage(attachBeforeFile).then(url => { updates.before_meter_photo_url = url; }));
      }
      if (attachPumpFile) {
        uploads.push(uploadImage(attachPumpFile).then(url => { updates.pump_meter_photo_url = url; }));
      }
      if (attachMeterFile) {
        uploads.push(uploadImage(attachMeterFile).then(url => { updates.meter_photo_url = url; }));
      }
      if (attachBillFile) {
        uploads.push(uploadImage(attachBillFile).then(url => { updates.bill_photo_url = url; }));
      }

      if (uploads.length === 0) {
        toast({ title: "No new photos selected", description: "Select at least one photo to update." });
        setAttachingProof(false);
        return;
      }

      await Promise.all(uploads);

      // Resolve real UUID if attachModalLog.id was a temporary ID
      let targetId = attachModalLog.id;
      if (!UUID_REGEX.test(targetId)) {
        const mapped = tempToRealFuelLogIdMap.get(targetId);
        if (mapped && UUID_REGEX.test(mapped)) {
          targetId = mapped;
        } else {
          const match = fuelLogs.find(l => 
            UUID_REGEX.test(l.id) && 
            l.vehicle_id === attachModalLog.vehicle_id && 
            l.date === attachModalLog.date
          );
          if (match) {
            targetId = match.id;
          } else {
            const { data: latest } = await supabase
              .from("fuel_logs")
              .select("id")
              .eq("vehicle_id", attachModalLog.vehicle_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (latest?.id) {
              targetId = latest.id;
            }
          }
        }
      }

      // Pass vehicle_id so useUpdateFuelLog can self-heal if ever needed
      updates.vehicle_id = attachModalLog.vehicle_id;

      await updateFuelLog.mutateAsync({
        id: targetId,
        updates,
      });

      toast({
        title: "Proof Photos Saved ✓",
        description: `Successfully attached photos to fuel entry.`,
      });

      setAttachModalLog(null);
    } catch (err: any) {
      toast({
        title: "Failed to upload proof photos",
        description: err.message || "Please check internet connection.",
        variant: "destructive",
      });
    } finally {
      setAttachingProof(false);
    }
  };

  const vMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);
  const dMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d])), [drivers]);

  // Sort logs by date & time, newest first (Suggestion 1)
  const sortedAndFiltered = useMemo(() => {
    const safeLogs = Array.isArray(fuelLogs) ? fuelLogs : [];
    const list = filterVehicle === "all" ? safeLogs : safeLogs.filter(f => f?.vehicle_id === filterVehicle);
    return (list || []).slice().sort((a, b) => {
      const aTime = new Date(a.created_at || a.date).getTime();
      const bTime = new Date(b.created_at || b.date).getTime();
      if (bTime !== aTime) return bTime - aTime;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [fuelLogs, filterVehicle]);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Form states (Default Full Tank = No per Fix 3 & A5)
  const [form, setForm] = useState({
    vehicle_id: "",
    driver_id: "",
    date: todayStr,
    time: format(new Date(), "HH:mm"),
    liters: "",
    amount_paid: "",
    meter: "",
    is_full_tank: false,
    is_past_entry: false,
  });

  // 4 Optional Photo states inside the Add / Edit modal (Fix 3 & O6)
  const [modalBeforeFile, setModalBeforeFile] = useState<File | null>(null);
  const [modalBeforePrev, setModalBeforePrev] = useState<string | null>(null);
  const [modalPumpFile, setModalPumpFile] = useState<File | null>(null);
  const [modalPumpPrev, setModalPumpPrev] = useState<string | null>(null);
  const [modalMeterFile, setModalMeterFile] = useState<File | null>(null);
  const [modalMeterPrev, setModalMeterPrev] = useState<string | null>(null);
  const [modalBillFile, setModalBillFile] = useState<File | null>(null);
  const [modalBillPrev, setModalBillPrev] = useState<string | null>(null);

  const modalBeforeRef = useRef<HTMLInputElement>(null);
  const modalPumpRef = useRef<HTMLInputElement>(null);
  const modalMeterRef = useRef<HTMLInputElement>(null);
  const modalBillRef = useRef<HTMLInputElement>(null);

  const selectedVehicle = vMap[form.vehicle_id];
  const vehicleTankSize = selectedVehicle?.tank_size || (selectedVehicle?.model?.toLowerCase().includes("bike") ? 5.3 : 45);

  // Latest odometer reading for selected vehicle (from useVehicles live km or logs)
  const lastOdometer = useMemo(() => {
    if (!form.vehicle_id) return null;
    if (selectedVehicle?.current_km && selectedVehicle.current_km > 0) {
      return Number(selectedVehicle.current_km);
    }
    const vLogs = fuelLogs
      .filter(f => f.vehicle_id === form.vehicle_id && f.after_meter)
      .sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());
    return vLogs[0]?.after_meter || null;
  }, [form.vehicle_id, selectedVehicle, fuelLogs]);

  const handleOpenAdd = () => {
    const firstV = vehicles[0];
    setForm({
      vehicle_id: firstV?.id || "",
      driver_id: firstV?.assigned_driver_id || drivers[0]?.id || "",
      date: format(new Date(), "yyyy-MM-dd"),
      time: format(new Date(), "HH:mm"),
      liters: "",
      amount_paid: "",
      meter: "",
      is_full_tank: false, // Default to No (Fix 3 & A5)
      is_past_entry: false,
    });
    setModalBeforeFile(null);
    setModalBeforePrev(null);
    setModalPumpFile(null);
    setModalPumpPrev(null);
    setModalMeterFile(null);
    setModalMeterPrev(null);
    setModalBillFile(null);
    setModalBillPrev(null);
    setEditLog(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (log: FuelLog) => {
    let actualLog = log;
    if (!UUID_REGEX.test(log.id)) {
      const mappedId = tempToRealFuelLogIdMap.get(log.id);
      const match = fuelLogs.find(l => 
        (mappedId && l.id === mappedId) ||
        (UUID_REGEX.test(l.id) && l.vehicle_id === log.vehicle_id && l.date === log.date)
      );
      if (match) actualLog = match;
    }
    setEditLog(actualLog);
    const meterVal = String(actualLog.after_meter || actualLog.before_meter || "");
    const meta = fuelLogMeta[actualLog.id];
    const logTime = meta?.time || (actualLog.created_at ? (() => { try { return format(parseISO(actualLog.created_at), "HH:mm"); } catch { return "12:00"; } })() : "12:00");
    setForm({
      vehicle_id: actualLog.vehicle_id || "",
      driver_id: actualLog.driver_id || "",
      date: actualLog.date || format(new Date(), "yyyy-MM-dd"),
      time: logTime,
      liters: String(actualLog.liters || ""),
      amount_paid: String(actualLog.amount_paid || ""),
      meter: meterVal,
      is_full_tank: actualLog.is_full_tank ?? false,
      is_past_entry: Boolean(meta?.is_past_entry || (actualLog.date && actualLog.date < todayStr)),
    });
    setModalBeforeFile(null);
    setModalBeforePrev(actualLog.before_meter_photo_url || null);
    setModalPumpFile(null);
    setModalPumpPrev(actualLog.pump_meter_photo_url || null);
    setModalMeterFile(null);
    setModalMeterPrev(actualLog.meter_photo_url || null);
    setModalBillFile(null);
    setModalBillPrev(actualLog.bill_photo_url || null);
    setShowAddModal(true);
  };

  const handleLitersChange = (lStr: string) => {
    const litersNum = parseFloat(lStr) || 0;
    const price = selectedVehicle?.fuel_type === "Petrol" ? (fuelPrices?.petrol || 370) : (fuelPrices?.diesel || 392);
    setForm(f => ({
      ...f,
      liters: lStr,
      amount_paid: litersNum > 0 ? (litersNum * price).toFixed(2) : f.amount_paid,
    }));
  };

  const handleSave = async () => {
    if (!form.vehicle_id) {
      toast({ title: "Please select a vehicle", variant: "destructive" });
      return;
    }
    const liters = parseFloat(form.liters);
    const meter = parseFloat(form.meter);
    const amount = parseFloat(form.amount_paid);

    if (isNaN(liters) || liters <= 0) {
      toast({ title: "Invalid liters", description: "Liters added must be greater than 0", variant: "destructive" });
      return;
    }

    // Tank size validation (Issue 13)
    if (liters > vehicleTankSize) {
      toast({
        title: "Fill exceeds tank size",
        description: `Vehicle tank size is ${vehicleTankSize} L, cannot add ${liters} L.`,
        variant: "destructive",
      });
      return;
    }

    if (isNaN(meter) || meter <= 0) {
      toast({ title: "Invalid odometer reading", variant: "destructive" });
      return;
    }

    const isPastEntry = Boolean(
      form.is_past_entry ||
      form.date < todayStr ||
      (lastOdometer !== null && meter < lastOdometer)
    );

    setSaving(true);
    try {
      // Upload any of the 4 optional photos selected in the modal
      const photoUrls: Record<string, string | null> = {};
      const uploadTasks: Promise<void>[] = [];
      if (modalBeforeFile) {
        uploadTasks.push(uploadImage(modalBeforeFile).then(url => { photoUrls.before_meter_photo_url = url; }));
      }
      if (modalPumpFile) {
        uploadTasks.push(uploadImage(modalPumpFile).then(url => { photoUrls.pump_meter_photo_url = url; }));
      }
      if (modalMeterFile) {
        uploadTasks.push(uploadImage(modalMeterFile).then(url => { photoUrls.meter_photo_url = url; }));
      }
      if (modalBillFile) {
        uploadTasks.push(uploadImage(modalBillFile).then(url => { photoUrls.bill_photo_url = url; }));
      }
      if (uploadTasks.length > 0) {
        await Promise.all(uploadTasks);
      }

      const vehicleAllLogs = fuelLogs.filter(l => l.vehicle_id === form.vehicle_id);
      const calcResult = calculateFuelLogKmpl(
        {
          vehicle_id: form.vehicle_id,
          date: form.date,
          meter,
          liters,
          is_full_tank: form.is_full_tank,
          currentLogId: editLog?.id,
        },
        vehicleAllLogs
      );

      const benchmark = selectedVehicle ? Number(selectedVehicle.benchmark_kmpl || 14) : 14;
      const kmpl = calcResult.kmpl;
      const isBelow = kmpl !== null ? kmpl < (benchmark * 0.75) : false;

      const payload: any = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || (drivers[0]?.id || ""),
        date: form.date,
        liters,
        amount_paid: isNaN(amount) ? 0 : amount,
        previous_odometer: calcResult.previousFullOdo,
        before_meter: meter,
        fuel_pump_meter: 0,
        after_meter: meter,
        bill_meter: null,
        is_full_tank: form.is_full_tank,
        kmpl_calculated: kmpl,
        below_benchmark: isBelow,
        ...photoUrls,
      };

      const targetVeh = vMap[form.vehicle_id];
      const targetDrv = dMap[form.driver_id];

      if (editLog) {
        let editId = editLog.id;
        if (!UUID_REGEX.test(editId)) {
          const mapped = tempToRealFuelLogIdMap.get(editId);
          if (mapped) editId = mapped;
          else {
            const match = fuelLogs.find(l => UUID_REGEX.test(l.id) && l.vehicle_id === editLog.vehicle_id && l.date === editLog.date);
            if (match) editId = match.id;
          }
        }
        const oldMeter = Number(editLog.after_meter || editLog.before_meter || 0);
        const oldLiters = Number(editLog.liters || 0);
        await updateFuelLog.mutateAsync({ id: editId, updates: payload });
        await saveFuelLogMeta(editId, {
          is_past_entry: isPastEntry,
          added_by: user?.name || "Manager",
          time: form.time,
        });

        await logAuditEvent({
          driver_id: form.driver_id || user?.id,
          driver_name: targetDrv?.name || user?.name || "Manager",
          vehicle_id: form.vehicle_id,
          vehicle_no: targetVeh?.vehicle_no,
          action_type: "MANAGER_FUEL_EDIT",
          status: "success",
          odometer: meter,
          liters,
          details: `Manager (${user?.name || "Manager"}) edited fuel log for ${targetVeh?.vehicle_no || "Vehicle"} (${form.date} ${form.time}). Odo: ${oldMeter.toLocaleString()} → ${meter.toLocaleString()} km, Litres: ${oldLiters} → ${liters} L, Full Tank: ${form.is_full_tank ? "Yes" : "No"}.`,
        });

        toast({ title: "Fuel log updated successfully ✓" });
      } else {
        const created = await createFuelLog.mutateAsync(payload as any);
        if (created?.id) {
          await saveFuelLogMeta(created.id, {
            is_past_entry: isPastEntry,
            added_by: user?.name || "Manager",
            time: form.time,
          });
        }

        await logAuditEvent({
          driver_id: form.driver_id || user?.id,
          driver_name: targetDrv?.name || user?.name || "Manager",
          vehicle_id: form.vehicle_id,
          vehicle_no: targetVeh?.vehicle_no,
          action_type: "MANAGER_FUEL_ADD",
          status: "success",
          odometer: meter,
          liters,
          details: `Manager (${user?.name || "Manager"}) added ${isPastEntry ? "past " : ""}fuel entry for ${targetVeh?.vehicle_no || "Vehicle"} (${form.date} ${form.time}). Odo: ${meter.toLocaleString()} km, Litres: ${liters} L, Rs. ${payload.amount_paid}, Full Tank: ${form.is_full_tank ? "Yes" : "No"}${isPastEntry ? " [Past entry — live km unchanged]" : ""}.`,
        });

        toast({
          title: isPastEntry ? "Past Fuel Entry Saved ✓" : "Fuel Entry Saved ✓",
          description: isPastEntry
            ? `Placed by date (${form.date}). Vehicle live km remains unchanged.`
            : `Saved fuel entry for ${targetVeh?.vehicle_no || "vehicle"}.`,
        });
      }
      setShowAddModal(false);
      setEditLog(null);
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Open fuel photos modal
  const openPhotos = (log: FuelLog, startIndex = 0) => {
    const photos: { url: string; label: string }[] = [];
    if (log.before_meter_photo_url) photos.push({ url: log.before_meter_photo_url, label: "1. Before Meter" });
    if (log.pump_meter_photo_url) photos.push({ url: log.pump_meter_photo_url, label: "2. Pump Meter" });
    if (log.meter_photo_url) photos.push({ url: log.meter_photo_url, label: "3. After Meter" });
    if (log.bill_photo_url) photos.push({ url: log.bill_photo_url, label: "4. Bill / Receipt" });

    if (photos.length === 0) {
      toast({ title: "No photos attached to this fuel entry" });
      return;
    }

    const v = vMap[log.vehicle_id];
    const title = `Fuel Photos - ${v?.vehicle_no || "Vehicle"} (${log.date})`;
    const viewerKey = `proof_photos_${log.id}`;
    const payload = { photos, title, initialIndex: startIndex };

    try {
      localStorage.setItem(viewerKey, JSON.stringify(payload));
      sessionStorage.setItem(viewerKey, JSON.stringify(payload));
    } catch (e) {
      console.warn("Storage quota or error saving proof viewer photos", e);
    }

    setViewerPhotos(photos);
    setViewerIndex(startIndex);
  };

  // Unified KMPL Status badge using evaluateFuelRowStatus (matches Driver login 100% — Fix A6)
  const renderRowStatusBadge = (log: FuelLog) => {
    const evalStatus = evaluateFuelRowStatus(log, vehicles, fuelLogs);
    if (evalStatus.status === "good") {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" /> {evalStatus.badgeText}
        </span>
      );
    }
    if (evalStatus.status === "below") {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" /> {evalStatus.badgeText}
        </span>
      );
    }
    if (evalStatus.status === "full_base") {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
          {evalStatus.badgeText}
        </span>
      );
    }
    return <span className="text-muted-foreground text-[10px]">{evalStatus.badgeText}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header and Vehicle filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">Fuel Logs & Accuracy Verification</p>
          <p className="text-xs text-muted-foreground">Full-to-full calculation · Anomaly detection</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-xs px-3.5 py-2 rounded-xl hover:opacity-90 transition-all self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" /> Add Fuel Entry
        </button>
      </div>

      {/* Vehicle filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterVehicle("all")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            filterVehicle === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
          }`}
        >
          All Vehicles ({fuelLogs.length})
        </button>
        {vehicles.map(v => (
          <button
            key={v.id}
            onClick={() => setFilterVehicle(v.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filterVehicle === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
            }`}
          >
            {v.vehicle_no}
          </button>
        ))}
      </div>

      {/* Fuel Log list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sortedAndFiltered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
          <Fuel className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No fuel logs match filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAndFiltered.map(log => {
            const v = vMap[log.vehicle_id];
            const d = dMap[log.driver_id];
            const photoCount = [log.before_meter_photo_url, log.pump_meter_photo_url, log.meter_photo_url, log.bill_photo_url].filter(Boolean).length;
            const hasPhotos = photoCount > 0;
            const meta = fuelLogMeta[log.id];
            const meterVal = Number(log.after_meter || log.before_meter || 0);

            return (
              <div key={log.id} className="bg-card border border-border rounded-xl p-4 shadow-sm hover:border-border/80 transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground text-sm">{v?.vehicle_no || "Vehicle"}</span>
                      <span className="text-xs text-muted-foreground">({v?.model || ""})</span>
                      <span className="text-xs text-primary font-medium">· {d?.name || "Driver"}</span>
                      {meta?.is_past_entry && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Past
                        </span>
                      )}
                      {meta?.added_by && (
                        <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                          added by {meta.added_by}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.date} {meta?.time ? `· ${meta.time}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {hasPhotos && (
                      <button
                        onClick={() => openPhotos(log, 0)}
                        className="flex items-center gap-1.5 bg-secondary text-foreground text-xs font-bold px-2.5 py-1 rounded-lg hover:bg-secondary/80 border border-border cursor-pointer transition-colors shadow-xs"
                        title="View attached photos"
                      >
                        <Camera className="w-3.5 h-3.5 text-primary" /> Photos ({photoCount}/4)
                      </button>
                    )}
                    <button
                      data-testid={`btn-edit-fuel-${log.id}`}
                      onClick={() => handleOpenEdit(log)}
                      className="p-1.5 hover:bg-primary/10 rounded-lg text-primary hover:text-primary cursor-pointer transition-colors"
                      title="Edit fuel log"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteId(log.id);
                      }}
                      className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive cursor-pointer transition-colors"
                      title="Delete fuel log"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs py-2 bg-secondary/20 rounded-xl px-3 my-2">
                  <div>
                    <span className="text-muted-foreground">Litres Added:</span>{" "}
                    <span className="font-bold text-foreground">{log.liters} L</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount:</span>{" "}
                    <span className="font-mono font-medium text-foreground">Rs. {Number(log.amount_paid).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Odometer:</span>{" "}
                    <span className="font-mono font-bold text-foreground">
                      {meterVal > 0 ? `${meterVal.toLocaleString()} km` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type:</span>{" "}
                    <span className="font-semibold text-foreground">{log.is_full_tank ? "Full Tank" : "Part Fill"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>{renderRowStatusBadge(log)}</div>
                  {log.previous_odometer && Number(log.previous_odometer) > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      Prev Full Odo: {Number(log.previous_odometer).toLocaleString()} km
                    </span>
                  )}
                </div>

                {/* Missing Photos Warning Banner for Manager */}
                {!hasPhotos && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 mt-2">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <div>
                        <span>No proof photos attached (0/4)</span>
                        <p className="text-[10px] text-muted-foreground font-normal">Photos were missing or unsaved during driver submission</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAttachModal(log)}
                      className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs shrink-0"
                    >
                      <Camera className="w-3.5 h-3.5" /> Attach Proofs
                    </button>
                  </div>
                )}

                {/* Incomplete Photos Banner */}
                {hasPhotos && photoCount < 4 && (
                  <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-1.5 mt-1.5">
                    <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {photoCount}/4 photos attached (Incomplete proof)
                    </span>
                    <button
                      type="button"
                      onClick={() => openAttachModal(log)}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                    >
                      + Add Remaining
                    </button>
                  </div>
                )}

                {/* Clickable Photo Thumbnails */}
                {hasPhotos && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 mt-1 border-t border-border/40">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mr-1">
                      <Camera className="w-3 h-3 text-primary" /> Attached:
                    </span>
                    {log.before_meter_photo_url && (
                      <button
                        type="button"
                        onClick={() => openPhotos(log, 0)}
                        className="group flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/90 border border-border/60 hover:border-primary/50 px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer"
                        title="Click to view Before Meter photo"
                      >
                        <img
                          src={log.before_meter_photo_url}
                          alt="Before Meter"
                          className="w-5 h-5 rounded object-cover border border-border shrink-0"
                        />
                        <span className="text-muted-foreground group-hover:text-foreground font-medium">Before Meter</span>
                      </button>
                    )}
                    {log.pump_meter_photo_url && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = log.before_meter_photo_url ? 1 : 0;
                          openPhotos(log, idx);
                        }}
                        className="group flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/90 border border-border/60 hover:border-primary/50 px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer"
                        title="Click to view Pump Meter photo"
                      >
                        <img
                          src={log.pump_meter_photo_url}
                          alt="Pump Meter"
                          className="w-5 h-5 rounded object-cover border border-border shrink-0"
                        />
                        <span className="text-muted-foreground group-hover:text-foreground font-medium">Pump Meter</span>
                      </button>
                    )}
                    {log.meter_photo_url && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = [log.before_meter_photo_url, log.pump_meter_photo_url].filter(Boolean).length;
                          openPhotos(log, idx);
                        }}
                        className="group flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/90 border border-border/60 hover:border-primary/50 px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer"
                        title="Click to view After Meter photo"
                      >
                        <img
                          src={log.meter_photo_url}
                          alt="After Meter"
                          className="w-5 h-5 rounded object-cover border border-border shrink-0"
                        />
                        <span className="text-muted-foreground group-hover:text-foreground font-medium">After Meter</span>
                      </button>
                    )}
                    {log.bill_photo_url && (
                      <button
                        type="button"
                        onClick={() => {
                          const idx = [log.before_meter_photo_url, log.pump_meter_photo_url, log.meter_photo_url].filter(Boolean).length;
                          openPhotos(log, idx);
                        }}
                        className="group flex items-center gap-1.5 bg-secondary/40 hover:bg-secondary/90 border border-border/60 hover:border-primary/50 px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer"
                        title="Click to view Bill / Receipt"
                      >
                        <img
                          src={log.bill_photo_url}
                          alt="Bill"
                          className="w-5 h-5 rounded object-cover border border-border shrink-0"
                        />
                        <span className="text-muted-foreground group-hover:text-foreground font-medium">Bill / Receipt</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openAttachModal(log)}
                      className="ml-auto text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 font-semibold underline underline-offset-2 cursor-pointer"
                      title="Update or change attached photos"
                    >
                      <Camera className="w-3 h-3" /> Update Proofs
                    </button>
                  </div>
                )}
              </div>
            );

          })}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-foreground">Delete Fuel Log</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this fuel log entry?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-xl border border-border text-sm">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteFuelLog.mutateAsync(deleteId);
                    toast({ title: "Fuel log deleted" });
                  } finally {
                    setDeleteId(null);
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

      {/* Add / Edit Fuel Entry Modal (Fix 3, A5, O6, O7) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                {editLog ? (
                  <>
                    <Pencil className="w-4 h-4 text-primary" /> Edit Fuel Log
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-primary" /> Add Fuel Entry
                  </>
                )}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditLog(null);
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
              {/* Past Entry (Older than today) Toggle at Top (Fix 3 Mockup) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="font-bold text-foreground text-xs">Past entry (older than today)</p>
                    <p className="text-[10px] text-muted-foreground">
                      Placed by date · Does not overwrite the vehicle&apos;s live odometer
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.is_past_entry}
                  onChange={e => setForm(f => ({ ...f, is_past_entry: e.target.checked }))}
                  className="w-4 h-4 accent-primary rounded cursor-pointer"
                />
              </div>

              {/* Date and Time Inputs (Fix 3 & O6) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide flex items-center justify-between mb-1">
                    <span>Date *</span>
                    {form.date && (
                      <span className="text-[10px] font-mono text-primary normal-case">
                        {(() => { try { return format(parseISO(form.date), "dd-MM-yyyy"); } catch { return form.date; } })()}
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => {
                      const d = e.target.value;
                      setForm(f => ({
                        ...f,
                        date: d,
                        is_past_entry: d < todayStr ? true : f.is_past_entry,
                      }));
                    }}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Time *</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Vehicle *</label>
                  <select
                    value={form.vehicle_id}
                    onChange={e => {
                      const vId = e.target.value;
                      const v = vMap[vId];
                      setForm(f => ({
                        ...f,
                        vehicle_id: vId,
                        driver_id: v?.assigned_driver_id || f.driver_id,
                      }));
                    }}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">-- Select Vehicle --</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_no} ({v.model}) · Tank {v.tank_size || 45}L
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Driver</label>
                  <select
                    value={form.driver_id}
                    onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">-- Select Driver --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Odometer with Yellow Warning Banner for Past/Lower Readings (Fix 3 & O7) */}
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Odometer Reading (km) *</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 66923"
                  value={form.meter}
                  onChange={e => setForm(f => ({ ...f, meter: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
                <p className="text-[11px] text-primary mt-1 font-medium">
                  {lastOdometer !== null ? `Latest recorded reading: ${lastOdometer.toLocaleString()} km` : "No previous odometer recorded for this vehicle"}
                </p>

                {lastOdometer !== null && Number(form.meter) > 0 && Number(form.meter) < lastOdometer && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Lower than the latest reading ({lastOdometer.toLocaleString()} km). Allowed for a past entry. It is placed by date and does not change the vehicle&apos;s live km.
                    </span>
                  </div>
                )}

                {lastOdometer !== null && Number(form.meter) > lastOdometer + 500 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      More than 500 km higher than the latest reading (+{(Number(form.meter) - lastOdometer).toLocaleString()} km). Please double-check the odometer digits before saving.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Litres Added *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`Max ${vehicleTankSize}L`}
                    value={form.liters}
                    onChange={e => handleLitersChange(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Tank limit: {vehicleTankSize} L</p>
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Amount Paid (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount_paid}
                    onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Filled to the top? [No] [Yes] (Default: No — Fix 3 & A5) */}
              <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-xl border border-border">
                <div>
                  <p className="font-bold text-foreground">Filled to the top?</p>
                  <p className="text-[10px] text-muted-foreground">Default is No · KMPL calculated between full tanks</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_full_tank: false }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      !form.is_full_tank
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_full_tank: true }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      form.is_full_tank
                        ? "bg-emerald-500 text-black border-emerald-500"
                        : "bg-background text-muted-foreground border-border"
                    }`}
                  >
                    Yes
                  </button>
                </div>
              </div>

              {/* 4 Optional Photo Upload Boxes (Fix 3 & O6) */}
              <div className="space-y-1.5">
                <label className="font-bold text-muted-foreground uppercase tracking-wide block">
                  Photos (optional — upload from gallery or computer)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "1. Before", file: modalBeforeFile, prev: modalBeforePrev, setFile: setModalBeforeFile, setPrev: setModalBeforePrev, ref: modalBeforeRef },
                    { label: "2. Pump", file: modalPumpFile, prev: modalPumpPrev, setFile: setModalPumpFile, setPrev: setModalPumpPrev, ref: modalPumpRef },
                    { label: "3. After", file: modalMeterFile, prev: modalMeterPrev, setFile: setModalMeterFile, setPrev: setModalMeterPrev, ref: modalMeterRef },
                    { label: "4. Bill", file: modalBillFile, prev: modalBillPrev, setFile: setModalBillFile, setPrev: setModalBillPrev, ref: modalBillRef },
                  ].map(({ label, prev, setFile, setPrev, ref }) => (
                    <div key={label}>
                      <input
                        ref={ref}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => handleFileChange(e, setFile, setPrev)}
                      />
                      {prev ? (
                        <div className="relative h-16 rounded-xl overflow-hidden border border-emerald-500/50">
                          <img src={prev} alt={label} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => { setFile(null); setPrev(null); }}
                            className="absolute top-0.5 right-0.5 bg-black/80 text-white rounded-full px-1 text-[10px]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => ref.current?.click()}
                          className="w-full h-16 rounded-xl border border-dashed border-input hover:border-primary flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground text-[10px] font-semibold bg-background/50"
                        >
                          <Camera className="w-3.5 h-3.5 text-primary" />
                          <span>{label}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditLog(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs text-muted-foreground font-semibold hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50 hover:bg-primary/90 transition-colors shadow-sm"
              >
                {saving ? "Saving..." : (editLog ? "Update Fuel Log" : "Save Entry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach / Update Proof Photos Modal for Manager */}
      {attachModalLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  Attach / Update Proof Photos
                </h3>
                <p className="text-xs text-muted-foreground">
                  {vMap[attachModalLog.vehicle_id]?.vehicle_no || "Vehicle"} &bull; {attachModalLog.liters} L &bull; {attachModalLog.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !attachingProof && setAttachModalLog(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs text-muted-foreground">
                Attach proof photos (bill receipt, odometer before/after, pump meter) to this fuel entry. Images are uploaded and synced immediately.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "1. Before Meter", file: attachBeforeFile, prev: attachBeforePrev, setFile: setAttachBeforeFile, setPrev: setAttachBeforePrev, ref: attachBeforeRef },
                  { label: "2. Pump Meter", file: attachPumpFile, prev: attachPumpPrev, setFile: setAttachPumpFile, setPrev: setAttachPumpPrev, ref: attachPumpRef },
                  { label: "3. After Meter", file: attachMeterFile, prev: attachMeterPrev, setFile: setAttachMeterFile, setPrev: setAttachMeterPrev, ref: attachMeterRef },
                  { label: "4. Bill Receipt", file: attachBillFile, prev: attachBillPrev, setFile: setAttachBillFile, setPrev: setAttachBillPrev, ref: attachBillRef },
                ].map(({ label, prev, setFile, setPrev, ref }) => (
                  <div key={label} className="space-y-1">
                    <input
                      ref={ref}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => handleFileChange(e, setFile, setPrev)}
                    />
                    {prev ? (
                      <div className="relative h-24 rounded-xl overflow-hidden border border-emerald-500/50 ring-1 ring-emerald-500/30">
                        <img src={prev} alt={label} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1.5 py-0.5 text-[9px] text-emerald-400 font-bold flex items-center justify-between">
                          <span className="truncate">{label}</span>
                          <span>✓ Ready</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setFile(null); setPrev(null); }}
                          className="absolute top-1 right-1 bg-black/80 hover:bg-red-500 text-white rounded-full p-1 text-xs leading-none transition-colors cursor-pointer"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => ref.current?.click()}
                        className="w-full h-24 rounded-xl border-2 border-dashed border-input hover:border-primary flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground text-[11px] font-semibold bg-background transition-colors cursor-pointer"
                      >
                        <Camera className="w-5 h-5 text-primary" />
                        <span>{label}</span>
                        <span className="text-[9px] text-muted-foreground">Tap to add</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2 bg-muted/20">
              <button
                type="button"
                disabled={attachingProof}
                onClick={() => setAttachModalLog(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={attachingProof || (!attachBeforeFile && !attachPumpFile && !attachMeterFile && !attachBillFile)}
                onClick={handleSaveAttachedProofs}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {attachingProof ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Uploading & Saving...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Save & Upload Proofs
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggestion 3: Shared MultiPhotoViewer Modal */}
      {viewerPhotos && (
        <MultiPhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerPhotos(null)}
        />
      )}
    </div>
  );
}
