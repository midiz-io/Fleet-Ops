import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useVehiclesByDriver,
  useVehicles,
  useUpdateVehicle,
  getDriverDailyVehicleId,
  setDriverDailyVehicleId,
  getTodaySriLankaDate,
} from "@/hooks/use-vehicles";
import { useCreateChecklist, useDriverChecklists } from "@/hooks/use-checklists";
import { useToast } from "@/hooks/use-toast";
import { uploadImage, compressImage } from "@/lib/image-upload";
import { Camera, CheckCircle, AlertTriangle, Car, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { isToday, parseISO, parse, differenceInMinutes, isValid } from "date-fns";
import { NumberPlateScanner } from "@/components/number-plate-scanner";
import { notifyManagers } from "@/lib/whatsapp";
import { useTasks } from "@/hooks/use-tasks";
import { useShifts } from "@/hooks/use-shifts";
import { useCreateRepair } from "@/hooks/use-repairs";
import { logAuditEvent } from "@/lib/audit-logger";

type OilStatus = "ok" | "low" | "needs_change";

export function ChecklistPage() {
  const { user } = useAuth();
  const createRepair = useCreateRepair();
  const { data: vehicles } = useVehiclesByDriver(user?.id ?? null);
  const { data: checklists } = useDriverChecklists(user?.id ?? null);
  const { data: allVehicles } = useVehicles();
  const updateVehicle = useUpdateVehicle();
  const { tasks } = useTasks(user?.id);
  const { shifts } = useShifts();
  const createChecklist = useCreateChecklist();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const urlVehicleId = searchParams.get("vehicleId") || "";
  const type = searchParams.get("type") || "start";
  const isEndShift = type === "end";

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => {
    if (urlVehicleId) return urlVehicleId;
    return getDriverDailyVehicleId(user?.id, null, null);
  });
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);
  const [meterReading, setMeterReading] = useState("");
  const [confirmMeterReading, setConfirmMeterReading] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [oilStatus, setOilStatus] = useState<OilStatus>("ok");
  const [tyresOk, setTyresOk] = useState(true);
  const [lightsOk, setLightsOk] = useState(true);
  const [brakesOk, setBrakesOk] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Sync initial vehicle from URL or shared daily vehicle state (Fix 1 / A4 / O2 / O8)
  useEffect(() => {
    if (urlVehicleId) {
      setSelectedVehicleId(urlVehicleId);
      if (user?.id) {
        setDriverDailyVehicleId(user.id, urlVehicleId);
      }
      return;
    }
    if (!selectedVehicleId && user?.id && allVehicles && allVehicles.length > 0) {
      const dailyId = getDriverDailyVehicleId(user.id, allVehicles, checklists);
      if (dailyId) {
        setSelectedVehicleId(dailyId);
      }
    }
  }, [urlVehicleId, user?.id, allVehicles, checklists, selectedVehicleId]);

  const activeVehicle =
    allVehicles?.find(v => v.id === selectedVehicleId) ||
    vehicles?.[0] ||
    null;

  const lastOdometer = Number(activeVehicle?.current_km) || 0;
  const enteredOdo = Number(meterReading) || 0;
  const isLowerThanLast = meterReading !== "" && lastOdometer > 0 && enteredOdo < lastOdometer;
  const isOver500KmJump = meterReading !== "" && lastOdometer > 0 && enteredOdo - lastOdometer > 500;
  const isJumpConfirmed = !isOver500KmJump || confirmMeterReading.trim() === meterReading.trim();

  const todayStr = getTodaySriLankaDate();
  const todayChecklists =
    checklists?.filter(c => c.date === todayStr || isToday(parseISO(c.submitted_at))) || [];

  // Allow checklist if switching to a new vehicle today
  const hasStartChecklist = activeVehicle
    ? todayChecklists.some(c => c.vehicle_id === activeVehicle.id)
    : todayChecklists.length > 0 && !urlVehicleId;
  const hasEndChecklist = todayChecklists.length > 1 && isEndShift;

  const pendingTasks = tasks.filter(
    t =>
      t.status !== "done" &&
      t.status !== "cancelled" &&
      t.status !== "unfinished" &&
      (t.startDate === todayStr || t.dueDate === todayStr)
  );
  const hasPendingTasks = pendingTasks.length > 0;

  let overtimeHours = 0;
  let otString = "";
  if (isEndShift && shifts && user) {
    const driverShiftStr = shifts[user.id]?.shift;
    if (driverShiftStr) {
      const parts = driverShiftStr.split("-");
      if (parts.length === 2) {
        const endTimeStr = parts[1].trim();
        const endDateTime = parse(endTimeStr, "h:mm a", new Date());
        if (isValid(endDateTime)) {
          const diff = differenceInMinutes(new Date(), endDateTime);
          if (diff > 0) {
            overtimeHours = Math.round((diff / 60) * 10) / 10;
            otString = `\nOT: ${overtimeHours} hours`;
          }
        }
      }
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 0.5, 1000);
        const compressedFile = new File([compressed], file.name || "meter.jpg", { type: "image/jpeg" });
        setPhotoFile(compressedFile);
        const reader = new FileReader();
        reader.onload = () => setPhotoPreview(reader.result as string);
        reader.readAsDataURL(compressed);
      } catch {
        setPhotoFile(file);
        const reader = new FileReader();
        reader.onload = () => setPhotoPreview(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSelectVehicle = (vid: string) => {
    setSelectedVehicleId(vid);
    setConfirmMeterReading("");
    setShowVehicleSwitcher(false);
    if (user?.id && vid) {
      setDriverDailyVehicleId(user.id, vid);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!activeVehicle) {
      toast({
        title: "Please select a vehicle",
        description: "Select a vehicle before submitting.",
        variant: "destructive",
      });
      return;
    }

    const numReading = Number(meterReading);
    if (!meterReading || isNaN(numReading) || numReading <= 0) {
      toast({
        title: "Valid Meter Reading Required",
        description: "Please enter the current odometer reading in km.",
        variant: "destructive",
      });
      return;
    }

    if (lastOdometer > 0 && numReading < lastOdometer) {
      toast({
        title: "Reading Lower Than Last Recorded",
        description: `Entered reading (${numReading.toLocaleString()} km) cannot be less than last recorded reading (${lastOdometer.toLocaleString()} km). Please check the meter or ask a Manager to fix the odometer.`,
        variant: "destructive",
      });
      return;
    }

    if (isOver500KmJump && !isJumpConfirmed) {
      toast({
        title: "Confirm Large Odometer Jump",
        description: `Reading is ${(numReading - lastOdometer).toLocaleString()} km above last reading (${lastOdometer.toLocaleString()} km). Please retype the reading in the confirmation box.`,
        variant: "destructive",
      });
      return;
    }

    const hasIssues = oilStatus !== "ok" || !tyresOk || !lightsOk || !brakesOk;
    if (!photoFile) {
      toast({
        title: "Meter Photo Required",
        description: "Please capture or attach a photo of the odometer meter before submitting the checklist.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    let isOfflineSaved = false;
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        try {
          photoUrl = await uploadImage(photoFile);
        } catch (uploadErr) {
          console.warn("Checklist photo upload timed out, falling back to local phone storage:", uploadErr);
          isOfflineSaved = true;
          try {
            if (photoPreview) {
              localStorage.setItem(`offline_cl_photo_${user.id}_${todayStr}`, photoPreview);
            }
          } catch {}
          photoUrl = photoPreview?.slice(0, 300) || "saved_on_phone";
        }
      }

      let gpsLat: number | null = null;
      let gpsLng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        gpsLat = pos.coords.latitude;
        gpsLng = pos.coords.longitude;
      } catch {
        /* GPS optional */
      }

      // Persist Today's Vehicle for this driver so Home, Fuel Log, Tasks, and End Day stay synced (Fix 1)
      setDriverDailyVehicleId(user.id, activeVehicle.id);

      await createChecklist.mutateAsync({
        driver_id: user.id,
        vehicle_id: activeVehicle.id,
        date: todayStr,
        meter_reading: numReading,
        meter_photo_url: photoUrl,
        oil_status: oilStatus,
        tyres_ok: tyresOk,
        lights_ok: lightsOk,
        brakes_ok: brakesOk,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
        submitted_at: new Date().toISOString(),
      });

      // Update vehicle's live km & assigned driver in settings/DB safely
      try {
        await updateVehicle.mutateAsync({
          id: activeVehicle.id,
          updates: {
            assigned_driver_id: user.id,
            current_km: numReading,
          },
        });
      } catch (e) {
        console.warn("Could not update vehicle current_km after checklist:", e);
      }

      // Automatically create a repair request if issues detected
      if (hasIssues) {
        const issueParts: string[] = [];
        if (oilStatus !== "ok") issueParts.push(`Engine Oil (${oilStatus})`);
        if (!tyresOk) issueParts.push("Tyres");
        if (!lightsOk) issueParts.push("Lights");
        if (!brakesOk) issueParts.push("Brakes");

        const description = `Auto-generated repair request from daily checklist issue: ${issueParts.join(", ")}`;

        await createRepair.mutateAsync({
          driver_id: user.id,
          vehicle_id: activeVehicle.id,
          description,
          parts_needed: issueParts.join(", "),
          photo_url: photoUrl,
          status: "pending",
          manager_notes: null,
        });

        toast({
          title: "Repair Request Created",
          description: `Automatic repair request submitted for: ${issueParts.join(", ")}`,
        });
      }

      // Log single audit event for checklist submission
      try {
        await logAuditEvent({
          driver_id: user.id,
          driver_name: user.name,
          vehicle_id: activeVehicle.id,
          vehicle_no: activeVehicle.vehicle_no,
          action_type: isEndShift ? "END_DAY_CHECKOUT" : "CHECKLIST_SUCCESS",
          status: hasIssues ? "warning" : "success",
          odometer: numReading || null,
          photos_count: photoFile ? 1 : 0,
          details: `${isEndShift ? "End of shift checklist" : "Daily pre-trip inspection"} submitted for ${activeVehicle.vehicle_no}. Meter: ${numReading.toLocaleString()} km. Oil: ${oilStatus}. ${hasIssues ? "Issues reported." : "All systems OK."}`,
        });
      } catch (e) {
        console.warn("Audit checklist log error", e);
      }

      if (isEndShift) {
        await notifyManagers(
          `*Shift Ended*\nDriver: ${user.name}\nVehicle: ${activeVehicle.vehicle_no}\nEnd KM: ${numReading}${otString}`
        );
        toast({
          title: "End Shift submitted!",
          description: `End of day logs saved.${otString ? " Overtime recorded." : ""}`,
        });
      } else if (isOfflineSaved) {
        toast({
          title: "Saved on phone. Will send soon.",
          description: `${activeVehicle.vehicle_no} inspection saved offline. Photo will sync to manager automatically.`,
        });
      } else {
        toast({
          title: "Checklist submitted!",
          description: `${activeVehicle.vehicle_no} set as your vehicle for today.`,
        });
      }
      setLocation("/");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Please try again";
      try {
        await logAuditEvent({
          driver_id: user.id,
          driver_name: user.name,
          vehicle_id: activeVehicle.id,
          vehicle_no: activeVehicle.vehicle_no,
          action_type: "CHECKLIST_FAILED",
          status: "error",
          odometer: Number(meterReading) || null,
          photos_count: photoFile ? 1 : 0,
          details: `Checklist submission failed.`,
          error_message: errMsg,
        });
      } catch {}
      toast({ title: "Failed to submit", description: errMsg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isEndShift && hasEndChecklist) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <CheckCircle className="w-16 h-16 text-emerald-400 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Shift Already Ended</h2>
        <p className="text-muted-foreground text-center mb-6">You've already ended your shift for today.</p>
        <button
          onClick={() => setLocation("/")}
          className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-xl"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!isEndShift && hasStartChecklist) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <CheckCircle className="w-16 h-16 text-emerald-400 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Checklist Already Submitted</h2>
        <p className="text-muted-foreground text-center mb-6">
          You've already completed today's daily checklist for {activeVehicle?.vehicle_no || "your vehicle"}.
        </p>
        <button
          onClick={() => setLocation("/")}
          className="bg-primary text-primary-foreground font-semibold px-6 py-2.5 rounded-xl"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const oilOptions: { value: OilStatus; label: string; color: string }[] = [
    { value: "ok", label: "OK", color: "bg-emerald-500/20 border-emerald-500 text-emerald-400" },
    { value: "low", label: "Low", color: "bg-amber-500/20 border-amber-500 text-amber-400" },
    { value: "needs_change", label: "Needs Change", color: "bg-red-500/20 border-red-500 text-red-400" },
  ];

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="p-4 border-b border-border space-y-2.5">
        <h1 className="text-xl font-bold text-foreground">
          {isEndShift ? "End Shift Checklist" : "Daily Checklist"}
        </h1>

        {/* Vehicle Chip at the Top (Fix 1: One vehicle for the day) */}
        {activeVehicle && !showVehicleSwitcher ? (
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Car className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {activeVehicle.vehicle_no} · <span className="font-normal text-muted-foreground">{activeVehicle.model}</span>
                </p>
                <p className="text-[11px] text-emerald-400 font-mono">
                  Last reading: {lastOdometer > 0 ? `${lastOdometer.toLocaleString()} km` : "Base reading"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowVehicleSwitcher(true)}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              <RefreshCw className="w-3 h-3" /> Not this one? Switch
            </button>
          </div>
        ) : (
          <div className="mt-2 max-w-md space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Select Vehicle for Today
              </label>
              <div className="flex items-center gap-2">
                <NumberPlateScanner
                  onScanComplete={plate => {
                    if (!allVehicles) return;
                    const normScanned = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
                    const found = allVehicles.find(v => {
                      const normVNo = v.vehicle_no.toUpperCase().replace(/[^A-Z0-9]/g, "");
                      return normVNo === normScanned || normVNo.includes(normScanned) || normScanned.includes(normVNo);
                    });
                    if (found) {
                      handleSelectVehicle(found.id);
                    } else {
                      toast({
                        title: "Vehicle Not Found in Fleet",
                        description: `Scanned plate "${plate}" did not match any active vehicle.`,
                        variant: "destructive",
                      });
                    }
                  }}
                />
                {activeVehicle && (
                  <button
                    type="button"
                    onClick={() => setShowVehicleSwitcher(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <select
              value={selectedVehicleId}
              onChange={e => handleSelectVehicle(e.target.value)}
              className="bg-card border border-input rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full"
            >
              <option value="">-- Choose Vehicle --</option>
              {allVehicles?.map(v => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_no} · {v.model} ({Number(v.current_km || 0).toLocaleString()} km)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-4 space-y-6">
        {/* Meter Reading with 500 km Plausibility Check & Lower-Than-Last Block (A1 / O11 / A16 / Fix 5) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-foreground">
              Meter Reading (km) <span className="text-red-400">*</span>
            </label>
            {lastOdometer > 0 && (
              <span className="text-xs font-mono text-muted-foreground">
                Last recorded: <strong className="text-foreground">{lastOdometer.toLocaleString()} km</strong>
              </span>
            )}
          </div>
          <input
            data-testid="input-meter-reading"
            type="number"
            inputMode="numeric"
            placeholder={lastOdometer > 0 ? `e.g. ${lastOdometer + 15}` : "Enter odometer reading"}
            value={meterReading}
            onChange={e => {
              setMeterReading(e.target.value);
              setConfirmMeterReading("");
            }}
            className={`w-full bg-card border rounded-xl px-4 py-3 text-foreground text-lg font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${
              isLowerThanLast
                ? "border-red-500 focus:ring-red-500"
                : isOver500KmJump
                ? "border-amber-500 focus:ring-amber-500"
                : "border-input focus:ring-primary"
            }`}
          />

          {isLowerThanLast && (
            <div className="flex items-start gap-2 bg-red-500/15 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Entered reading (<strong>{enteredOdo.toLocaleString()} km</strong>) cannot be lower than the last recorded reading (<strong>{lastOdometer.toLocaleString()} km</strong>). Please check the meter or ask a Manager to use &ldquo;Fix Odometer&rdquo;.
              </span>
            </div>
          )}

          {isOver500KmJump && !isLowerThanLast && (
            <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  This reading is <strong>{(enteredOdo - lastOdometer).toLocaleString()} km</strong> higher than the last reading ({lastOdometer.toLocaleString()} km) — more than 500 km off. Please retype the reading below to confirm it is not a typing slip:
                </span>
              </div>
              <input
                type="number"
                inputMode="numeric"
                placeholder={`Retype ${meterReading} to confirm`}
                value={confirmMeterReading}
                onChange={e => setConfirmMeterReading(e.target.value)}
                className="w-full bg-background border border-amber-500/50 rounded-xl px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
        </div>

        {/* Photo Capture (Required for Checklist - Fix A16) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-foreground">
              Meter Photo <span className="text-red-400">*</span>
            </label>
            <span className="text-[11px] text-muted-foreground">Required to verify odometer</span>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
            data-testid="input-meter-photo"
          />
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="Meter" className="w-full h-40 object-cover rounded-xl border border-border" />
              <button
                type="button"
                data-testid="btn-retake-photo"
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg"
              >
                Retake
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="btn-capture-photo"
              onClick={() => photoInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Camera className="w-8 h-8" />
              <span className="text-sm font-medium">Tap to capture or upload meter photo</span>
            </button>
          )}
        </div>

        {/* Oil Status */}
        {!isEndShift && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Oil Check</label>
            <div className="flex gap-2">
              {oilOptions.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  data-testid={`btn-oil-${opt.value}`}
                  onClick={() => setOilStatus(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    oilStatus === opt.value ? opt.color : "border-border text-muted-foreground bg-card"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Condition Checks */}
        {!isEndShift && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Quick Checks</label>
            <div className="space-y-3">
              {[
                { label: "Tyres", value: tyresOk, set: setTyresOk, testId: "check-tyres" },
                { label: "Lights", value: lightsOk, set: setLightsOk, testId: "check-lights" },
                { label: "Brakes", value: brakesOk, set: setBrakesOk, testId: "check-brakes" },
              ].map(({ label, value, set, testId }) => (
                <div
                  key={label}
                  className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3"
                >
                  <span className="text-foreground font-medium">{label}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid={`${testId}-ok`}
                      onClick={() => set(true)}
                      className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                        value
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      data-testid={`${testId}-issue`}
                      onClick={() => set(false)}
                      className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                        !value
                          ? "bg-red-500/20 border-red-500 text-red-400"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      Issue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        {isEndShift && hasPendingTasks && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>
              You have {pendingTasks.length} pending task(s). You must complete all tasks before ending your shift.
            </p>
          </div>
        )}

        {isEndShift && overtimeHours > 0 && (
          <div className="text-sm font-medium text-amber-500 bg-amber-500/10 px-4 py-2 rounded-xl text-center">
            {overtimeHours} hours Overtime calculated
          </div>
        )}

        <button
          type="button"
          data-testid="btn-submit-checklist"
          onClick={handleSubmit}
          disabled={
            submitting ||
            !meterReading ||
            !activeVehicle ||
            isLowerThanLast ||
            !isJumpConfirmed ||
            !photoFile ||
            (isEndShift && hasPendingTasks)
          }
          className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-full text-lg disabled:opacity-50 transition-all active:scale-95"
        >
          {submitting ? "Submitting..." : isEndShift ? "End Shift" : "Submit checklist"}
        </button>
      </div>
    </div>
  );
}
