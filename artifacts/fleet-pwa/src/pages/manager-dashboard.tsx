import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicles } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useRepairs, useUpdateRepair } from "@/hooks/use-repairs";
import { useChecklists } from "@/hooks/use-checklists";
import { useCosts } from "@/hooks/use-costs";
import { GPSMap } from "@/components/gps-map";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  LayoutDashboard, Car, Users, Wrench, CalendarDays, DollarSign,
  Fuel, ClipboardCheck, AlertTriangle, TrendingDown, CheckCircle,
  Plus, Trash2, X, XCircle, Shield, MapPin, ListTodo,
  BellRing, Navigation, Zap, Clock, BarChart3, ExternalLink, Mic,
} from "lucide-react";
import { format, parseISO, isToday } from "date-fns";

// Modular Manager Tabs
import { ManagerOverviewTab } from "@/components/manager/manager-overview-tab";
import { ManagerTasksTab } from "@/components/manager/manager-tasks-tab";
import { ManagerShiftTab } from "@/components/manager/manager-shift-tab";
import { ManagerTripRequestsTab } from "@/components/manager/manager-trip-requests-tab";
import { ManagerVehiclesTab } from "@/components/manager/manager-vehicles-tab";
import { ManagerDriversTab } from "@/components/manager/manager-drivers-tab";
import { ManagerFuelTab } from "@/components/manager/manager-fuel-tab";
import { ManagerSettingsTab } from "@/components/manager/manager-settings-tab";
import { ManagerApprovalsTab } from "@/components/manager/manager-approvals-tab";
import { FuelReportsPage } from "./reports-fuel";
import { AlertsPage } from "./alerts";
import { MaintenancePage } from "./maintenance";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Category = "fuel" | "service" | "other";

const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const CAT_COLORS: Record<Category, string> = { fuel: "#3b82f6", service: "#f97316", other: "#a78bfa" };

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "approvals", label: "Approvals", icon: CheckCircle },
  { id: "fuel-reports", label: "Fuel Reports", icon: BarChart3 },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "drivers-shift", label: "Drivers Shift", icon: Clock },
  { id: "repairs", label: "Repairs", icon: Wrench },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "costs", label: "Costs", icon: DollarSign },
  { id: "fuel", label: "Fuel Logs", icon: Fuel },
  { id: "checklists", label: "Checklists", icon: ClipboardCheck },
  { id: "gps", label: "GPS Map", icon: MapPin },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "trip-requests", label: "Trip Requests", icon: Navigation },
  { id: "alerts", label: "Alerts", icon: BellRing },
  { id: "settings", label: "Settings", icon: Wrench },
] as const;

export type Tab = typeof TABS[number]["id"] | "ride-request";

function statusBadge(s: string) {
  if (s === "pending") return "bg-amber-400/15 text-amber-400 border-amber-400/30";
  if (s === "approved") return "bg-emerald-400/15 text-emerald-400 border-emerald-400/30";
  return "bg-red-400/15 text-red-400 border-red-400/30";
}

function Modal({ title, onClose, children, position = "center" }: { title: string; onClose: () => void; children: React.ReactNode; position?: "center" | "top" }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={`fixed inset-0 z-[100] bg-black/80 flex justify-center p-4 sm:p-6 animate-in fade-in-0 duration-200 ${position === "top" ? "items-start pt-20" : "items-center"}`}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] md:max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl relative">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ConfirmDialog({
  isOpen, title, message, onConfirm, onCancel
}: {
  isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive mx-auto flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex border-t border-border bg-muted/10">
          <button onClick={onCancel} className="flex-1 py-3.5 text-sm font-semibold text-muted-foreground hover:bg-secondary/50 transition-colors">Cancel</button>
          <div className="w-px bg-border" />
          <button onClick={onConfirm} className="flex-1 py-3.5 text-sm font-bold text-destructive hover:bg-destructive/10 transition-colors">Delete</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ testId, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { testId?: string }) {
  return (
    <input
      data-testid={testId}
      {...props}
      className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
    />
  );
}

