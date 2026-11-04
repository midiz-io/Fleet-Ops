import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVehiclesByDriver, useVehicles, getDriverDailyVehicleId, setDriverDailyVehicleId } from "@/hooks/use-vehicles";
import { useChecklists } from "@/hooks/use-checklists";
import { useDriverFuelLogs, useVehicleFuelLogs, useCreateFuelLog, useUpdateFuelLog, useFuelPrice, useFuelLogs, UUID_REGEX, tempToRealFuelLogIdMap } from "@/hooks/use-fuel";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Fuel, TrendingDown, TrendingUp, AlertTriangle, Camera, Plus, Clock, Gauge, AlertCircle, Eye, ExternalLink, Upload, Pencil, Check, Flag, Car } from "lucide-react";
import { format, parseISO } from "date-fns";
import { NumberPlateScanner } from "@/components/number-plate-scanner";
import { uploadImage, uploadMultipleImagesParallel, compressImage, blobToDataUrl, dataUrlToBlob } from "@/lib/image-upload";
import { saveFuelDraft, getFuelDraft, clearFuelDraft } from "@/hooks/use-fuel-draft";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculateFuelLogKmpl, evaluateFuelRowStatus } from "@/lib/fuel-calc";
import { MultiPhotoViewer, PhotoItem } from "@/components/multi-photo-viewer";
import { logAuditEvent } from "@/lib/audit-logger";
import { InAppCameraModal } from "@/components/in-app-camera-modal";
import { FuelSuccessModal, FuelSuccessData } from "@/components/fuel-success-modal";
import { notifyManagers } from "@/lib/whatsapp";

