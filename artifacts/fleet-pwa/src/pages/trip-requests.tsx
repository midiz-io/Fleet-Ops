import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTripRequests, TripRequest } from "@/hooks/use-trip-requests";
import { useToast } from "@/hooks/use-toast";
import { uploadImage } from "@/lib/image-upload";
import { 
  Navigation, Camera, Clock, CheckCircle2, AlertCircle, Plus, Send, X, 
  Shield, Phone, Sparkles, Filter, ArrowRight, UserCheck, Calendar
} from "lucide-react";
import { format } from "date-fns";

const QUICK_LOCATIONS_FROM = [
  "Packing Centre",
  "Main Factory",
  "Stores / Warehouse",
  "Main Gate",
];

const QUICK_LOCATIONS_TO = [
  "Airport (BIA)",
  "Colombo Port",
  "Colombo HQ",
  "Katunayake",
  "Packing Centre",
];

export function TripRequestsPage() {
  const { user } = useAuth();
  const { requests, isLoading, createRequest } = useTripRequests();
  const { toast } = useToast();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState(() => `Today ${format(new Date(), "h:mm a")}`);
  const [what, setWhat] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "waiting" | "assigned" | "urgent">("all");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Sync with URL hash if provided
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === "#new-form" || hash === "#new") {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (hash === "#waiting") {
        setFilterTab("waiting");
      } else if (hash === "#assigned") {
        setFilterTab("assigned");
      } else if (hash === "#all") {
        setFilterTab("all");
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const myRequests = requests.filter(r => r.requesterId === user?.id || user?.role === "manager");

  const waitingCount = myRequests.filter(r => r.status === "waiting").length;
  const assignedCount = myRequests.filter(r => r.status === "assigned").length;
  const urgentCount = myRequests.filter(r => r.urgent).length;

  const filteredRequests = myRequests.filter(req => {
    if (filterTab === "waiting") return req.status === "waiting";
    if (filterTab === "assigned") return req.status === "assigned";
    if (filterTab === "urgent") return req.urgent;
    return true;
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from.trim() || !to.trim() || !when.trim() || !what.trim()) {
      toast({ title: "Please fill in all 4 boxes", description: "From, To, When, and Cargo/Passengers are required.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        photoUrl = await uploadImage(photoFile);
      }

      await createRequest.mutateAsync({
        from: from.trim(),
        to: to.trim(),
        when: when.trim(),
        what: what.trim(),
        urgent,
        photoUrl,
        requesterId: user?.id || "unknown",
        requesterName: user?.name || "Head of Teams",
      });

      toast({ 
        title: "Trip Request Sent Successfully", 
        description: "Fleet Manager is notified to assign driver and vehicle." 
      });

      setFrom("");
      setTo("");
      setWhen(`Today ${format(new Date(), "h:mm a")}`);
      setWhat("");
      setUrgent(false);
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err: any) {
      toast({ title: "Failed to send request", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 sm:p-5 md:p-8 max-w-4xl mx-auto space-y-6 pb-28 md:pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-card via-card to-primary/5 p-4 sm:p-5 rounded-2xl border border-border shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-primary/80 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Trip Requests
              </h1>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase tracking-wide">
                Head of Teams
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Request vehicle transport for crew, goods or shipments with instant fleet dispatch.
            </p>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-1 sm:pb-0">
          <div className="bg-background/80 border border-border/80 px-3 py-1.5 rounded-xl text-center min-w-[70px]">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Pending</p>
            <p className="text-base font-extrabold text-amber-400">{waitingCount}</p>
          </div>
          <div className="bg-background/80 border border-border/80 px-3 py-1.5 rounded-xl text-center min-w-[70px]">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Assigned</p>
            <p className="text-base font-extrabold text-emerald-400">{assignedCount}</p>
          </div>
          <div className="bg-background/80 border border-border/80 px-3 py-1.5 rounded-xl text-center min-w-[70px]">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Total</p>
            <p className="text-base font-extrabold text-foreground">{myRequests.length}</p>
          </div>
        </div>
      </div>

      {/* 4-Box Request Form Container */}
      <div 
        ref={formRef}
        id="new-form"
        className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 scroll-mt-20"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <h2 className="text-base font-bold text-foreground tracking-tight">
              New Trip Request
            </h2>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">
            4-Box Quick Form
          </span>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          {/* Row 1: From & To */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 1: From */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                1. From (Departure Location) *
              </label>
              <input
                type="text"
                placeholder="e.g. Packing centre / Main Factory"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3.5 py-3 text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              />
              {/* Quick Pills for From */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-muted-foreground font-semibold">Quick:</span>
                {QUICK_LOCATIONS_FROM.map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setFrom(loc)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary/80 hover:bg-primary/15 hover:text-primary text-muted-foreground border border-border/50 transition-colors"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            {/* Box 2: To */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                2. To (Destination) *
              </label>
              <input
                type="text"
                placeholder="e.g. Katunayake Airport / Colombo Port"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3.5 py-3 text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              />
              {/* Quick Pills for To */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-muted-foreground font-semibold">Quick:</span>
                {QUICK_LOCATIONS_TO.map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setTo(loc)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary/80 hover:bg-primary/15 hover:text-primary text-muted-foreground border border-border/50 transition-colors"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: When & What */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box 3: When */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                3. When (Date & Time) *
              </label>
              <input
                type="text"
                placeholder="e.g. Today 4:30 PM / Tomorrow 8:00 AM"
                value={when}
                onChange={e => setWhen(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3.5 py-3 text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              />
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => setWhen(`Today ${format(new Date(), "h:mm a")}`)}
                  className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary/80 hover:bg-primary/15 hover:text-primary text-muted-foreground border border-border/50 transition-colors"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setWhen(`Today 5:00 PM`)}
                  className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary/80 hover:bg-primary/15 hover:text-primary text-muted-foreground border border-border/50 transition-colors"
                >
                  Today 5:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setWhen(`Tomorrow 8:00 AM`)}
                  className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary/80 hover:bg-primary/15 hover:text-primary text-muted-foreground border border-border/50 transition-colors"
                >
                  Tomorrow 8:00 AM
                </button>
              </div>
            </div>

            {/* Box 4: What / Who */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                4. What / Who (Cargo or Passengers) *
              </label>
              <input
                type="text"
                placeholder="e.g. Shipment · 12 boxes or 6 Staff Members"
                value={what}
                onChange={e => setWhat(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3.5 py-3 text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary font-medium"
              />
              <p className="text-[11px] text-muted-foreground">
                Specify cargo details, box count, weight, or number of crew.
              </p>
            </div>
          </div>

          {/* Urgent & Cargo Photo Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Urgent Selector */}
            <div className="bg-background/60 border border-border rounded-xl p-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                Priority Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUrgent(false)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                    !urgent
                      ? "bg-secondary text-foreground border-border shadow-sm"
                      : "border-border/50 text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  Standard Trip
                </button>
                <button
                  type="button"
                  onClick={() => setUrgent(true)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                    urgent
                      ? "bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20"
                      : "border-border/50 text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Urgent
                </button>
              </div>
            </div>

            {/* Cargo Photo Attachment */}
            <div className="bg-background/60 border border-border rounded-xl p-3 flex flex-col justify-center">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                Cargo / Waybill Photo (Optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {photoPreview ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-20 h-14 rounded-lg overflow-hidden border border-border shrink-0">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                      className="absolute top-1 right-1 bg-black/80 text-white p-0.5 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Photo Attached
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 border border-dashed border-input rounded-xl px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Camera className="w-4 h-4 text-primary" />
                  Take or Upload Photo
                </button>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-black py-3.5 rounded-xl text-sm sm:text-base flex items-center justify-center gap-2.5 hover:opacity-95 active:scale-[0.99] transition-all shadow-lg shadow-primary/25 disabled:opacity-50 mt-2"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            {submitting ? "Sending Request..." : "Send Trip Request to Fleet Manager"}
          </button>
        </form>
      </div>

      {/* Filter Tabs and Requests List Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              Submitted Requests
            </h2>
            <p className="text-xs text-muted-foreground">
              Live updates when Fleet Manager assigns a driver and vehicle.
            </p>
          </div>

          {/* Touch-Friendly Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                filterTab === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({myRequests.length})
            </button>
            <button
              onClick={() => setFilterTab("waiting")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                filterTab === "waiting"
                  ? "bg-amber-500 text-black shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-3 h-3" />
              Pending ({waitingCount})
            </button>
            <button
              onClick={() => setFilterTab("assigned")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                filterTab === "assigned"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              Assigned ({assignedCount})
            </button>
            {urgentCount > 0 && (
              <button
                onClick={() => setFilterTab("urgent")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filterTab === "urgent"
                    ? "bg-red-500 text-white shadow-sm"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Urgent ({urgentCount})
              </button>
            )}
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-card border border-border rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-2xl space-y-2">
            <Clock className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-bold text-foreground">No requests found</p>
            <p className="text-xs max-w-sm mx-auto">
              {filterTab !== "all" 
                ? `No requests match the "${filterTab}" filter.` 
                : "Fill out the 4-box form above to submit your first vehicle transport request."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map(req => {
              const isAssigned = req.status === "assigned";
              return (
                <div
                  key={req.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isAssigned
                      ? "bg-card border-border shadow-sm hover:border-emerald-500/40"
                      : "bg-gradient-to-r from-amber-500/5 via-card to-card border-amber-500/30 shadow-sm"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Route and Status Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-foreground text-sm sm:text-base flex items-center gap-1.5">
                          {req.from} <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" /> {req.to}
                        </span>

                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                            isAssigned
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {isAssigned ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Driver Assigned
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Pending Dispatch
                            </>
                          )}
                        </span>

                        {req.urgent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wide">
                            Urgent
                          </span>
                        )}
                      </div>

                      {/* Cargo / Trip Details */}
                      <div className="bg-secondary/40 border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground font-medium">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider block">
                          Cargo / Passenger Details:
                        </span>
                        {req.what}
                      </div>

                      {/* Time & Assignment Info */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 text-foreground font-medium">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          When: {req.when}
                        </span>

                        {isAssigned && (req.assignedDriverName || req.assignedVehicleNo) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" />
                              {req.assignedDriverName || "Assigned Driver"} 
                              {req.assignedVehicleNo ? ` (${req.assignedVehicleNo})` : ""}
                            </span>

                            {req.assignedDriverPhone && (
                              <a
                                href={`tel:${req.assignedDriverPhone}`}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black font-bold text-[11px] border border-emerald-500/30 transition-all"
                              >
                                <Phone className="w-3 h-3" />
                                Call Driver
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Cargo Photo thumbnail */}
                    {req.photoUrl && (
                      <div className="shrink-0 pt-1 sm:pt-0">
                        <img
                          src={req.photoUrl}
                          alt="Cargo"
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-border shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                          onClick={() => setExpandedImage(req.photoUrl!)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-lg w-full bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-3 right-3 bg-black/70 text-white p-1.5 rounded-full hover:bg-black transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={expandedImage} alt="Expanded cargo view" className="w-full max-h-[80vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
