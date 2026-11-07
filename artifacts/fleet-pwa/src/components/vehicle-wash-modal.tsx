import { useState, useRef, useEffect } from "react";
import { 
  Camera, CheckCircle2, AlertTriangle, X, Droplet, Sparkles, 
  Trash2, RefreshCw, Upload, Eye, Check, ShieldCheck 
} from "lucide-react";
import { 
  useVehicleWashing, 
  WashDaySession, 
  WASH_PHOTO_SLOTS 
} from "@/hooks/use-washing";
import { uploadImage } from "@/lib/image-upload";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface VehicleWashModalProps {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleNo: string;
  vehicleModel?: string;
  driverId: string;
  driverName: string;
}

export function VehicleWashModal({
  open,
  onClose,
  vehicleId,
  vehicleNo,
  vehicleModel,
  driverId,
  driverName,
}: VehicleWashModalProps) {
  const { toast } = useToast();
  const { 
    washSessions, 
    getVehicleWeekSessions, 
    saveDaySession, 
    currentWeekStart 
  } = useVehicleWashing(vehicleId);

  const [activeDaySlot, setActiveDaySlot] = useState<1 | 2 | 3>(1);
  const [photosBySlot, setPhotosBySlot] = useState<Record<number, string>>({});
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTargetIndexRef = useRef<number>(0);

  // Load existing session for active day slot
  const weekSessions = getVehicleWeekSessions(vehicleId, currentWeekStart);
  const currentSlotSession = weekSessions.find(s => s.daySlot === activeDaySlot);

  useEffect(() => {
    if (currentSlotSession && Array.isArray(currentSlotSession.photos)) {
      const map: Record<number, string> = {};
      currentSlotSession.photos.forEach((url, idx) => {
        if (url) map[idx] = url;
      });
      setPhotosBySlot(map);
    } else {
      setPhotosBySlot({});
    }
  }, [activeDaySlot, currentSlotSession]);

  if (!open) return null;

  const completedDaysCount = weekSessions.filter(s => Array.isArray(s.photos) && s.photos.length >= 5).length;
  const isCurrentSlotCompleted = Boolean(currentSlotSession && currentSlotSession.photos?.length >= 5);

  const triggerUpload = (slotIndex: number) => {
    activeTargetIndexRef.current = slotIndex;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetIdx = activeTargetIndexRef.current;
    setUploadingIndex(targetIdx);
    try {
      const url = await uploadImage(file);
      setPhotosBySlot(prev => ({
        ...prev,
        [targetIdx]: url,
      }));
      toast({
        title: "Photo Ready ✓",
        description: `${WASH_PHOTO_SLOTS[targetIdx]?.label || "Photo"} captured successfully.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Photo Upload Error",
        description: err.message || "Failed to process photo.",
      });
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleRemovePhoto = (slotIdx: number) => {
    setPhotosBySlot(prev => {
      const next = { ...prev };
      delete next[slotIdx];
      return next;
    });
  };

  const handleSaveDayWash = async () => {
    const photosArray: string[] = [];
    for (let i = 0; i < 5; i++) {
      if (!photosBySlot[i]) {
        toast({
          variant: "destructive",
          title: "All 5 Photos Required",
          description: `Please upload photo for: ${WASH_PHOTO_SLOTS[i].label}`,
        });
        return;
      }
      photosArray.push(photosBySlot[i]);
    }

    setSavingSession(true);
    try {
      await saveDaySession.mutateAsync({
        vehicleId,
        driverId,
        driverName,
        daySlot: activeDaySlot,
        photos: photosArray,
      });

      toast({
        title: `Day ${activeDaySlot} Wash Recorded! 🎉`,
        description: `Successfully submitted 5 wash photos for ${vehicleNo}.`,
      });

      // Automatically advance to next incomplete slot if available
      if (activeDaySlot < 3) {
        setActiveDaySlot((activeDaySlot + 1) as 1 | 2 | 3);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: err.message || "Could not save wash session.",
      });
    } finally {
      setSavingSession(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card/60 backdrop-blur-md flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5 font-mono">
                <Droplet className="w-4 h-4 text-primary" /> {vehicleNo}
              </span>
              {vehicleModel && (
                <span className="text-xs text-muted-foreground font-medium">({vehicleModel})</span>
              )}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                Week {format(parseISO(currentWeekStart), "MMM d")}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-foreground mt-0.5 flex items-center gap-2">
              Vehicle Wash Verification
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              3 distinct wash days required weekly. Each day requires 5 proof photos.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center text-sm font-bold shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Weekly Compulsory Progress Bar */}
        <div className="px-4 sm:px-5 py-3 bg-secondary/30 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Weekly Progress:
            </span>
            <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
              completedDaysCount >= 3 
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
            }`}>
              {completedDaysCount} of 3 Days Completed {completedDaysCount >= 3 ? "✓" : ""}
            </span>
          </div>

          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Compulsory: 3 Washes/Week
          </span>
        </div>

        {/* 3 Day Slots Tabs */}
        <div className="px-4 sm:px-5 pt-3 border-b border-border bg-card/40 shrink-0">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(slot => {
              const slotNum = slot as 1 | 2 | 3;
              const slotSession = weekSessions.find(s => s.daySlot === slotNum);
              const isDone = Boolean(slotSession && slotSession.photos?.length >= 5);
              const isActive = activeDaySlot === slotNum;

              return (
                <button
                  key={slotNum}
                  type="button"
                  onClick={() => setActiveDaySlot(slotNum)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20 scale-[1.02]"
                      : isDone
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                      : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Day {slotNum}</span>
                    {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <span className={`text-[10px] ${isActive ? "text-primary-foreground/90 font-medium" : isDone ? "text-emerald-400 font-medium" : "text-muted-foreground font-normal"}`}>
                    {isDone ? "Done (5/5) ✓" : slotSession ? `${slotSession.photos?.length || 0}/5 photos` : "Pending"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Day Status Banner */}
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            isCurrentSlotCompleted
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-blue-500/10 border-blue-500/30 text-blue-200"
          }`}>
            <div className="flex items-center gap-2">
              {isCurrentSlotCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              )}
              <span>
                <strong>Day {activeDaySlot} Wash:</strong>{" "}
                {isCurrentSlotCompleted
                  ? `Completed on ${format(parseISO(currentSlotSession!.date || currentSlotSession!.createdAt), "EEEE, dd MMM yyyy")} ✓`
                  : "Capture all 5 vehicle angles to verify washing."}
              </span>
            </div>
            <span className="font-mono font-bold shrink-0">
              {Object.keys(photosBySlot).length} / 5 Photos
            </span>
          </div>

          {/* 5 Photo Slots */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Required 5 Angle Proof Photos
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WASH_PHOTO_SLOTS.map((slot, idx) => {
                const photoUrl = photosBySlot[idx];
                const isUploading = uploadingIndex === idx;

                return (
                  <div
                    key={slot.key}
                    className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                      photoUrl
                        ? "bg-emerald-500/5 border-emerald-500/30"
                        : "bg-secondary/40 border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                          {slot.label}
                          {photoUrl && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{slot.hint}</p>
                      </div>
                    </div>

                    {photoUrl ? (
                      <div className="space-y-2">
                        <div 
                          onClick={() => setViewingPhotoUrl(photoUrl)}
                          className="relative h-24 rounded-lg overflow-hidden border border-border group cursor-pointer bg-black/40"
                        >
                          <img
                            src={photoUrl}
                            alt={slot.label}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                            <span className="text-[11px] text-white font-bold flex items-center gap-1 bg-black/60 px-2 py-1 rounded-lg">
                              <Eye className="w-3.5 h-3.5" /> View Photo
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => triggerUpload(idx)}
                            disabled={isUploading || savingSession}
                            className="flex-1 py-1 px-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-semibold text-foreground flex items-center justify-center gap-1 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3 text-muted-foreground" /> Retake
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(idx)}
                            disabled={savingSession}
                            className="py-1 px-2.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] font-semibold flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerUpload(idx)}
                        disabled={isUploading || savingSession}
                        className="h-20 w-full rounded-xl border border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 flex flex-col items-center justify-center gap-1.5 text-primary text-xs font-bold transition-all active:scale-98"
                      >
                        {isUploading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-[11px]">Processing photo...</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-5 h-5" />
                            <span>Capture Photo</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Important Rule Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs space-y-1">
            <p className="font-bold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              Weekly Compulsory Washing Rule
            </p>
            <p className="text-[11px] leading-relaxed">
              Drivers must wash the vehicle <strong>at least 3 days per week</strong> (5 photos per wash session). If you fail to complete 3 washes by Sunday midnight, you will be <strong>blocked from working next week</strong> unless the Manager approves a skip exemption.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-card/60 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary transition-colors"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleSaveDayWash}
            disabled={savingSession || Object.keys(photosBySlot).length < 5}
            className="flex-1 max-w-xs py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50 transition-all active:scale-95"
          >
            {savingSession ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                <span>Saving Day {activeDaySlot}...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Day {activeDaySlot} Wash (5/5)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Full Photo Preview Submodal */}
      {viewingPhotoUrl && (
        <div 
          onClick={() => setViewingPhotoUrl(null)}
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md"
        >
          <div className="max-w-3xl max-h-[90vh] relative">
            <button 
              onClick={() => setViewingPhotoUrl(null)}
              className="absolute -top-10 right-0 text-white font-bold text-lg bg-white/20 rounded-full w-8 h-8 flex items-center justify-center"
            >
              ✕
            </button>
            <img 
              src={viewingPhotoUrl} 
              alt="Wash Proof" 
              className="max-h-[85vh] w-auto rounded-xl object-contain shadow-2xl border border-white/20" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