export function FuelLogPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const { data: vehicles } = useVehiclesByDriver(user?.id ?? null);
  const { data: allVehicles } = useVehicles();
  const { data: checklists } = useChecklists();
  const { data: driverFuelLogs, isLoading: driverLoading } = useDriverFuelLogs(user?.id ?? null);
  const { data: allSystemFuelLogs, isLoading: allLoading } = useFuelLogs();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"log" | "daily_summary">("log");
  const [selectedVehicleId, setSelectedVehicleId] = useState("all");

  const fuelLogs = isManager
    ? (selectedVehicleId && selectedVehicleId !== "all"
        ? allSystemFuelLogs?.filter(l => l.vehicle_id === selectedVehicleId)
        : allSystemFuelLogs)
    : driverFuelLogs;
  const isLoading = isManager ? allLoading : driverLoading;
  const [entryDate, setEntryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [entryTime, setEntryTime] = useState(() => format(new Date(), "HH:mm"));
  const [liters, setLiters] = useState("");
  const [beforeMeter, setBeforeMeter] = useState("");
  const [confirmHighMeter, setConfirmHighMeter] = useState("");
  const [isFullTank, setIsFullTank] = useState(false); // Default to No (Head Office Change 2 / Issue 4)
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Driver "Wrong? Tell manager" flag modal state (O4 & Fix 2)
  const [flagModalLog, setFlagModalLog] = useState<any | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flaggedLogIds, setFlaggedLogIds] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("fleet_flagged_fuel_logs") || "{}");
      } catch {
        return {};
      }
    }
    return {};
  });

  // Top Vehicle Selector in Add Fuel Form (prefilled with Today's Vehicle for the driver)
  const dailyVehicleId = useMemo(
    () => getDriverDailyVehicleId(user?.id, allVehicles || [], checklists || []),
    [user?.id, allVehicles, checklists]
  );

  const [formVehicleId, setFormVehicleId] = useState<string>("");

  useEffect(() => {
    if (!formVehicleId && dailyVehicleId) {
      setFormVehicleId(dailyVehicleId);
    }
  }, [dailyVehicleId, formVehicleId]);

  // Exclude hidden vehicles from pickers while preserving active / daily vehicle (Fix 8 / P9)
  const activeVehiclesList = useMemo(() => {
    return (allVehicles || []).filter(v => !v.is_hidden || v.id === formVehicleId || v.id === dailyVehicleId);
  }, [allVehicles, formVehicleId, dailyVehicleId]);

  // Photo viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerPhotos, setViewerPhotos] = useState<PhotoItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Missing / Update Proof modal state
  const [attachModalLog, setAttachModalLog] = useState<any | null>(null);
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

  // Photo uploads
  const [beforeMeterFile, setBeforeMeterFile] = useState<File | null>(null);
  const [beforeMeterPreview, setBeforeMeterPreview] = useState<string | null>(null);
  const [pumpMeterFile, setPumpMeterFile] = useState<File | null>(null);
  const [pumpMeterPreview, setPumpMeterPreview] = useState<string | null>(null);
  const [meterFile, setMeterFile] = useState<File | null>(null);
  const [meterPreview, setMeterPreview] = useState<string | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);

  const beforeMeterInputRef = useRef<HTMLInputElement>(null);
  const meterInputRef = useRef<HTMLInputElement>(null);
  const pumpMeterInputRef = useRef<HTMLInputElement>(null);
  const billInputRef = useRef<HTMLInputElement>(null);

  // In-app live camera modal state
  const [cameraModal, setCameraModal] = useState<{
    isOpen: boolean;
    title: string;
    target: "beforeMeter" | "pumpMeter" | "afterMeter" | "bill";
  }>({
    isOpen: false,
    title: "",
    target: "beforeMeter",
  });

  // Success alert modal state for driver
  const [successModalData, setSuccessModalData] = useState<FuelSuccessData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const vehicle = vehicles?.[0];
  const activeVehicle = (formVehicleId && allVehicles ? allVehicles.find(v => v.id === formVehicleId) : null)
    || (dailyVehicleId && allVehicles ? allVehicles.find(v => v.id === dailyVehicleId) : null)
    || (selectedVehicleId && selectedVehicleId !== "all" ? allVehicles?.find(v => v.id === selectedVehicleId) : null)
    || vehicle
    || allVehicles?.[0];
  const { data: vehicleAllLogs } = useVehicleFuelLogs(activeVehicle?.id ?? null);
  const createFuelLog = useCreateFuelLog();
  const updateFuelLog = useUpdateFuelLog();

  // 30-Day Fleet Average KMPL for active vehicle ((max_odo - min_odo) / total_litres)
  const thirtyDayKmpl = useMemo(() => {
    if (!vehicleAllLogs || vehicleAllLogs.length === 0) return null;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = vehicleAllLogs.filter(l => new Date(l.date).getTime() >= thirtyDaysAgo.getTime());
    if (recent.length < 2) return null;
    const odos = recent.map(l => Number(l.after_meter || l.before_meter || 0)).filter(o => o > 0);
    const totalLiters = recent.reduce((sum, l) => sum + (Number(l.liters) || 0), 0);
    if (odos.length < 2 || totalLiters <= 0) return null;
    const maxOdo = Math.max(...odos);
    const minOdo = Math.min(...odos);
    const dist = maxOdo - minOdo;
    if (dist <= 0) return null;
    return (dist / totalLiters).toFixed(2);
  }, [vehicleAllLogs]);

  // Persistent drafts per driver and vehicle in IndexedDB
  const draftKey = `fuel_draft_${user?.id || "anon"}_${activeVehicle?.id || "default"}`;
  const [hasDraft, setHasDraft] = useState(false);
  const [savedDraft, setSavedDraft] = useState<any>(null);

  useEffect(() => {
    getFuelDraft(draftKey).then(draft => {
      if (draft && (draft.liters || draft.beforeMeter || draft.beforeMeterPreview || draft.pumpMeterPreview)) {
        setHasDraft(true);
        setSavedDraft(draft);
      } else {
        setHasDraft(false);
        setSavedDraft(null);
      }
    }).catch(() => {});
  }, [draftKey]);

  const handleRestoreDraft = () => {
    if (!savedDraft) return;
    if (savedDraft.liters) setLiters(savedDraft.liters);
    if (savedDraft.beforeMeter) setBeforeMeter(savedDraft.beforeMeter);
    if (savedDraft.isFullTank !== undefined) setIsFullTank(savedDraft.isFullTank);
    if (savedDraft.entryDate) setEntryDate(savedDraft.entryDate);
    if (savedDraft.entryTime) setEntryTime(savedDraft.entryTime);

    // Reconstruct File objects from preserved draft data URLs (Fix A11)
    if (savedDraft.beforeMeterPreview) {
      setBeforeMeterPreview(savedDraft.beforeMeterPreview);
      if (savedDraft.beforeMeterPreview.startsWith("data:")) {
        try {
          const b = dataUrlToBlob(savedDraft.beforeMeterPreview);
          setBeforeMeterFile(new File([b], "before-meter.jpg", { type: "image/jpeg" }));
        } catch {}
      }
    }
    if (savedDraft.pumpMeterPreview) {
      setPumpMeterPreview(savedDraft.pumpMeterPreview);
      if (savedDraft.pumpMeterPreview.startsWith("data:")) {
        try {
          const b = dataUrlToBlob(savedDraft.pumpMeterPreview);
          setPumpMeterFile(new File([b], "pump-meter.jpg", { type: "image/jpeg" }));
        } catch {}
      }
    }
    if (savedDraft.meterPreview) {
      setMeterPreview(savedDraft.meterPreview);
      if (savedDraft.meterPreview.startsWith("data:")) {
        try {
          const b = dataUrlToBlob(savedDraft.meterPreview);
          setMeterFile(new File([b], "after-meter.jpg", { type: "image/jpeg" }));
        } catch {}
      }
    }
    if (savedDraft.billPreview) {
      setBillPreview(savedDraft.billPreview);
      if (savedDraft.billPreview.startsWith("data:")) {
        try {
          const b = dataUrlToBlob(savedDraft.billPreview);
          setBillFile(new File([b], "bill-receipt.jpg", { type: "image/jpeg" }));
        } catch {}
      }
    }

    setShowForm(true);
    setHasDraft(false);
    toast({ title: "Draft Restored ✓", description: "Your unfinished fuel entry and captured photos were restored safely." });
  };

  const handleDiscardDraft = async () => {
    await clearFuelDraft(draftKey).catch(() => {});
    setHasDraft(false);
    setSavedDraft(null);
    toast({ title: "Draft Discarded" });
  };

  // Edit Fuel Log modal state
  const [editModalLog, setEditModalLog] = useState<any | null>(null);
  const [editVehicleId, setEditVehicleId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLiters, setEditLiters] = useState("");
  const [editMeter, setEditMeter] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editIsFullTank, setEditIsFullTank] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = (log: any) => {
    let actualLog = log;
    if (!UUID_REGEX.test(log.id)) {
      const mappedId = tempToRealFuelLogIdMap.get(log.id);
      const pool = (isManager ? allSystemFuelLogs : vehicleAllLogs) || [];
      const match = pool.find((l: any) => 
        (mappedId && l.id === mappedId) ||
        (UUID_REGEX.test(l.id) && l.vehicle_id === log.vehicle_id && l.date === log.date)
      );
      if (match) actualLog = match;
    }
    setEditModalLog(actualLog);
    setEditVehicleId(actualLog.vehicle_id || activeVehicle?.id || "");
    setEditDate(actualLog.date || format(new Date(), "yyyy-MM-dd"));
    setEditTime(actualLog.created_at ? format(parseISO(actualLog.created_at), "HH:mm") : format(new Date(), "HH:mm"));
    setEditLiters(String(actualLog.liters || ""));
    const meterVal = String(actualLog.after_meter || actualLog.before_meter || "");
    setEditMeter(meterVal);
    setEditAmount(String(actualLog.amount_paid || ""));
    setEditIsFullTank(actualLog.is_full_tank ?? false);
  };

  const handleSaveEditModal = async () => {
    if (!editModalLog) return;
    const litersNum = parseFloat(editLiters);
    const meterNum = parseFloat(editMeter);
    const amountNum = parseFloat(editAmount);

    if (isNaN(litersNum) || litersNum <= 0) {
      toast({ title: "Invalid liters", description: "Liters added must be greater than 0", variant: "destructive" });
      return;
    }
    if (isNaN(meterNum) || meterNum <= 0) {
      toast({ title: "Invalid odometer reading", description: "Please enter a valid odometer number", variant: "destructive" });
      return;
    }

    const targetVehicle = allVehicles?.find(v => v.id === editVehicleId) || activeVehicle;
    const vTank = targetVehicle?.tank_size || tankCapacity;
    if (litersNum > vTank) {
      toast({
        title: "Fill exceeds tank capacity",
        description: `Entered ${litersNum} L exceeds vehicle tank size (${vTank} L). Please verify.`,
        variant: "destructive",
      });
      return;
    }

    setEditSaving(true);
    try {
      const logsForVehicle = (isManager ? allSystemFuelLogs : vehicleAllLogs) || [];
      const calcResult = calculateFuelLogKmpl(
        {
          vehicle_id: targetVehicle?.id || editModalLog.vehicle_id,
          date: editDate,
          meter: meterNum,
          liters: litersNum,
          is_full_tank: editIsFullTank,
          currentLogId: editModalLog.id,
        },
        logsForVehicle
      );

      const bench = targetVehicle?.benchmark_kmpl || benchmarkKmpl;
      const kmplVal = editIsFullTank && calcResult.kmpl !== null && calcResult.kmpl > 0 ? calcResult.kmpl : null;
      const isBelow = kmplVal !== null && kmplVal < bench * 0.75;

      const updates: any = {
        date: editDate,
        liters: litersNum,
        amount_paid: isNaN(amountNum) ? (litersNum * fuelPrice) : amountNum,
        before_meter: meterNum,
        after_meter: meterNum,
        is_full_tank: editIsFullTank,
        kmpl_calculated: kmplVal,
        below_benchmark: isBelow,
        previous_odometer: calcResult.previousFullOdo,
      };

      if (editTime) {
        updates.created_at = `${editDate}T${editTime}:00Z`;
      }

      if (editVehicleId && editVehicleId !== editModalLog.vehicle_id) {
        updates.vehicle_id = editVehicleId;
      }

      let targetId = editModalLog.id;
      if (!UUID_REGEX.test(targetId)) {
        const mapped = tempToRealFuelLogIdMap.get(targetId);
        if (mapped) targetId = mapped;
        else {
          const match = logsForVehicle.find((l: any) => 
            UUID_REGEX.test(l.id) &&
            l.vehicle_id === editModalLog.vehicle_id &&
            l.date === editModalLog.date
          );
          if (match) targetId = match.id;
        }
      }

      updates.vehicle_id = editVehicleId || editModalLog.vehicle_id;

      await updateFuelLog.mutateAsync({
        id: targetId,
        updates,
      });

      // Audit log entry for Manager fuel edit (Head Office requirement)
      try {
        await logAuditEvent({
          driver_id: user?.id,
          driver_name: user?.name,
          vehicle_id: targetVehicle?.id,
          vehicle_no: targetVehicle?.vehicle_no,
          action_type: "MANAGER_FUEL_EDIT",
          status: "success",
          odometer: meterNum,
          liters: litersNum,
          details: `Manager updated fuel log for ${targetVehicle?.vehicle_no}. Date/Time: ${editDate} ${editTime}, Odo: ${meterNum.toLocaleString()} km, Liters: ${litersNum} L, Cost: Rs. ${updates.amount_paid}, Full Tank: ${editIsFullTank ? "Yes" : "No"}.`,
        });
      } catch (e) {
        console.warn("Audit log error on fuel edit", e);
      }

      toast({
        title: "Fuel Log Updated ✓",
        description: `Successfully updated fuel log for ${targetVehicle?.vehicle_no || "vehicle"}. Saved automatically.`,
      });

      setEditModalLog(null);
    } catch (err: any) {
      toast({
        title: "Failed to update fuel log",
        description: err.message || "Please check connection.",
        variant: "destructive",
      });
    } finally {
      setEditSaving(false);
    }
  };

  const openAttachModal = (log: any) => {
    let actualLog = log;
    if (!UUID_REGEX.test(log.id)) {
      const mappedId = tempToRealFuelLogIdMap.get(log.id);
      const pool = (isManager ? allSystemFuelLogs : vehicleAllLogs) || [];
      const match = pool.find((l: any) => 
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
        toast({ title: "No new photos selected", description: "Please pick at least one photo to update." });
        setAttachingProof(false);
        return;
      }

      await Promise.all(uploads);

      let targetId = attachModalLog.id;
      if (!UUID_REGEX.test(targetId)) {
        const mapped = tempToRealFuelLogIdMap.get(targetId);
        if (mapped && UUID_REGEX.test(mapped)) {
          targetId = mapped;
        } else {
          const pool = (isManager ? allSystemFuelLogs : vehicleAllLogs) || [];
          const match = pool.find((l: any) => 
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

  // Dual fuel price
  const { data: fuelPrice = 392 } = useFuelPrice(activeVehicle?.fuel_type || "Diesel");
  const tankCapacity = activeVehicle?.tank_size || 45;
  const benchmarkKmpl = activeVehicle?.benchmark_kmpl || 14;
  const lastRecordedKm = activeVehicle?.current_km || 0;
  // Derived calculations
  const { calcValue, calcKm, calcKmpl, previousFullOdo } = useMemo(() => {
    const l = Number(liters) || 0;
    const bm = Number(beforeMeter) || 0;
    const value = l * fuelPrice;

    if (!activeVehicle?.id || !vehicleAllLogs || vehicleAllLogs.length === 0) {
      return { calcValue: value, calcKm: 0, calcKmpl: "0.00", previousFullOdo: null };
    }

    const result = calculateFuelLogKmpl(
      {
        vehicle_id: activeVehicle.id,
        date: entryDate || format(new Date(), "yyyy-MM-dd"),
        meter: bm,
        liters: l,
        is_full_tank: isFullTank,
      },
      vehicleAllLogs
    );

    return {
      calcValue: value,
      calcKm: result.distanceKm,
      calcKmpl: result.kmpl !== null ? result.kmpl.toFixed(2) : "0.00",
      previousFullOdo: result.previousFullOdo,
    };
  }, [liters, beforeMeter, fuelPrice, isFullTank, vehicleAllLogs, activeVehicle?.id, entryDate]);

  const estimatedRangeKm = liters
    ? Math.round(Number(liters) * Number(thirtyDayKmpl || benchmarkKmpl))
    : 0;

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setPrev: (s: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Pre-compress immediately to eliminate submit latency and prevent RAM crashes
        const compressed = await compressImage(file, 0.5, 1000);
        const readyFile = new File([compressed], file.name.replace(/\.[^/.]+$/, ".jpg"), {
          type: "image/jpeg",
        });
        const previewUrl = await blobToDataUrl(compressed);
        setFile(readyFile);
        setPrev(previewUrl);
      } catch {
        try {
          const previewUrl = await blobToDataUrl(file);
          setFile(file);
          setPrev(previewUrl);
        } catch {
          const previewUrl = URL.createObjectURL(file);
          setFile(file);
          setPrev(previewUrl);
        }
      }
    }
  };

  const handleCameraCapture = async (file: File, previewUrl: string) => {
    let stablePrev = previewUrl;
    if (previewUrl.startsWith("blob:")) {
      try {
        stablePrev = await blobToDataUrl(file);
      } catch {}
    }
    switch (cameraModal.target) {
      case "beforeMeter":
        setBeforeMeterFile(file);
        setBeforeMeterPreview(stablePrev);
        break;
      case "pumpMeter":
        setPumpMeterFile(file);
        setPumpMeterPreview(stablePrev);
        break;
      case "afterMeter":
        setMeterFile(file);
        setMeterPreview(stablePrev);
        break;
      case "bill":
        setBillFile(file);
        setBillPreview(stablePrev);
        break;
    }
  };

  const handleRemovePhoto = (
    preview: string | null,
    setFile: (f: File | null) => void,
    setPrev: (s: string | null) => void
  ) => {
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
    setFile(null);
    setPrev(null);
  };

  // Auto-save draft debounce into active vehicle's draft key
  useEffect(() => {
    if (!showForm) return;
    if (!liters && !beforeMeter && !beforeMeterPreview && !pumpMeterPreview && !meterPreview && !billPreview) return;
    const timeout = setTimeout(() => {
      saveFuelDraft(draftKey, {
        liters,
        beforeMeter,
        isFullTank,
        entryDate,
        entryTime,
        beforeMeterPreview,
        pumpMeterPreview,
        meterPreview,
        billPreview,
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [liters, beforeMeter, isFullTank, entryDate, entryTime, beforeMeterPreview, pumpMeterPreview, meterPreview, billPreview, draftKey, showForm]);

  const openViewerForLog = (log: any, photoIdx = 0) => {
    const photos: { label: string; url: string }[] = [];
    if (log.before_meter_photo_url) photos.push({ label: "1. Before meter", url: log.before_meter_photo_url });
    if (log.pump_meter_photo_url) photos.push({ label: "2. Pump meter", url: log.pump_meter_photo_url });
    if (log.meter_photo_url) photos.push({ label: "3. Odometer after", url: log.meter_photo_url });
    if (log.bill_photo_url) photos.push({ label: "4. Bill receipt", url: log.bill_photo_url });

    if (photos.length === 0) {
      toast({ title: "No photos attached to this fuel entry" });
      return;
    }

    const v = allVehicles?.find(veh => veh.id === log.vehicle_id) || activeVehicle;
    const title = `Fuel Photos - ${v?.vehicle_no || "Vehicle"} (${format(parseISO(log.date), "d MMM")})`;
    const viewerKey = `proof_photos_${log.id}`;
    const payload = { photos, title, initialIndex: photoIdx };

    try {
      localStorage.setItem(viewerKey, JSON.stringify(payload));
      sessionStorage.setItem(viewerKey, JSON.stringify(payload));
    } catch (e) {
      console.warn("Storage quota or error saving proof viewer photos", e);
    }

    // Open in-app MultiPhotoViewer immediately
    setViewerPhotos(photos);
    setViewerTitle(title);
    setViewerIndex(photoIdx);
    setViewerOpen(true);
  };

  const handleSubmit = async () => {
    if (!user || !activeVehicle) return;
    if (!liters || !beforeMeter || !entryDate) {
      toast({ title: "Odometer, Liters, and Date are required", variant: "destructive" });
      return;
    }

    // Strict validation: Ensure all 4 files are available, restoring from preview data URLs if needed (Fix A11)
    let f1 = beforeMeterFile;
    if (!f1 && beforeMeterPreview && beforeMeterPreview.startsWith("data:")) {
      try {
        const b = dataUrlToBlob(beforeMeterPreview);
        f1 = new File([b], "before-meter.jpg", { type: "image/jpeg" });
        setBeforeMeterFile(f1);
      } catch {}
    }
    let f2 = pumpMeterFile;
    if (!f2 && pumpMeterPreview && pumpMeterPreview.startsWith("data:")) {
      try {
        const b = dataUrlToBlob(pumpMeterPreview);
        f2 = new File([b], "pump-meter.jpg", { type: "image/jpeg" });
        setPumpMeterFile(f2);
      } catch {}
    }
    let f3 = meterFile;
    if (!f3 && meterPreview && meterPreview.startsWith("data:")) {
      try {
        const b = dataUrlToBlob(meterPreview);
        f3 = new File([b], "after-meter.jpg", { type: "image/jpeg" });
        setMeterFile(f3);
      } catch {}
    }
    let f4 = billFile;
    if (!f4 && billPreview && billPreview.startsWith("data:")) {
      try {
        const b = dataUrlToBlob(billPreview);
        f4 = new File([b], "bill-receipt.jpg", { type: "image/jpeg" });
        setBillFile(f4);
      } catch {}
    }

    if (!f1 || !f2 || !f3 || !f4) {
      const missing = [
        !f1 ? "1. Before Meter" : null,
        !f2 ? "2. Pump Meter" : null,
        !f3 ? "3. After Meter" : null,
        !f4 ? "4. Bill Receipt" : null,
      ].filter(Boolean).join(", ");
      toast({
        title: "All 4 Proof Photos Required 📸",
        description: `Please capture all 4 photos before submitting. Missing: ${missing}`,
        variant: "destructive",
      });
      return;
    }

    const litersNum = Number(liters);
    const meterNum = Number(beforeMeter);

    // Validation 1: Tank size check (Issue 13)
    if (litersNum > tankCapacity) {
      toast({
        title: "Fill exceeds tank capacity",
        description: `Entered ${litersNum} L exceeds vehicle tank size (${tankCapacity} L). Please verify.`,
        variant: "destructive",
      });
      return;
    }

    // Validation 2: Meter cannot be lower than last reading (Issue 7 & 13)
    if (lastRecordedKm > 0 && meterNum < lastRecordedKm) {
      toast({
        title: "Odometer lower than last record",
        description: `Entered ${meterNum.toLocaleString()} km is lower than the last recorded ${lastRecordedKm.toLocaleString()} km!`,
        variant: "destructive",
      });
      return;
    }

    // Validation 3: 500 km plausibility check (Fix 5)
    if (lastRecordedKm > 0 && meterNum - lastRecordedKm > 500) {
      if (Number(confirmHighMeter.trim()) !== meterNum) {
        toast({
          title: "Confirm High Mileage Jump",
          description: `Reading is ${(meterNum - lastRecordedKm).toLocaleString()} km higher than last (${lastRecordedKm.toLocaleString()} km). Please retype ${meterNum} in the confirmation box to confirm.`,
          variant: "destructive",
        });
        return;
      }
    }

    setSubmitting(true);
    setUploadProgress("Uploading 4 proof photos in real-time...");

    try {
      const kmplVal = isFullTank && Number(calcKmpl) > 0 ? Number(calcKmpl) : null;
      const isBelowBenchmark = kmplVal !== null && kmplVal < benchmarkKmpl * 0.75;

      // 1. Ultra-fast parallel upload of all 4 proof photos
      const [u1, u2, u3, u4] = await uploadMultipleImagesParallel(
        [
          { fileOrBlob: f1, label: "1. Before Meter" },
          { fileOrBlob: f2, label: "2. Pump Meter" },
          { fileOrBlob: f3, label: "3. After Meter" },
          { fileOrBlob: f4, label: "4. Bill Receipt" },
        ],
        (completed, total) => {
          setUploadProgress(`Uploading photos in parallel (${completed}/${total})...`);
        }
      );

      setUploadProgress("Saving fuel log to database...");
      await createFuelLog.mutateAsync({
        driver_id: user.id,
        vehicle_id: activeVehicle.id,
        date: entryDate,
        liters: litersNum,
        amount_paid: calcValue,
        previous_odometer: previousFullOdo || lastRecordedKm,
        before_meter: meterNum,
        fuel_pump_meter: 0,
        after_meter: meterNum,
        bill_meter: null,
        is_full_tank: isFullTank,
        kmpl_calculated: kmplVal,
        below_benchmark: isBelowBenchmark,
        before_meter_photo_url: u1,
        pump_meter_photo_url: u2,
        meter_photo_url: u3,
        bill_photo_url: u4,
      });

      // 2. Log single success event in audit log (no duplicate attempt entry — Fix A16)
      try {
        await logAuditEvent({
          driver_id: user.id,
          driver_name: user.name,
          vehicle_id: activeVehicle.id,
          vehicle_no: activeVehicle.vehicle_no,
          action_type: "FUEL_LOG_SUCCESS",
          status: "success",
          odometer: meterNum,
          liters: litersNum,
          photos_count: 4,
          details: `Fuel log saved successfully in real-time. All 4 photos uploaded. Odo: ${meterNum.toLocaleString()} km, Liters: ${litersNum} L, Rs. ${calcValue.toLocaleString()}.`,
        });
      } catch (e) {
        console.warn("Audit success log error", e);
      }

      // 3. Inform the driver via the animated Success Modal & haptics
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate([80, 40, 120]);
        } catch {}
      }

      const coverageKm = Math.round(litersNum * Number(thirtyDayKmpl || benchmarkKmpl));

      setSuccessModalData({
        vehicleNo: activeVehicle.vehicle_no,
        odometer: meterNum,
        liters: litersNum,
        amount: calcValue,
        isFullTank: isFullTank,
        kmpl: kmplVal,
        benchmarkKmpl: benchmarkKmpl,
        isBelowBenchmark: isBelowBenchmark,
        coverageKm,
        photos: [
          { label: "1. Before Meter", url: u1 },
          { label: "2. Pump Meter", url: u2 },
          { label: "3. After Meter", url: u3 },
          { label: "4. Bill Receipt", url: u4 },
        ],
        date: `${entryDate} ${entryTime || ""}`.trim(),
      });
      setShowSuccessModal(true);

      toast({
        title: "Fuel Log Saved ✓",
        description: isBelowBenchmark
          ? `${kmplVal} km/L is below benchmark (${benchmarkKmpl} km/L). Recorded with 4 photos.`
          : `Saved ${litersNum} L at Rs. ${calcValue.toLocaleString()} (≈ ${coverageKm} km coverage). All 4 photos uploaded.`,
      });

      // Clean up object URLs to free memory
      if (beforeMeterPreview?.startsWith("blob:")) URL.revokeObjectURL(beforeMeterPreview);
      if (pumpMeterPreview?.startsWith("blob:")) URL.revokeObjectURL(pumpMeterPreview);
      if (meterPreview?.startsWith("blob:")) URL.revokeObjectURL(meterPreview);
      if (billPreview?.startsWith("blob:")) URL.revokeObjectURL(billPreview);

      // Reset form on success
      setLiters("");
      setBeforeMeter("");
      setConfirmHighMeter("");
      setBeforeMeterFile(null);
      setBeforeMeterPreview(null);
      setPumpMeterFile(null);
      setPumpMeterPreview(null);
      setMeterFile(null);
      setMeterPreview(null);
      setBillFile(null);
      setBillPreview(null);
      setShowForm(false);
      clearFuelDraft(draftKey).catch(() => {});
    } catch (err: any) {
      // Log failure / timeout event in Audit Log with exact error & preserve photos!
      try {
        await logAuditEvent({
          driver_id: user.id,
          driver_name: user.name,
          vehicle_id: activeVehicle.id,
          vehicle_no: activeVehicle.vehicle_no,
          action_type: "FUEL_LOG_PHOTO_FAILED",
          status: "error",
          odometer: meterNum,
          liters: litersNum,
          photos_count: 4,
          details: `Upload interrupted during: ${uploadProgress || "Photo transfer"}. Photos preserved in app.`,
          error_message: err.message || "Network timeout or connection reset",
        });
      } catch (e) {
        console.warn("Audit failure log error", e);
      }

      toast({
        title: "Upload Interrupted ⚠️",
        description: `${err.message || "Network timeout"}. All 4 photos are safely kept in your form. Check your internet connection and tap Save Entry to retry!`,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  };

  // Driver "Wrong? Tell manager" flag handler (O4 & Fix 2)
  const handleSendFlagToManager = async () => {
    if (!flagModalLog || !user) return;
    const v = allVehicles?.find(veh => veh.id === flagModalLog.vehicle_id) || activeVehicle;
    const note = flagReason.trim() || "Driver reported a mistake on this fuel entry";
    const meterVal = Number(flagModalLog.after_meter || flagModalLog.before_meter || 0);

    try {
      await logAuditEvent({
        driver_id: user.id,
        driver_name: user.name,
        vehicle_id: v?.id,
        vehicle_no: v?.vehicle_no,
        action_type: "DRIVER_FUEL_ISSUE_FLAG",
        status: "warning",
        odometer: meterVal,
        liters: Number(flagModalLog.liters || 0),
        details: `Driver ${user.name} flagged fuel entry (${flagModalLog.date}, ${flagModalLog.liters} L, ${meterVal > 0 ? meterVal.toLocaleString() + " km" : "—"}): "${note}"`,
      });
    } catch {}

    const nextFlags = { ...flaggedLogIds, [flagModalLog.id]: note };
    setFlaggedLogIds(nextFlags);
    try {
      localStorage.setItem("fleet_flagged_fuel_logs", JSON.stringify(nextFlags));
    } catch {}

    const msg = `*Fuel Entry Correction Needed*\n\nDriver: *${user.name}*\nVehicle: *${v?.vehicle_no || "Vehicle"}*\nDate: ${flagModalLog.date}\nEntry: ${flagModalLog.liters} L · Rs. ${Number(flagModalLog.amount_paid || 0).toLocaleString()} · ${meterVal > 0 ? meterVal.toLocaleString() + " km" : "—"}\nNote: *${note}*`;
    notifyManagers(msg);

    toast({
      title: "Manager Notified ✓",
      description: "Your correction note was sent to the Manager.",
    });
    setFlagModalLog(null);
    setFlagReason("");
  };

  // Sort logs by date and time, newest first (Issue 2 & Suggestion 1)
  const sortedLogs = useMemo(() => {
    return [...(fuelLogs || [])].sort((a, b) => {
      const aTime = new Date(a.created_at || a.date).getTime();
      const bTime = new Date(b.created_at || b.date).getTime();
      return bTime - aTime;
    });
  }, [fuelLogs]);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Header (Grey vehicle/price subtitle removed per O3) */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">Fuel Log</h1>
            {isManager && (
              <span className="text-[10px] bg-primary/15 text-primary border border-primary/30 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Pencil className="w-2.5 h-2.5" /> Manager Mode
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-xl active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancel" : "Add Entry"}
        </button>
      </div>

      {/* Today's Vehicle Chip for Driver (Fix 1 & A4) */}
      {!isManager && activeVehicle && (
        <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Car className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                Today&apos;s vehicle
              </span>
              <span className="text-xs font-extrabold font-mono text-foreground">
                {activeVehicle.vehicle_no}
              </span>
              <span className="text-xs text-muted-foreground ml-1.5">
                &middot; {activeVehicle.model} &middot; {Number(activeVehicle.current_km || 0).toLocaleString()} km
              </span>
            </div>
          </div>
          {allVehicles && allVehicles.length > 1 && (
            <select
              value={activeVehicle.id}
              onChange={e => {
                setFormVehicleId(e.target.value);
                if (user?.id) {
                  setDriverDailyVehicleId(user.id, e.target.value);
                }
              }}
              aria-label="Other vehicle"
              className="bg-background border border-emerald-500/30 rounded-lg px-2 py-1 text-[11px] font-bold text-emerald-400 focus:outline-none cursor-pointer shrink-0"
            >
              {activeVehiclesList.map(v => (
                <option key={v.id} value={v.id} className="text-foreground bg-background">
                  {v.id === activeVehicle.id ? `Other vehicle ▾ (${v.vehicle_no})` : `${v.vehicle_no} · ${v.model}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Vehicle filter / manager controls */}
      {isManager && allVehicles && allVehicles.length > 0 && (
        <div className="px-4 py-2.5 bg-card/60 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Vehicle:</span>
            <select
              value={selectedVehicleId}
              onChange={e => setSelectedVehicleId(e.target.value)}
              className="bg-background border border-input rounded-xl px-2.5 py-1 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Fleet Vehicles ({allSystemFuelLogs?.length || 0})</option>
              {allVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_no} ({v.model})
                </option>
              ))}
            </select>
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            Tap <span className="text-primary font-bold">Edit</span> on any log below to update details
          </span>
        </div>
      )}

      {/* Unfinished Draft Safe Alert Banner */}
      {hasDraft && !showForm && (
        <div className="mx-4 mt-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-300">Your entry is safe</p>
              <p className="text-[11px] text-muted-foreground">You have an unfinished fuel draft for {activeVehicle?.vehicle_no}.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:bg-secondary cursor-pointer"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shadow-sm cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Add Fuel Form */}
      {showForm && (
        <div className="p-4 bg-card border-b border-border space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">New Fuel Entry</span>
            <span className="text-xs text-muted-foreground">
              Tank: {tankCapacity} L &bull; Benchmark: {benchmarkKmpl} km/L
            </span>
          </div>

          {/* Vehicle Box at Top of Form */}
          <div className="bg-secondary/40 p-3 rounded-xl border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-primary" /> Vehicle for This Fill *
              </label>
              <span className="text-[10px] text-muted-foreground">
                30-Day Avg: <strong className="text-foreground">{thirtyDayKmpl || benchmarkKmpl} km/L</strong>
              </span>
            </div>
            <select
              value={activeVehicle?.id || ""}
              onChange={e => {
                setFormVehicleId(e.target.value);
              }}
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {activeVehiclesList.map(v => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_no} - {v.model} ({v.fuel_type || "Diesel"}, Live: {Number(v.current_km || 0).toLocaleString()} km)
                </option>
              ))}
            </select>
          </div>

          {/* Odometer Input with Last Reading & 500 km Plausibility Check (Fix 5) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Odometer Reading (km) *
              </label>
              <NumberPlateScanner
                buttonLabel="Scan Meter"
                onScanComplete={(readMeter) => setBeforeMeter(readMeter)}
              />
            </div>
            <input
              type="number"
              placeholder={`e.g. ${lastRecordedKm > 0 ? lastRecordedKm + 50 : 66783}`}
              value={beforeMeter}
              onChange={e => setBeforeMeter(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono text-base font-bold"
            />
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">
                Last recorded: <strong className="text-foreground">{lastRecordedKm.toLocaleString()} km</strong> ({activeVehicle?.vehicle_no})
              </span>
              {Number(beforeMeter) > 0 && lastRecordedKm > 0 && (
                <span className={Number(beforeMeter) >= lastRecordedKm ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                  {Number(beforeMeter) >= lastRecordedKm
                    ? `+${(Number(beforeMeter) - lastRecordedKm).toLocaleString()} km`
                    : `⚠️ Lower than last!`}
                </span>
              )}
            </div>

            {/* Plausibility Confirmation Prompt: > 500 km jump (Fix 5) */}
            {Number(beforeMeter) > lastRecordedKm + 500 && lastRecordedKm > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>High mileage check (+{(Number(beforeMeter) - lastRecordedKm).toLocaleString()} km):</strong> More than 500 km above last reading ({lastRecordedKm.toLocaleString()} km). Retype reading below to confirm:
                  </span>
                </div>
                <input
                  type="number"
                  placeholder={`Retype ${beforeMeter} to confirm`}
                  value={confirmHighMeter}
                  onChange={e => setConfirmHighMeter(e.target.value)}
                  className="w-full bg-background border border-amber-500/40 rounded-lg px-3 py-1.5 text-foreground font-mono text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
            )}
          </div>

          {/* Liters Added & Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Liters Added *
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 30.6"
                value={liters}
                onChange={e => setLiters(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono text-base font-bold"
              />
              {Number(liters) > tankCapacity && (
                <p className="text-[11px] text-red-400 mt-1 font-semibold">
                  Warning: Exceeds {tankCapacity} L tank size!
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Amount (Rs.)
              </label>
              <div className="w-full bg-secondary/50 border border-input rounded-xl px-3 py-2 text-foreground text-sm font-mono font-bold flex items-center justify-between">
                <span>Rs. {calcValue.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground font-normal">@{fuelPrice}/L</span>
              </div>
            </div>
          </div>

          {/* Full Tank Toggle (Default: No) with 30-Day Average Display */}
          <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-xl border border-border">
            <div>
              <p className="text-xs font-bold text-foreground">Filled to the top?</p>
              <p className="text-[11px] text-muted-foreground">
                {isFullTank
                  ? "Full Tank ✓ (KMPL calculated to next full tank)"
                  : `Part Fill (Default: No) · 30-Day Fleet Avg: ${thirtyDayKmpl || benchmarkKmpl} km/L`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsFullTank(!isFullTank)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isFullTank
                  ? "bg-emerald-500 text-black border-emerald-500 shadow-sm"
                  : "bg-background text-muted-foreground border-border"
              }`}
            >
              {isFullTank ? "Full Tank ✓" : "No (Part Fill)"}
            </button>
          </div>

          {/* Photo uploads strip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                Required Proof Photos <span className="text-red-400 font-extrabold">(All 4 Required *)</span>
              </label>
              <span className={`text-[11px] font-bold ${
                [beforeMeterPreview, pumpMeterPreview, meterPreview, billPreview].filter(Boolean).length === 4
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}>
                {[beforeMeterPreview, pumpMeterPreview, meterPreview, billPreview].filter(Boolean).length}/4 Captured
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "1. Before Meter", file: beforeMeterFile, preview: beforeMeterPreview, setFile: setBeforeMeterFile, setPrev: setBeforeMeterPreview, ref: beforeMeterInputRef, target: "beforeMeter" as const },
                { label: "2. Pump Meter", file: pumpMeterFile, preview: pumpMeterPreview, setFile: setPumpMeterFile, setPrev: setPumpMeterPreview, ref: pumpMeterInputRef, target: "pumpMeter" as const },
                { label: "3. After Meter", file: meterFile, preview: meterPreview, setFile: setMeterFile, setPrev: setMeterPreview, ref: meterInputRef, target: "afterMeter" as const },
                { label: "4. Bill Receipt", file: billFile, preview: billPreview, setFile: setBillFile, setPrev: setBillPreview, ref: billInputRef, target: "bill" as const },
              ].map(({ label, preview, setFile, setPrev, ref, target }) => (
                <div key={label} className="space-y-1">
                  <input
                    ref={ref}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => handleFileChange(e, setFile, setPrev)}
                  />
                  {preview ? (
                    <div className="relative h-24 rounded-xl overflow-hidden border border-emerald-500/50 ring-1 ring-emerald-500/30 group bg-black/40">
                      <img src={preview} alt={label} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/85 px-1.5 py-0.5 text-[9px] text-emerald-400 font-bold flex items-center justify-between">
                        <span className="truncate">{label}</span>
                        <span>✓ Ready</span>
                      </div>
                      <div className="absolute top-1 right-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCameraModal({ isOpen: true, title: `Retake: ${label}`, target })}
                          className="bg-black/75 hover:bg-black text-white rounded-full p-1 text-[10px] leading-none transition-colors"
                          title="Retake camera photo"
                        >
                          <Camera className="w-3 h-3 text-emerald-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(preview, setFile, setPrev)}
                          className="absolute-none bg-black/80 hover:bg-red-500 text-white rounded-full p-1 text-xs leading-none transition-colors"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 rounded-xl border-2 border-dashed border-red-500/40 hover:border-primary flex flex-col items-center justify-between p-2 bg-background/50 hover:bg-secondary/30 transition-all">
                      <button
                        type="button"
                        onClick={() => setCameraModal({ isOpen: true, title: `Capture: ${label}`, target })}
                        className="w-full flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground text-[10px] font-semibold"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                          <Camera className="w-4 h-4" />
                        </div>
                        <span className="truncate max-w-[85px]">{label}</span>
                        <span className="text-[9px] text-red-400 font-bold">In-App Camera *</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
                        className="text-[9px] text-muted-foreground hover:text-primary underline pt-0.5"
                      >
                        or upload file
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {[beforeMeterPreview, pumpMeterPreview, meterPreview, billPreview].filter(Boolean).length === 4 && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300 font-semibold animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All 4 proof photos ready! Tap below to submit in real-time.</span>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-xs font-semibold hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex-1 font-extrabold py-3 rounded-xl text-xs shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                [beforeMeterPreview, pumpMeterPreview, meterPreview, billPreview].filter(Boolean).length === 4
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                  : "bg-primary text-primary-foreground shadow-primary/20"
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {uploadProgress || "Submitting in real-time..."}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Submit Fuel Entry (Real-time)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Fuel History List */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Fuel History ({sortedLogs.length})
          </h2>
          <span className="text-xs text-muted-foreground">Newest first &bull; Sri Lanka Time</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : sortedLogs.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Fuel className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No fuel logs yet</p>
            <p className="text-xs">Tap "+ Add Entry" above to log fuel fill.</p>
          </div>
        ) : (
          sortedLogs.map(log => {
            const evalStatus = evaluateFuelRowStatus(
              log,
              allVehicles || [],
              allSystemFuelLogs || driverFuelLogs || []
            );
            const rowVehicle = allVehicles?.find(v => v.id === log.vehicle_id);
            const meterVal = Number(log.after_meter || log.before_meter || 0);

            // Unified 100% identical badge across Driver and Manager (Fix A6)
            let kmplBadge = null;
            if (evalStatus.status === "good") {
              kmplBadge = (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> {evalStatus.badgeText}
                </span>
              );
            } else if (evalStatus.status === "below") {
              kmplBadge = (
                <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full border border-red-400/20 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> {evalStatus.badgeText}
                </span>
              );
            } else if (evalStatus.status === "full_base") {
              kmplBadge = (
                <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20">
                  {evalStatus.badgeText}
                </span>
              );
            } else {
              kmplBadge = (
                <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  {evalStatus.badgeText}
                </span>
              );
            }

            const photoCount = [log.before_meter_photo_url, log.pump_meter_photo_url, log.meter_photo_url, log.bill_photo_url].filter(Boolean).length;
            const hasPhotos = photoCount > 0;
            const flaggedNote = flaggedLogIds[log.id];

            return (
              <div key={log.id} className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Fuel className="w-4 h-4 text-blue-400" />
                      {/* Always show vehicle number on every row for drivers too (Fix O4) */}
                      <span className="text-[11px] bg-primary/15 text-primary font-extrabold font-mono px-2 py-0.5 rounded border border-primary/25">
                        {rowVehicle?.vehicle_no || activeVehicle?.vehicle_no || "Vehicle"}
                      </span>
                      <span className="font-bold text-foreground text-sm">{log.liters} L</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        Rs. {Number(log.amount_paid).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Odometer:{" "}
                      {meterVal > 0 ? (
                        <>
                          {log.previous_odometer && Number(log.previous_odometer) > 0 && log.is_full_tank
                            ? `${Number(log.previous_odometer).toLocaleString()} → `
                            : ""}
                          <span className="font-mono font-bold text-foreground">{meterVal.toLocaleString()} km</span>
                        </>
                      ) : (
                        <span className="font-mono text-muted-foreground">&mdash;</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-bold text-foreground">
                      {format(parseISO(log.date), "dd MMM yyyy")}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-primary" />
                      {log.created_at ? format(parseISO(log.created_at), "h:mm a") : "12:00 PM"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {kmplBadge}
                    {flaggedNote && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        Flagged to manager
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasPhotos && (
                      <button
                        onClick={() => openViewerForLog(log, 0)}
                        className="text-xs font-bold text-primary hover:bg-primary/20 flex items-center gap-1.5 bg-primary/10 px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                        title="View all attached photos"
                      >
                        <Eye className="w-3.5 h-3.5" /> Photos ({photoCount}/4)
                      </button>
                    )}
                    {isManager ? (
                      <button
                        type="button"
                        data-testid={`btn-edit-log-${log.id}`}
                        onClick={() => openEditModal(log)}
                        className="text-xs font-bold text-foreground hover:text-primary bg-secondary/80 hover:bg-secondary border border-border px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                        title="Edit this fuel log entry"
                      >
                        <Pencil className="w-3.5 h-3.5 text-primary" /> Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFlagModalLog(log);
                          setFlagReason(flaggedNote || "");
                        }}
                        className="text-[11px] font-bold text-amber-400 hover:bg-amber-500/20 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        title="Flag an issue on this entry for the manager to fix"
                      >
                        <Flag className="w-3 h-3" /> Wrong? Tell manager
                      </button>
                    )}
                  </div>
                </div>

                {/* Missing Photos Warning Banner (When no photos attached) */}
                {!hasPhotos && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mt-1.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-400">No Proof Photos Attached (0/4)</p>
                        <p className="text-[11px] text-muted-foreground">Proof photos were not saved or need re-attaching</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAttachModal(log)}
                      className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
                    >
                      <Camera className="w-3.5 h-3.5" /> Attach Proofs Now
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
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                    {log.before_meter_photo_url && (
                      <button
                        type="button"
                        onClick={() => openViewerForLog(log, 0)}
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
                          openViewerForLog(log, idx);
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
                          openViewerForLog(log, idx);
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
                          openViewerForLog(log, idx);
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
          })
        )}
      </div>

      {/* Attach / Update Proof Photos Modal */}
      {attachModalLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  Attach Proof Photos
                </h3>
                <p className="text-xs text-muted-foreground">
                  {attachModalLog.liters} L &bull; {format(parseISO(attachModalLog.date), "MMM d, yyyy")} &bull; {Number(attachModalLog.after_meter || attachModalLog.before_meter).toLocaleString()} km
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
                Capture or upload the missing proof photos for this fuel log. Once uploaded, managers and system records will immediately display them.
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

      {/* Edit Fuel Entry Modal */}
      {editModalLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Edit Fuel Entry
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {allVehicles?.find(v => v.id === editVehicleId)?.vehicle_no || activeVehicle?.vehicle_no} &bull; {editDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !editSaving && setEditModalLog(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Vehicle selector (for manager or fleet switcher) */}
              {isManager && allVehicles && allVehicles.length > 0 && (
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                    Vehicle *
                  </label>
                  <select
                    value={editVehicleId}
                    onChange={e => setEditVehicleId(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {activeVehiclesList.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_no} ({v.model}) · Tank {v.tank_size || 45}L
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                    Fill Date *
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                    Fill Time *
                  </label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={e => setEditTime(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Odometer reading */}
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                  Odometer Reading (km) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editMeter}
                  onChange={e => setEditMeter(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 66800"
                />
                {editModalLog.previous_odometer && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Previous full tank odometer: {Number(editModalLog.previous_odometer).toLocaleString()} km
                    {Number(editMeter) > Number(editModalLog.previous_odometer) && (
                      <span className="text-emerald-400 font-semibold ml-1">
                        (+{(Number(editMeter) - Number(editModalLog.previous_odometer)).toLocaleString()} km driven)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Liters & Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                    Liters Added (L) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editLiters}
                    onChange={e => {
                      const val = e.target.value;
                      setEditLiters(val);
                      const l = parseFloat(val) || 0;
                      if (l > 0) {
                        setEditAmount((l * fuelPrice).toFixed(2));
                      }
                    }}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g. 35.5"
                  />
                </div>

                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                    Amount Paid (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g. 13916"
                  />
                </div>
              </div>

              {/* Full Tank Toggle */}
              <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-xl border border-border">
                <div>
                  <p className="text-xs font-bold text-foreground">Full Tank Refill?</p>
                  <p className="text-[11px] text-muted-foreground">
                    KMPL is computed between consecutive full tanks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsFullTank(!editIsFullTank)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    editIsFullTank
                      ? "bg-emerald-500 text-black border-emerald-500 shadow-sm"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {editIsFullTank ? "Full Tank ✓" : "Partial Fill"}
                </button>
              </div>

              {/* Quick Proof Photos Link */}
              <div className="p-3 bg-secondary/20 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-primary" /> Proof Photos Attached
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {[editModalLog.before_meter_photo_url, editModalLog.pump_meter_photo_url, editModalLog.meter_photo_url, editModalLog.bill_photo_url].filter(Boolean).length}/4 photos attached
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const l = editModalLog;
                    setEditModalLog(null);
                    openAttachModal(l);
                  }}
                  className="text-xs text-primary font-bold hover:underline cursor-pointer"
                >
                  Manage Photos &rarr;
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex gap-2 bg-muted/20">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => setEditModalLog(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={handleSaveEditModal}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {editSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Save & Update Log
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver "Wrong? Tell manager" Modal (O4 & Fix 2) */}
      {flagModalLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-foreground">Wrong? Tell Manager</h3>
              </div>
              <button
                type="button"
                onClick={() => setFlagModalLog(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Drivers cannot edit saved fuel logs directly. Tell the manager what needs fixing on this entry ({flagModalLog.date} &bull; {flagModalLog.liters} L):
            </p>
            <textarea
              rows={3}
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
              placeholder="e.g. Typed 66899 instead of 66799 km, or forgot to tick Full Tank..."
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFlagModalLog(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendFlagToManager}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold shadow-sm"
              >
                Send to Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Multi-Photo Viewer Modal */}
      <MultiPhotoViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={viewerTitle}
        photos={viewerPhotos}
        initialIndex={viewerIndex}
      />

      {/* In-App Live Camera Viewfinder Modal */}
      <InAppCameraModal
        isOpen={cameraModal.isOpen}
        title={cameraModal.title}
        onCapture={handleCameraCapture}
        onClose={() => setCameraModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Driver Real-Time Success Alert Modal */}
      <FuelSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        data={successModalData}
      />
    </div>
  );
}
