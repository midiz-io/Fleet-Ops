import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVehiclesByDriver, useVehicles } from "@/hooks/use-vehicles";
import { useDriverRepairs, useCreateRepair } from "@/hooks/use-repairs";
import { useToast } from "@/hooks/use-toast";
import { uploadImage } from "@/lib/image-upload";
import { 
  Wrench, Camera, Plus, AlertTriangle, 
  Mic, Square, Trash2, Volume2, RotateCcw
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { NumberPlateScanner } from "@/components/number-plate-scanner";
import { useLanguage } from "@/contexts/LanguageContext";

export function DriverRepairsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { data: vehicles } = useVehiclesByDriver(user?.id ?? null);
  const { data: repairs, isLoading } = useDriverRepairs(user?.id ?? null);
  const { data: allVehicles } = useVehicles();
  const createRepair = useCreateRepair();
  const { toast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("Tyre");
  const [description, setDescription] = useState("Tyre Issue");
  const [partsNeeded, setPartsNeeded] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Voice memo recording state (Change 6: Up to 60s voice memo)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const categories = [
    { label: t("tyre"), icon: "🛞", val: "Tyre" },
    { label: t("lights"), icon: "💡", val: "Lights" },
    { label: t("brakes"), icon: "🛑", val: "Brakes" },
    { label: t("engine"), icon: "⚙️", val: "Engine" },
    { label: t("body"), icon: "🚗", val: "Body" },
    { label: t("other"), icon: "🔧", val: "Other" },
  ];

  const vehicle = vehicles?.[0];
  const activeVehicle = vehicle || allVehicles?.find(v => v.id === selectedVehicleId);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Start voice memo recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setAudioUrl(reader.result as string);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      toast({
        title: "Microphone Access Denied",
        description: "Please allow microphone permission to record voice memo.",
        variant: "destructive",
      });
    }
  };

  // Stop voice memo recording
  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Clear voice memo
  const clearVoiceRecording = () => {
    setAudioUrl(null);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const handleSubmit = async () => {
    if (!user || !activeVehicle) return;
    if (!description.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        photoUrl = await uploadImage(photoFile);
      }
      const newRepair = await createRepair.mutateAsync({
        driver_id: user.id,
        vehicle_id: activeVehicle.id,
        description: description.trim(),
        parts_needed: partsNeeded.trim() || null,
        photo_url: photoUrl,
        voice_memo_url: audioUrl || null,
        status: "pending",
        manager_notes: null,
      });

      // Persist local voice memo for instant audio playback
      if (newRepair?.id && audioUrl) {
        try {
          localStorage.setItem(`fleet_repair_voice_${newRepair.id}`, audioUrl);
        } catch (e) {}
      }

      toast({ title: "Repair request submitted with voice memo!" });
      setDescription("");
      setPartsNeeded("");
      setPhotoFile(null);
      setPhotoPreview(null);
      clearVoiceRecording();
      setShowForm(false);
    } catch (err: unknown) {
      toast({ 
        title: "Failed to submit", 
        description: err instanceof Error ? err.message : "Please try again", 
        variant: "destructive" 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const statusStyle = (status: string) =>
    status === "pending" ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
    : status === "approved" ? "bg-emerald-400/15 text-emerald-400 border-emerald-400/30"
    : "bg-red-400/15 text-red-400 border-red-400/30";

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Repair Requests</h1>
          {activeVehicle && <p className="text-muted-foreground text-sm">{activeVehicle.vehicle_no} - {activeVehicle.model}</p>}
        </div>
        <button
          data-testid="btn-new-repair"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-3.5 py-2 rounded-xl shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {/* New Request Form */}
      {showForm && (
        <div className="m-4 bg-card border border-border rounded-2xl p-4 space-y-4 shadow-xl">
          <h2 className="font-semibold text-foreground text-base">New Repair Request</h2>
          {!vehicle && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-muted-foreground">Vehicle</label>
                <NumberPlateScanner
                  onScanComplete={(plate) => {
                    if (!allVehicles) return;
                    const normScanned = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
                    const found = allVehicles.find(v => {
                      const normVNo = v.vehicle_no.toUpperCase().replace(/[^A-Z0-9]/g, "");
                      return normVNo === normScanned || normVNo.includes(normScanned) || normScanned.includes(normVNo);
                    });
                    if (found) {
                      setSelectedVehicleId(found.id);
                    } else {
                      toast({
                        title: "Vehicle Not Found in Fleet",
                        description: `Scanned plate "${plate}" did not match any active vehicle.`,
                        variant: "destructive"
                      });
                    }
                  }}
                />
              </div>
              <select
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="">-- Choose Vehicle --</option>
                {allVehicles?.map(v => (
                  <option key={v.id} value={v.id}>{v.vehicle_no} - {v.model}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Select Issue Category</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map(cat => (
                <button
                  key={cat.val}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.val);
                    setDescription(`${cat.val} Issue`);
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-xs font-bold ${
                    selectedCategory === cat.val
                      ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Description <span className="text-red-400">*</span></label>
            <textarea
              data-testid="input-repair-description"
              rows={3}
              placeholder="Describe the issue..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
            />
          </div>

          {/* Voice Memo Recording Box (Change 6: Hold / Tap to record up to 60s) */}
          <div className="bg-secondary/30 border border-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-primary" /> Voice Memo (Up to 60s)
              </label>
              {audioUrl && (
                <span className="text-[11px] text-emerald-400 font-medium">Recorded ✓</span>
              )}
            </div>

            {!audioUrl ? (
              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="w-full py-2.5 px-3 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Record Voice Explanation</span>
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl p-2.5 animate-pulse">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                      <span className="text-xs font-bold text-red-400">
                        Recording: {recordingSeconds}s / 60s
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <audio controls src={audioUrl} className="w-full h-8" />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearVoiceRecording}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Re-record
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Parts Needed (optional)</label>
            <input
              data-testid="input-parts-needed"
              type="text"
              placeholder="e.g. Brake pads, oil filter"
              value={partsNeeded}
              onChange={e => setPartsNeeded(e.target.value)}
              className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Photo (optional)</label>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Repair" className="w-full h-32 object-cover rounded-xl border border-border" />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">Remove</button>
              </div>
            ) : (
              <button
                data-testid="btn-repair-photo"
                onClick={() => photoInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl p-4 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Camera className="w-5 h-5" />
                <span className="text-sm">Capture photo</span>
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 border border-border text-muted-foreground font-medium py-2.5 rounded-xl text-sm">Cancel</button>
            <button
              data-testid="btn-submit-repair"
              onClick={handleSubmit}
              disabled={submitting || !activeVehicle}
              className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl disabled:opacity-50 text-sm shadow-sm"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      )}

      {/* Repairs List */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}
          </div>
        ) : repairs && repairs.length > 0 ? (
          repairs.map(r => {
            const voiceUrl = r.voice_memo_url || (typeof window !== "undefined" ? localStorage.getItem(`fleet_repair_voice_${r.id}`) : null);

            return (
              <div key={r.id} data-testid={`repair-card-${r.id}`} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground font-medium leading-snug">{r.description}</p>
                  <span className={`flex-shrink-0 text-xs font-semibold capitalize px-2 py-0.5 rounded-full border ${statusStyle(r.status)}`}>
                    {r.status}
                  </span>
                </div>
                {r.parts_needed && (
                  <p className="text-sm text-muted-foreground">Parts: {r.parts_needed}</p>
                )}

                {/* Voice memo playback if available */}
                {voiceUrl && (
                  <div className="bg-secondary/40 border border-border rounded-xl p-2.5 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Voice Memo</p>
                      <audio controls src={voiceUrl} className="h-7 w-full max-w-xs" />
                    </div>
                  </div>
                )}

                {r.manager_notes && (
                  <div className="mt-2 bg-background rounded-lg p-2 border border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Manager Notes:</p>
                    <p className="text-sm text-foreground">{r.manager_notes}</p>
                  </div>
                )}
                {r.photo_url && (
                  <img
                    src={r.photo_url}
                    alt="Repair request"
                    className="w-full max-w-[150px] h-20 object-cover rounded-xl border border-border mt-2 cursor-pointer hover:opacity-90"
                    onClick={() => window.open((import.meta.env.BASE_URL || '/') + 'proof-viewer?src=' + encodeURIComponent(r.photo_url) + '&title=' + encodeURIComponent("Proof Viewer"), '_blank')}
                  />
                )}
                <p className="text-xs text-muted-foreground mt-2">{format(parseISO(r.created_at), "MMM d, yyyy 'at' h:mm a")}</p>
              </div>
            );
          })
        ) : (
          <div className="text-center text-muted-foreground py-12">
            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No repair requests yet</p>
            <p className="text-sm mt-1">Tap "+ New" to create a request</p>
          </div>
        )}
      </div>
    </div>
  );
}
