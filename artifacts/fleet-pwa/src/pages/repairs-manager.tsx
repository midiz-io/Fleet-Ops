import { useState } from "react";
import { useRepairs, useUpdateRepair } from "@/hooks/use-repairs";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useToast } from "@/hooks/use-toast";
import { Wrench, CheckCircle, XCircle, X, ChevronDown, Mic } from "lucide-react";
import { format, parseISO } from "date-fns";

export function RepairsManagerPage() {
  const { data: repairs, isLoading } = useRepairs();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const updateRepair = useUpdateRepair();
  const { toast } = useToast();

  const [actionModal, setActionModal] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const vehicleMap = Object.fromEntries(vehicles?.map(v => [v.id, v]) ?? []);
  const driverMap = Object.fromEntries(drivers?.map(d => [d.id, d]) ?? []);

  const filtered = repairs?.filter(r => filter === "all" || r.status === filter) ?? [];
  const pending = repairs?.filter(r => r.status === "pending") ?? [];

  const handleAction = async () => {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      await updateRepair.mutateAsync({ id: actionModal.id, updates: { status: actionModal.action, manager_notes: notes.trim() || null } });
      toast({ title: actionModal.action === "approved" ? "Repair approved" : "Repair rejected" });
      setActionModal(null);
      setNotes("");
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const statusStyle = (s: string) =>
    s === "pending" ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
    : s === "approved" ? "bg-emerald-400/15 text-emerald-400 border-emerald-400/30"
    : "bg-red-400/15 text-red-400 border-red-400/30";

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Repair Requests</h1>
        {pending.length > 0 && (
          <p className="text-amber-400 text-sm mt-0.5 font-medium">{pending.length} pending approval</p>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-4 pb-0 overflow-x-auto">
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button
            key={f}
            data-testid={`filter-${f}`}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
          >
            {f} {f === "pending" && pending.length > 0 && `(${pending.length})`}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />)
        ) : filtered.length > 0 ? filtered.map(r => (
          <div key={r.id} data-testid={`repair-mgr-card-${r.id}`} className={`bg-card border rounded-xl p-4 ${r.status === "pending" ? "border-amber-500/30" : "border-border"}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <p className="text-foreground font-medium">{r.description}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {vehicleMap[r.vehicle_id]?.vehicle_no ?? "Unknown"} &bull; {driverMap[r.driver_id]?.name ?? "Unknown"}
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs font-semibold capitalize px-2 py-0.5 rounded-full border ${statusStyle(r.status)}`}>
                {r.status}
              </span>
            </div>

            {r.parts_needed && (
              <p className="text-sm text-muted-foreground mb-2">Parts: {r.parts_needed}</p>
            )}

            {/* Driver Voice Memo Playback (Change 6) */}
            {(r.voice_memo_url || (typeof window !== "undefined" && localStorage.getItem(`fleet_repair_voice_${r.id}`))) && (
              <div className="bg-secondary/40 border border-border rounded-xl p-2.5 mb-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Driver Voice Memo</p>
                  <audio controls src={r.voice_memo_url || localStorage.getItem(`fleet_repair_voice_${r.id}`) || ""} className="h-8 w-full max-w-sm" />
                </div>
              </div>
            )}

            {r.photo_url && (
              <img
                src={r.photo_url}
                alt="Repair"
                className="w-full h-32 object-cover rounded-xl border border-border mb-2 cursor-pointer hover:opacity-90"
                onClick={() => window.open((import.meta.env.BASE_URL || '/') + 'proof-viewer?src=' + encodeURIComponent(r.photo_url) + '&title=' + encodeURIComponent("Proof Viewer"), '_blank')}
              />
            )}

            {r.manager_notes && (
              <div className="bg-background rounded-lg p-2 border border-border mb-2">
                <p className="text-xs text-muted-foreground font-medium">Notes: {r.manager_notes}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-3">{format(parseISO(r.created_at), "MMM d, yyyy 'at' h:mm a")}</p>

            {r.status === "pending" && (
              <div className="flex gap-2">
                <button
                  data-testid={`btn-approve-${r.id}`}
                  onClick={() => { setActionModal({ id: r.id, action: "approved" }); setNotes(""); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-medium text-sm py-2 rounded-xl hover:bg-emerald-500/30 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />Approve
                </button>
                <button
                  data-testid={`btn-reject-${r.id}`}
                  onClick={() => { setActionModal({ id: r.id, action: "rejected" }); setNotes(""); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/15 text-red-400 border border-red-500/30 font-medium text-sm py-2 rounded-xl hover:bg-red-500/25 transition-colors"
                >
                  <XCircle className="w-4 h-4" />Reject
                </button>
              </div>
            )}
          </div>
        )) : (
          <div className="text-center py-12 text-muted-foreground">
            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No {filter === "all" ? "" : filter} repair requests</p>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">{actionModal.action === "approved" ? "Approve Repair" : "Reject Repair"}</h2>
              <button onClick={() => setActionModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Notes (optional)</label>
              <textarea
                data-testid="input-manager-notes"
                rows={3}
                placeholder="Add notes for the driver..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
              />
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setActionModal(null)} className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-sm">Cancel</button>
              <button
                data-testid="btn-confirm-action"
                onClick={handleAction}
                disabled={submitting}
                className={`flex-1 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 ${actionModal.action === "approved" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}
              >
                {submitting ? "..." : actionModal.action === "approved" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

          </div>
  );
}