function Select({ testId, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { testId?: string }) {
  return (
    <select
      data-testid={testId}
      {...props}
      className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
    />
  );
}

function ModalFooter({ onCancel, onSave, saving, saveLabel }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel?: string }) {
  return (
    <div className="flex gap-2 p-4 border-t border-border">
      <button onClick={onCancel} className="flex-1 border border-border text-muted-foreground font-medium py-2.5 rounded-xl text-sm">Cancel</button>
      <button data-testid="btn-modal-save" onClick={onSave} disabled={saving} className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
        {saving ? "Saving..." : saveLabel ?? "Save"}
      </button>
    </div>
  );
}

// TAB: Repairs
function RepairsTab() {
  const { data: repairs, isLoading } = useRepairs();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const updateRepair = useUpdateRepair();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [action, setAction] = useState<{ id: string; type: "approved" | "rejected" } | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const vMap = Object.fromEntries(vehicles?.map(v => [v.id, v]) ?? []);
  const dMap = Object.fromEntries(drivers?.map(d => [d.id, d]) ?? []);
  const filtered = repairs?.filter(r => filter === "all" || r.status === filter) ?? [];
  const pendingCount = repairs?.filter(r => r.status === "pending").length ?? 0;

  const confirm = async () => {
    if (!action) return;
    setSaving(true);
    try {
      await updateRepair.mutateAsync({ id: action.id, updates: { status: action.type, manager_notes: notes.trim() || null } });
      toast({ title: action.type === "approved" ? "Repair approved" : "Repair rejected" });
      setAction(null); setNotes("");
    } catch (e: any) { toast({ title: "Failed", description: e?.message || "An unknown error occurred", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{pendingCount > 0 ? <span className="text-amber-400 font-medium">{pendingCount} pending approval</span> : "All repairs reviewed"}</p>
      </div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            {f}{f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>
      {isLoading ? <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />)}</div>
        : filtered.length ? filtered.map(r => (
          <div key={r.id} data-testid={`repair-admin-${r.id}`} className={`bg-card border rounded-xl p-4 mb-3 ${r.status === "pending" ? "border-amber-500/30" : "border-border"}`}>
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1">
                <p className="text-foreground font-semibold leading-snug">{r.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">{vMap[r.vehicle_id]?.vehicle_no ?? "?"}</span> · {dMap[r.driver_id]?.name ?? "?"} · {format(parseISO(r.created_at), "MMM d, h:mm a")}
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs font-bold capitalize px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>{r.status}</span>
            </div>
            {r.parts_needed && <p className="text-xs text-muted-foreground mb-1">Parts: {r.parts_needed}</p>}
            {/* Driver Voice Memo Playback (Change 6) */}
            {((r as any).voice_memo_url || (typeof window !== "undefined" && localStorage.getItem(`fleet_repair_voice_${r.id}`))) && (
              <div className="bg-secondary/40 border border-border rounded-xl p-2.5 mb-2 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Mic className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Driver Voice Memo</p>
                  <audio controls src={(r as any).voice_memo_url || localStorage.getItem(`fleet_repair_voice_${r.id}`) || ""} className="h-7 w-full max-w-xs" />
                </div>
              </div>
            )}
            {r.photo_url && (
              <img
                src={r.photo_url}
                alt=""
                className="w-full h-28 object-cover rounded-xl border border-border mb-2 cursor-pointer hover:opacity-90"
                onClick={() => window.open((import.meta.env.BASE_URL || '/') + 'proof-viewer?src=' + encodeURIComponent(r.photo_url) + '&title=' + encodeURIComponent("Proof Viewer"), '_blank')}
              />
            )}
            {r.manager_notes && <div className="bg-background rounded-lg px-2.5 py-2 border border-border mb-2"><p className="text-xs text-muted-foreground">Notes: <span className="text-foreground">{r.manager_notes}</span></p></div>}
            {r.status === "pending" && (
              <div className="flex gap-2 mt-2">
                <button data-testid={`btn-approve-${r.id}`} onClick={() => { setAction({ id: r.id, type: "approved" }); setNotes(""); }} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold text-sm py-2 rounded-xl hover:bg-emerald-500/25 transition-colors">
                  <CheckCircle className="w-4 h-4" />Approve
                </button>
                <button data-testid={`btn-reject-${r.id}`} onClick={() => { setAction({ id: r.id, type: "rejected" }); setNotes(""); }} className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/10 text-red-400 border border-red-500/25 font-semibold text-sm py-2 rounded-xl hover:bg-red-500/20 transition-colors">
                  <XCircle className="w-4 h-4" />Reject
                </button>
              </div>
            )}
          </div>
        )) : <div className="text-center py-12 text-muted-foreground"><Wrench className="w-10 h-10 mx-auto mb-2 opacity-40" /><p>No {filter === "all" ? "" : filter} repairs</p></div>}

      {action && (
        <Modal title={action.type === "approved" ? "Approve Repair" : "Reject Repair"} onClose={() => setAction(null)}>
          <div className="p-4">
            <Field label="Manager Notes (optional)">
              <textarea rows={3} placeholder="Notes for the driver..." value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none" />
            </Field>
          </div>
          <div className="flex gap-2 p-4 border-t border-border">
            <button onClick={() => setAction(null)} className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-sm">Cancel</button>
            <button data-testid="btn-confirm-action" onClick={confirm} disabled={saving} className={`flex-1 font-bold py-2.5 rounded-xl text-sm disabled:opacity-50 ${action.type === "approved" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
              {saving ? "..." : action.type === "approved" ? "Confirm Approve" : "Confirm Reject"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// TAB: Costs
function CostsTab() {
  const { data: costs, isLoading } = useCosts();
  const { data: vehicles } = useVehicles();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [modal, setModal] = useState(false);
  const [fVehicle, setFVehicle] = useState("");
  const [fCat, setFCat] = useState<Category>("fuel");
  const [fAmount, setFAmount] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDate, setFDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const addCost = useMutation({
    mutationFn: async (e: { vehicle_id: string; category: Category; amount: number; description: string | null; date: string }) => {
      const { data, error } = await supabase.from("cost_entries").insert(e).select().single();
      if (error) throw error; return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["costs"] }),
  });

  const vMap = Object.fromEntries(vehicles?.map(v => [v.id, v]) ?? []);
  const filtered = filterVehicle === "all" ? (costs ?? []) : (costs ?? []).filter(c => c.vehicle_id === filterVehicle);
  const total = filtered.reduce((s, c) => s + Number(c.amount), 0);

  const chartData = (vehicles ?? []).map(v => {
    const vc = (costs ?? []).filter(c => c.vehicle_id === v.id);
    return { vehicle: v.vehicle_no, fuel: vc.filter(c => c.category === "fuel").reduce((s, c) => s + Number(c.amount), 0), service: vc.filter(c => c.category === "service").reduce((s, c) => s + Number(c.amount), 0), other: vc.filter(c => c.category === "other").reduce((s, c) => s + Number(c.amount), 0) };
  });

  const save = async () => {
    if (!fVehicle || !fAmount) { toast({ title: "Vehicle & amount required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await addCost.mutateAsync({ vehicle_id: fVehicle, category: fCat, amount: Number(fAmount), description: fDesc.trim() || null, date: fDate });
      toast({ title: "Cost entry added" }); setFAmount(""); setFDesc(""); setModal(false);
    } catch (e: any) { toast({ title: "Failed", description: e?.message || "An unknown error occurred", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Total: <span className="text-foreground font-bold">Rs. {total.toLocaleString()}</span></p>
        <button data-testid="btn-add-cost" onClick={() => { setModal(true); setFVehicle(vehicles?.[0]?.id ?? ""); }} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-sm px-4 py-2 rounded-xl"><Plus className="w-4 h-4" />Add</button>
      </div>
      {chartData.some(v => v.fuel + v.service + v.other > 0) && (
        <div className="bg-card border border-border rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Cost by Vehicle</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="vehicle" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e2a3b", border: "1px solid #334155", borderRadius: "8px", color: "#f1f5f9", fontSize: "11px" }} formatter={(v: number) => [`Rs. ${Number(v).toLocaleString()}`, ""]} />
              <Bar dataKey="fuel" fill={CAT_COLORS.fuel} radius={[3, 3, 0, 0]} name="Fuel" />
              <Bar dataKey="service" fill={CAT_COLORS.service} radius={[3, 3, 0, 0]} name="Service" />
              <Bar dataKey="other" fill={CAT_COLORS.other} radius={[3, 3, 0, 0]} name="Other" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        <button onClick={() => setFilterVehicle("all")} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filterVehicle === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>All</button>
        {vehicles?.map(v => <button key={v.id} onClick={() => setFilterVehicle(v.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filterVehicle === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>{v.vehicle_no}</button>)}
      </div>
      {isLoading ? <div className="space-y-1">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-card border border-border rounded-xl animate-pulse" />)}</div>
        : filtered.length ? filtered.map(c => (
          <div key={c.id} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3 mb-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${CAT_COLORS[c.category as Category]}20` }}>
              {c.category === "fuel" ? <Fuel className="w-3.5 h-3.5" style={{ color: CAT_COLORS.fuel }} /> : c.category === "service" ? <Wrench className="w-3.5 h-3.5" style={{ color: CAT_COLORS.service }} /> : <DollarSign className="w-3.5 h-3.5" style={{ color: CAT_COLORS.other }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground capitalize">{c.category}{c.description ? ` - ${c.description}` : ""}</p>
              <p className="text-xs text-muted-foreground">{vMap[c.vehicle_id]?.vehicle_no ?? "?"} · {c.date}</p>
            </div>
            <span className="text-foreground font-bold text-sm flex-shrink-0">Rs. {Number(c.amount).toLocaleString()}</span>
          </div>
        )) : <div className="text-center py-12 text-muted-foreground"><DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" /><p>No cost entries</p></div>}
      {modal && (
        <Modal title="Add Cost Entry" onClose={() => setModal(false)}>
          <div className="p-4 space-y-3">
            <Field label="Vehicle *">
              <Select value={fVehicle} onChange={e => setFVehicle(e.target.value)}>
                {vehicles?.map(v => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}
              </Select>
            </Field>
            <Field label="Category *">
              <div className="flex gap-2">
                {(["fuel", "service", "other"] as Category[]).map(c => <button key={c} onClick={() => setFCat(c)} className={`flex-1 py-2 rounded-xl text-sm font-medium border capitalize ${fCat === c ? "border-primary text-primary bg-primary/15" : "border-border text-muted-foreground"}`}>{c}</button>)}
              </div>
            </Field>
            <Field label="Amount (Rs.) *"><Input type="number" placeholder="e.g. 5000" value={fAmount} onChange={e => setFAmount(e.target.value)} /></Field>
            <Field label="Description"><Input placeholder="Optional" value={fDesc} onChange={e => setFDesc(e.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} /></Field>
          </div>
          <ModalFooter onCancel={() => setModal(false)} onSave={save} saving={saving} saveLabel="Add Entry" />
        </Modal>
      )}
    </div>
  );
}

// TAB: Checklists
function ChecklistsTab() {
  const { data: checklists, isLoading } = useChecklists();
  const { data: vehicles } = useVehicles();
  const { data: drivers } = useDrivers();
  const [filterVehicle, setFilterVehicle] = useState("all");

  const vMap = Object.fromEntries(vehicles?.map(v => [v.id, v]) ?? []);
  const dMap = Object.fromEntries(drivers?.map(d => [d.id, d]) ?? []);

  const filtered = (checklists ?? []).filter(c => {
    if (filterVehicle === "all") return true;
    if (filterVehicle === "today") return isToday(parseISO(c.submitted_at));
    return c.vehicle_id === filterVehicle;
  });

  const todayCount = (checklists ?? []).filter(c => isToday(parseISO(c.submitted_at))).length;
  const issueStyle = (ok: boolean) => ok ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/15 text-red-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{todayCount} submitted today · {checklists?.length ?? 0} total</p>
      </div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setFilterVehicle("all")} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filterVehicle === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>All</button>
        <button onClick={() => setFilterVehicle("today")} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filterVehicle === "today" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>Today</button>
        {vehicles?.map(v => <button key={v.id} onClick={() => setFilterVehicle(v.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filterVehicle === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>{v.vehicle_no}</button>)}
      </div>
      {isLoading ? <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)}</div>
        : filtered.length ? filtered.map(c => {
          const hasIssue = !c.tyres_ok || !c.lights_ok || !c.brakes_ok || c.oil_status !== "ok";
          return (
            <div key={c.id} data-testid={`checklist-admin-${c.id}`} className={`bg-card border rounded-xl p-3 mb-2 ${hasIssue ? "border-amber-500/25" : "border-border"}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className={`w-4 h-4 ${hasIssue ? "text-amber-400" : "text-emerald-400"}`} />
                    <span className="font-bold text-foreground text-sm">{vMap[c.vehicle_id]?.vehicle_no ?? "?"}</span>
                    {hasIssue && <span className="text-xs bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">Issues</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{dMap[c.driver_id]?.name ?? "?"} · Meter: {Number(c.meter_reading).toLocaleString()} km</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{format(parseISO(c.submitted_at), "MMM d, h:mm a")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${issueStyle(c.tyres_ok)}`}>Tyres {c.tyres_ok ? "✓" : "!"}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${issueStyle(c.lights_ok)}`}>Lights {c.lights_ok ? "✓" : "!"}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${issueStyle(c.brakes_ok)}`}>Brakes {c.brakes_ok ? "✓" : "!"}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.oil_status === "ok" ? "bg-emerald-400/15 text-emerald-400" : c.oil_status === "low" ? "bg-amber-400/15 text-amber-400" : "bg-red-400/15 text-red-400"}`}>
                  Oil {c.oil_status.replace("_", " ")}
                </span>
                {c.gps_lat && <span className="text-xs bg-blue-400/15 text-blue-400 px-2 py-0.5 rounded-full font-medium">GPS ✓</span>}
                {c.meter_photo_url && (
                  <button
                    type="button"
                    onClick={() => window.open((import.meta.env.BASE_URL || '/') + 'proof-viewer?src=' + encodeURIComponent(c.meter_photo_url) + '&title=' + encodeURIComponent("Checklist Meter Photo"), '_blank')}
                    className="text-xs bg-violet-400/15 hover:bg-violet-400/25 text-violet-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="View meter photo in new tab"
                  >
                    Photo ✓ <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          );
        }) : <div className="text-center py-12 text-muted-foreground"><ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-40" /><p>No checklists yet</p></div>}
    </div>
  );
}

// TAB: GPS Map
function GPSTab() {
  const { data: vehicles = [] } = useVehicles();
  const { data: checklists = [] } = useChecklists();
  const { data: drivers = [] } = useDrivers();
  const [showEV, setShowEV] = useState(true);

  const gpsVehicles = vehicles.map(v => ({
    id: v.id,
    vehicle_no: v.vehicle_no,
    model: v.model,
    sim_gps_number: v.sim_gps_number ?? null,
    assigned_driver_id: v.assigned_driver_id ?? null,
  }));
  const gpsChecklists = checklists.map(c => ({
    vehicle_id: c.vehicle_id,
    gps_lat: c.gps_lat ?? null,
    gps_lng: c.gps_lng ?? null,
    submitted_at: c.submitted_at,
    meter_reading: c.meter_reading,
  }));
  const gpsDrivers = drivers.map(d => ({ id: d.id, name: d.name }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold text-foreground">Live GPS Tracking</p>
          <p className="text-xs text-muted-foreground">Real-time positions from last driver checklist</p>
        </div>
        <button
          onClick={() => setShowEV(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${showEV ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground"}`}
        >
          <Zap className="w-3.5 h-3.5" />
          EV Stations
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {vehicles.map(v => {
          const lastCheck = checklists
            .filter(c => c.vehicle_id === v.id)
            .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0];
          const hasGPS = lastCheck?.gps_lat && lastCheck?.gps_lng;
          const driver = drivers.find(d => d.id === v.assigned_driver_id);
          return (
            <div key={v.id} className={`bg-card border rounded-xl p-2.5 ${hasGPS ? "border-primary/30" : "border-border"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-1.5 h-1.5 rounded-full ${hasGPS ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
                <p className="text-xs font-bold text-foreground">{v.vehicle_no}</p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{v.model}</p>
              {driver && <p className="text-[11px] text-primary truncate">{driver.name}</p>}
              {v.sim_gps_number && <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1"><Navigation className="w-2.5 h-2.5" />{v.sim_gps_number}</p>}
              {!hasGPS && <p className="text-[10px] text-amber-400 mt-0.5">No GPS data yet</p>}
            </div>
          );
        })}
      </div>

      <GPSMap vehicles={gpsVehicles} checklists={gpsChecklists} drivers={gpsDrivers} showEV={showEV} />
    </div>
  );
}

// Main Manager Dashboard
export function ManagerDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "head_of_teams";
  const visibleTabs = TABS.filter(t => t.id !== "approvals" || isAdmin);

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") as Tab : "overview";
    if (hash === "ride-request") return "trip-requests";
    if (hash === "approvals" && !isAdmin) return "overview";
    return TABS.some(t => t.id === hash) ? hash : "overview";
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as Tab;
      if (hash === "ride-request" || hash === "trip-requests") {
        setActiveTab("trip-requests");
      } else if (hash === "approvals" && !isAdmin) {
        setActiveTab("overview");
      } else if (TABS.some(t => t.id === hash)) {
        setActiveTab(hash);
      } else if (!hash) {
        setActiveTab("overview");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [isAdmin]);

  const handleTabChange = (newTab: Tab) => {
    const target = newTab === "ride-request" ? "trip-requests" : (newTab === "approvals" && !isAdmin ? "overview" : newTab);
    setActiveTab(target);
    window.location.hash = target === "overview" ? "" : target;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">
              {isAdmin ? "Admin Dashboard" : "Manager Dashboard"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Full Fleet & Approval Control" : "Fleet Operations Control"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-semibold capitalize">
              {isAdmin ? "Admin" : "Manager"}
            </span>
          </div>
        </div>

        {/* Tab Bar - scrollable */}
        <div className="flex gap-1 px-3 pb-2 overflow-x-auto no-scrollbar">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => handleTabChange(t.id as Tab)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4 pb-20">
        {activeTab === "overview" && <ManagerOverviewTab setTab={handleTabChange} />}
        {activeTab === "approvals" && isAdmin && <ManagerApprovalsTab />}
        {activeTab === "fuel-reports" && <FuelReportsPage />}
        {activeTab === "vehicles" && <ManagerVehiclesTab />}
        {activeTab === "drivers" && <ManagerDriversTab />}
        {activeTab === "drivers-shift" && <ManagerShiftTab />}
        {activeTab === "repairs" && <RepairsTab />}
        {activeTab === "maintenance" && <MaintenancePage />}
        {activeTab === "costs" && <CostsTab />}
        {activeTab === "fuel" && <ManagerFuelTab />}
        {activeTab === "checklists" && <ChecklistsTab />}
        {activeTab === "gps" && <GPSTab />}
        {activeTab === "tasks" && <ManagerTasksTab />}
        {(activeTab === "trip-requests" || activeTab === "ride-request") && <ManagerTripRequestsTab />}
        {activeTab === "alerts" && <AlertsPage />}
        {activeTab === "settings" && <ManagerSettingsTab />}
      </div>
    </div>
  );
}
