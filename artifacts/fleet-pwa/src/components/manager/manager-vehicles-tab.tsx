import { useState, useMemo } from "react";
import { useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle, useToggleHideVehicle, Vehicle, normalizeVehicleNo } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useFuelLogs } from "@/hooks/use-fuel";
import { useChecklists } from "@/hooks/use-checklists";
import { useTasks, DriverTask, timeStringToMinutes } from "@/hooks/use-tasks";
import { useWashing } from "@/hooks/use-washing";
import { useVehicleMaintenance, MaintenancePart } from "@/hooks/use-vehicle-maintenance";
import { useRepairs } from "@/hooks/use-repairs";
import { useCosts } from "@/hooks/use-costs";
import { useToast } from "@/hooks/use-toast";
import { NumberPlateScanner } from "@/components/number-plate-scanner";
import { logAuditEvent } from "@/lib/audit-logger";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Car, Plus, Pencil, Trash2, ListTodo, AlertTriangle, 
  Sparkles, Fuel, Droplet, Clock, CheckCircle2, X, AlertCircle,
  Wrench, History, Copy, RotateCcw, Calendar, Check, DollarSign
} from "lucide-react";
import { differenceInDays, parseISO, format, isToday } from "date-fns";

export type VehicleForm = {
  vehicle_no: string;
  model: string;
  group: "Centres" | "Tropical";
  fuel_type: "Diesel" | "Petrol";
  tank_size: string;
  benchmark_kmpl: string;
  purchase_date: string;
  license_expiry: string;
  insurance_expiry: string;
  sim_gps_number: string;
  assigned_driver_id: string;
};

const emptyVehicleForm: VehicleForm = {
  vehicle_no: "",
  model: "",
  group: "Centres",
  fuel_type: "Diesel",
  tank_size: "45",
  benchmark_kmpl: "14",
  purchase_date: "",
  license_expiry: "",
  insurance_expiry: "",
  sim_gps_number: "",
  assigned_driver_id: "",
};

export function ManagerVehiclesTab() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { washMap = {} } = useWashing();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  const toggleHide = useToggleHideVehicle();
  const { toast } = useToast();

  const { user } = useAuth();
  const [groupFilter, setGroupFilter] = useState<"All" | "Centres" | "Tropical">("All");
  const [showHidden, setShowHidden] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    open: boolean;
    vehicle: Vehicle | null;
    typedPlate: string;
    deleting: boolean;
  }>({
    open: false,
    vehicle: null,
    typedPlate: "",
    deleting: false,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyVehicleForm);
  const [profileVehicleId, setProfileVehicleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fixOdoVehicle, setFixOdoVehicle] = useState<Vehicle | null>(null);
  const [fixOdoKm, setFixOdoKm] = useState("");
  const [fixOdoReason, setFixOdoReason] = useState("");

  const handleSaveFixOdo = async () => {
    if (!fixOdoVehicle) return;
    const km = Number(fixOdoKm);
    if (isNaN(km) || km <= 0) {
      toast({ title: "Enter a valid odometer reading", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const oldKm = fixOdoVehicle.current_km || 0;
      await updateVehicle.mutateAsync({
        id: fixOdoVehicle.id,
        updates: {
          current_km: km,
          odometer_override_km: km,
          odometer_override_at: new Date().toISOString(),
        } as any,
      });
      await logAuditEvent({
        driver_id: user?.id || null,
        driver_name: user?.name || "Manager",
        vehicle_id: fixOdoVehicle.id,
        vehicle_no: fixOdoVehicle.vehicle_no,
        action_type: "MANAGER_ODOMETER_FIX",
        status: "success",
        odometer: km,
        details: `Manager fixed live odometer for ${fixOdoVehicle.vehicle_no} from ${oldKm.toLocaleString()} km to ${km.toLocaleString()} km${fixOdoReason.trim() ? ` (${fixOdoReason.trim()})` : ""}`,
      });
      toast({
        title: "Odometer updated",
        description: `${fixOdoVehicle.vehicle_no} live odometer set to ${km.toLocaleString()} km.`,
      });
      setFixOdoVehicle(null);
      setFixOdoKm("");
      setFixOdoReason("");
    } catch (err: any) {
      toast({ title: "Failed to fix odometer", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hiddenCount = vehicles.filter(v => v.is_hidden).length;
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      if (!showHidden && v.is_hidden) return false;
      if (groupFilter === "All") return true;
      return (v.group || "Centres") === groupFilter;
    });
  }, [vehicles, showHidden, groupFilter]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyVehicleForm);
    setModalOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditingId(v.id);
    const isBike = v.model?.toLowerCase().includes("dio") || v.model?.toLowerCase().includes("bike");
    setForm({
      vehicle_no: v.vehicle_no,
      model: v.model,
      group: (v.group as "Centres" | "Tropical") || "Centres",
      fuel_type: isBike ? "Petrol" : (v.fuel_type || "Diesel"),
      tank_size: String(v.tank_size || (isBike ? 5.3 : 45)),
      benchmark_kmpl: String(v.benchmark_kmpl || 14),
      purchase_date: v.purchase_date || "",
      license_expiry: v.license_expiry || "",
      insurance_expiry: v.insurance_expiry || "",
      sim_gps_number: v.sim_gps_number || "",
      assigned_driver_id: v.assigned_driver_id || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.vehicle_no.trim() || !form.model.trim()) {
      toast({ title: "Vehicle number and model are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_no: normalizeVehicleNo(form.vehicle_no),
        model: form.model.trim(),
        group: form.group,
        fuel_type: form.fuel_type,
        tank_size: parseFloat(form.tank_size) || 45,
        benchmark_kmpl: parseFloat(form.benchmark_kmpl) || 14,
        purchase_date: form.purchase_date || null,
        license_expiry: form.license_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
        sim_gps_number: form.sim_gps_number.trim() || null,
        assigned_driver_id: form.assigned_driver_id || null,
      };

      if (editingId) {
        await updateVehicle.mutateAsync({ id: editingId, updates: payload });
        toast({ title: "Vehicle updated successfully" });
      } else {
        await createVehicle.mutateAsync(payload);
        toast({ title: "Vehicle added successfully" });
      }
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, plate: string) => {
    if (!confirm(`Are you sure you want to delete vehicle ${plate}?`)) return;
    try {
      await deleteVehicle.mutateAsync(id);
      toast({ title: "Vehicle deleted" });
    } catch {
      toast({ title: "Failed to delete vehicle", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Group Filters (Suggestion 6) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">Fleet Vehicles</p>
          <p className="text-xs text-muted-foreground">{filteredVehicles.length} vehicles listed</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Group Chips: All | Centres | Tropical */}
          <div className="flex bg-secondary/50 rounded-xl p-0.5 border border-border">
            {(["All", "Centres", "Tropical"] as const).map(grp => (
              <button
                key={grp}
                onClick={() => setGroupFilter(grp)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  groupFilter === grp
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {grp}
              </button>
            ))}
          </div>

          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-xs px-3 py-2 rounded-xl hover:opacity-90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Vehicle
          </button>
        </div>
      </div>

      {/* Vehicle Cards Grid */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
          <Car className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No vehicles found in {groupFilter} group.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVehicles.map(v => {
            const driver = drivers.find(d => d.id === v.assigned_driver_id);
            const wash = washMap[v.id] || { count: 0, photos: [] };
            const isPetrol = v.fuel_type === "Petrol";
            const currentKm = v.current_km || "—";

            return (
              <div key={v.id} className="bg-card border border-border rounded-xl p-4 shadow-sm hover:border-border/80 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Car className="w-5 h-5 text-blue-400" />
                    <span className="text-base font-bold text-foreground">{v.vehicle_no}</span>
                    <span className="text-xs text-muted-foreground">({v.model})</span>

                    {/* Group Badge */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                      {v.group || "Centres"}
                    </span>

                    {/* Fuel Type Badge (Issue 16) */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isPetrol
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      }`}
                    >
                      {v.fuel_type || "Diesel"} · {v.tank_size || 45}L
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setProfileVehicleId(v.id)}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground"
                      title="Vehicle Profile & Tasks Today"
                    >
                      <ListTodo className="w-4 h-4 text-primary" />
                    </button>
                    <button
                      onClick={() => openEdit(v)}
                      className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground"
                      title="Edit vehicle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(v.id, v.vehicle_no)}
                      className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive"
                      title="Delete vehicle"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-3 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground">Current Odo:</span>{" "}
                    <span className="font-mono font-bold text-foreground">{typeof currentKm === 'number' ? `${currentKm.toLocaleString()} km` : currentKm}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFixOdoVehicle(v);
                        setFixOdoKm(String(v.current_km || ""));
                        setFixOdoReason("");
                      }}
                      className="text-[10px] font-bold text-primary hover:underline bg-primary/10 px-1.5 py-0.5 rounded border border-primary/25"
                      title="Fix live odometer reading"
                    >
                      Fix Odometer
                    </button>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Driver:</span>{" "}
                    <span className="font-medium text-foreground">{driver?.name || "Unassigned"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Benchmark:</span>{" "}
                    <span className="font-medium text-foreground">{v.benchmark_kmpl} km/L</span>
                  </div>
                  {/* Washed This Week Counter (Suggestion 6) */}
                  <div className="flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-muted-foreground">Washed this week:</span>{" "}
                    <span className={`font-bold ${wash.count >= 3 ? "text-emerald-400" : "text-amber-400"}`}>
                      {wash.count} of 3
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Vehicle Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">{editingId ? "Edit Vehicle" : "Add Vehicle"}</h3>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-muted-foreground uppercase tracking-wide">Vehicle Plate No *</label>
                  <NumberPlateScanner onScanComplete={plate => setForm(f => ({ ...f, vehicle_no: plate }))} />
                </div>
                <input
                  type="text"
                  placeholder="e.g. DAI 1011 or BIC 6942"
                  value={form.vehicle_no}
                  onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Model *</label>
                <input
                  type="text"
                  placeholder="e.g. Bolero Maxitruck or Dio Bike"
                  value={form.model}
                  onChange={e => {
                    const modelName = e.target.value;
                    const isBike = modelName.toLowerCase().includes("dio") || modelName.toLowerCase().includes("bike");
                    setForm(f => ({
                      ...f,
                      model: modelName,
                      fuel_type: isBike ? "Petrol" : f.fuel_type,
                      tank_size: isBike ? "5.3" : f.tank_size,
                    }));
                  }}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Group, Fuel Type & Tank Size (Issue 16 & Suggestion 6) */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Group *</label>
                  <select
                    value={form.group}
                    onChange={e => setForm(f => ({ ...f, group: e.target.value as "Centres" | "Tropical" }))}
                    className="w-full bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Centres">Centres</option>
                    <option value="Tropical">Tropical</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Fuel Type *</label>
                  <select
                    value={form.fuel_type}
                    onChange={e => setForm(f => ({ ...f, fuel_type: e.target.value as "Diesel" | "Petrol" }))}
                    className="w-full bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Diesel">Diesel</option>
                    <option value="Petrol">Petrol</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Tank Size (L) *</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="45"
                    value={form.tank_size}
                    onChange={e => setForm(f => ({ ...f, tank_size: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Benchmark KMPL</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.benchmark_kmpl}
                    onChange={e => setForm(f => ({ ...f, benchmark_kmpl: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Assigned Driver</label>
                  <select
                    value={form.assigned_driver_id}
                    onChange={e => setForm(f => ({ ...f, assigned_driver_id: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">-- None --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">License Expiry</label>
                  <input
                    type="date"
                    value={form.license_expiry}
                    onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Insurance Expiry</label>
                  <input
                    type="date"
                    value={form.insurance_expiry}
                    onChange={e => setForm(f => ({ ...f, insurance_expiry: e.target.value }))}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">SIM / GPS Number</label>
                <input
                  type="text"
                  placeholder="+94771234567"
                  value={form.sim_gps_number}
                  onChange={e => setForm(f => ({ ...f, sim_gps_number: e.target.value }))}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update Vehicle" : "Add Vehicle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Profile Modal with Tasks Today & Overlap Warning */}
      {profileVehicleId && (
        <VehicleProfileModal
          vehicleId={profileVehicleId}
          onClose={() => setProfileVehicleId(null)}
          onFixOdometer={(v) => {
            setFixOdoVehicle(v);
            setFixOdoKm(String(v.current_km || ""));
            setFixOdoReason("");
          }}
        />
      )}

      {/* Fix Odometer Modal (Fix 5 & Issue A1) */}
      {fixOdoVehicle && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="font-bold text-foreground text-sm">Fix Odometer · {fixOdoVehicle.vehicle_no}</h3>
              <button onClick={() => setFixOdoVehicle(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Current live reading: <strong className="text-foreground font-mono">{(fixOdoVehicle.current_km || 0).toLocaleString()} km</strong>. Enter the verified dashboard meter reading to correct the vehicle&apos;s live odometer.
            </p>
            <div>
              <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1 text-xs">
                Correct Odometer Reading (km) *
              </label>
              <input
                type="number"
                value={fixOdoKm}
                onChange={e => setFixOdoKm(e.target.value)}
                placeholder="e.g. 39580"
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1 text-xs">
                Reason / Note
              </label>
              <input
                type="text"
                value={fixOdoReason}
                onChange={e => setFixOdoReason(e.target.value)}
                placeholder="e.g. Fixed driver typo from earlier entry"
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFixOdoVehicle(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveFixOdo}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Odometer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleProfileModal({ vehicleId, onClose, onFixOdometer }: { vehicleId: string; onClose: () => void; onFixOdometer: (v: Vehicle) => void }) {
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: fuelLogs = [] } = useFuelLogs();
  const { data: checklists = [] } = useChecklists();
  const { tasks = [] } = useTasks();
  const { data: allRepairs = [] } = useRepairs();
  const { data: allCosts = [] } = useCosts();
  const { maintenanceMap, addPart, replacePart, deletePart, copyPartsToModel } = useVehicleMaintenance();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"overview" | "maintenance" | "repairs" | "history">("overview");

  // Maintenance Part Modals
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPartName, setNewPartName] = useState("");
  const [newPartLifeKm, setNewPartLifeKm] = useState("10000");
  const [newPartFittedKm, setNewPartFittedKm] = useState("");
  const [newPartRepeatType, setNewPartRepeatType] = useState<"km" | "months">("km");
  const [newPartRepeatInterval, setNewPartRepeatInterval] = useState("10000");
  const [replacingPart, setReplacingPart] = useState<MaintenancePart | null>(null);
  const [replaceCost, setReplaceCost] = useState("");
  const [replaceDoneBy, setReplaceDoneBy] = useState("");
  const [replaceDate, setReplaceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [submittingAction, setSubmittingAction] = useState(false);

  const vehicle = vehicles.find(v => v.id === vehicleId);
  const driver = drivers.find(d => d.id === vehicle?.assigned_driver_id);
  const vFuel = (fuelLogs || []).filter(f => f.vehicle_id === vehicleId);
  const vChecks = (checklists || []).filter(c => c.vehicle_id === vehicleId);
  const vRepairs = (allRepairs || []).filter(r => r.vehicle_id === vehicleId);
  const vCosts = (allCosts || []).filter(c => c.vehicle_id === vehicleId);
  const parts = vehicleId ? (maintenanceMap[vehicleId] || []) : [];
  const currentKm = vehicle?.current_km || 0;

  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Same model vehicles for copying parts
  const sameModelVehicles = useMemo(() => {
    if (!vehicle) return [];
    return vehicles.filter(
      v => v.id !== vehicle.id && v.model.trim().toLowerCase() === vehicle.model.trim().toLowerCase()
    );
  }, [vehicles, vehicle]);

  // Tasks today for this vehicle
  const tasksToday = useMemo(() => {
    return tasks
      .filter(t => t.vehicleId === vehicleId && (t.startDate === todayStr || t.dueDate === todayStr))
      .sort((a, b) => {
        const timeA = a.startTime ? timeStringToMinutes(a.startTime) : 0;
        const timeB = b.startTime ? timeStringToMinutes(b.startTime) : 0;
        return timeA - timeB;
      });
  }, [tasks, vehicleId, todayStr]);

  // Check for overlapping tasks
  const overlappingTasks = useMemo(() => {
    if (tasksToday.length < 2) return false;
    for (let i = 0; i < tasksToday.length; i++) {
      for (let j = i + 1; j < tasksToday.length; j++) {
        const t1 = tasksToday[i];
        const t2 = tasksToday[j];
        if (t1.startTime && t1.endTime && t2.startTime && t2.endTime) {
          const s1 = timeStringToMinutes(t1.startTime);
          const e1 = timeStringToMinutes(t1.endTime);
          const s2 = timeStringToMinutes(t2.startTime);
          const e2 = timeStringToMinutes(t2.endTime);
          if (s1 < e2 && s2 < e1) {
            return true;
          }
        }
      }
    }
    return false;
  }, [tasksToday]);

  // Count parts by status
  const maintenanceStatusCounts = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let good = 0;
    parts.forEach(p => {
      const kmUsed = Math.max(0, currentKm - p.fitted_km);
      const remaining = p.life_km - kmUsed;
      if (remaining <= 0) overdue++;
      else if (remaining <= 500) dueSoon++;
      else good++;
    });
    return { overdue, dueSoon, good, total: parts.length };
  }, [parts, currentKm]);

  const handleOpenAddPart = () => {
    setNewPartName("");
    setNewPartLifeKm("10000");
    setNewPartFittedKm(String(currentKm));
    setNewPartRepeatType("km");
    setNewPartRepeatInterval("10000");
    setShowAddPart(true);
  };

  const handleSaveNewPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim() || !newPartLifeKm || isNaN(Number(newPartLifeKm))) {
      toast({ title: "Valid part name and life km required", variant: "destructive" });
      return;
    }
    setSubmittingAction(true);
    try {
      await addPart.mutateAsync({
        vehicleId,
        part: {
          name: newPartName.trim(),
          life_km: Number(newPartLifeKm),
          fitted_km: Number(newPartFittedKm) || currentKm,
          repeat_type: newPartRepeatType,
          repeat_interval: Number(newPartRepeatInterval) || Number(newPartLifeKm),
        }
      });
      toast({ title: "Maintenance part added" });
      setShowAddPart(false);
    } catch (err: any) {
      toast({ title: "Failed to add part", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleConfirmReplace = async () => {
    if (!replacingPart) return;
    setSubmittingAction(true);
    try {
      const cost = Number(replaceCost) || 0;
      await replacePart.mutateAsync({
        vehicleId,
        partId: replacingPart.id,
        currentKm,
        cost,
        vehicleNo: vehicle?.vehicle_no,
        doneBy: replaceDoneBy.trim() || "Workshop",
        doneDate: replaceDate || new Date().toISOString().split("T")[0],
      });
      toast({ title: "Part marked as replaced & recorded in History" });
      setReplacingPart(null);
      setReplaceCost("");
      setReplaceDoneBy("");
    } catch (err: any) {
      toast({ title: "Failed to replace part", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCopyPartsToModel = async () => {
    if (!sameModelVehicles.length || !parts.length) return;
    setSubmittingAction(true);
    try {
      const currentKmsMap: Record<string, number> = {};
      sameModelVehicles.forEach(v => {
        currentKmsMap[v.id] = v.current_km || 0;
      });

      await copyPartsToModel.mutateAsync({
        sourceVehicleId: vehicleId,
        targetVehicleIds: sameModelVehicles.map(v => v.id),
        currentKmsMap,
      });

      toast({
        title: "Parts Copied Successfully",
        description: `Copied ${parts.length} maintenance parts to ${sameModelVehicles.length} ${vehicle?.model} vehicles.`,
      });
    } catch (err: any) {
      toast({ title: "Copy Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingAction(false);
    }
  };

  if (!vehicle) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-base">{vehicle.vehicle_no}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-secondary text-foreground">
                  {vehicle.group || "Centres"}
                </span>
                {maintenanceStatusCounts.overdue > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    {maintenanceStatusCounts.overdue} Overdue
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{vehicle.model} · {currentKm.toLocaleString()} km</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {/* Tab navigation pills */}
        <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-border/50 bg-background/50 text-xs">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === "overview" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("maintenance")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "maintenance" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Maintenance
            {parts.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                maintenanceStatusCounts.overdue > 0 ? "bg-red-500 text-white font-bold" : "bg-secondary text-muted-foreground"
              }`}>
                {parts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("repairs")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "repairs" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Repairs ({vRepairs.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === "history" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            History ({vCosts.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-secondary/30 border border-border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground uppercase font-bold">Odometer</p>
                    <button
                      type="button"
                      onClick={() => onFixOdometer(vehicle)}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      Fix
                    </button>
                  </div>
                  <p className="text-sm font-bold text-foreground mt-0.5 font-mono">{currentKm.toLocaleString()} km</p>
                </div>
                <div className="bg-secondary/30 border border-border rounded-xl p-3">
                  <p className="text-[11px] text-muted-foreground uppercase font-bold">Benchmark</p>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5 font-mono">{vehicle.benchmark_kmpl} km/L</p>
                </div>
                <div className="bg-secondary/30 border border-border rounded-xl p-3">
                  <p className="text-[11px] text-muted-foreground uppercase font-bold">Fuel Tank</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{vehicle.tank_size || 45} L ({vehicle.fuel_type || "Diesel"})</p>
                </div>
                <div className="bg-secondary/30 border border-border rounded-xl p-3">
                  <p className="text-[11px] text-muted-foreground uppercase font-bold">Driver</p>
                  <p className="text-sm font-bold text-foreground mt-0.5 truncate">{driver ? driver.name : "Unassigned"}</p>
                </div>
              </div>

              {/* Expiry alerts */}
              {(vehicle.license_expiry || vehicle.insurance_expiry) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {vehicle.license_expiry && (
                    <div className="bg-secondary/20 border border-border rounded-xl p-2.5 flex items-center justify-between">
                      <span className="text-muted-foreground">Revenue License Expiry:</span>
                      <span className="font-mono font-medium text-foreground">{vehicle.license_expiry}</span>
                    </div>
                  )}
                  {vehicle.insurance_expiry && (
                    <div className="bg-secondary/20 border border-border rounded-xl p-2.5 flex items-center justify-between">
                      <span className="text-muted-foreground">Insurance Expiry:</span>
                      <span className="font-mono font-medium text-foreground">{vehicle.insurance_expiry}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Warning for Overlapping Tasks */}
              {overlappingTasks && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-xs">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">Schedule Clash Detected!</p>
                    <p className="text-[11px] opacity-90">
                      This vehicle has two tasks scheduled at overlapping times today. Please review assignments.
                    </p>
                  </div>
                </div>
              )}

              {/* Tasks Today */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ListTodo className="w-4 h-4 text-primary" /> Tasks Today ({tasksToday.length})
                  </h4>
                </div>

                {tasksToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No tasks scheduled for this vehicle today.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {tasksToday.map(task => (
                      <div key={task.id} className="bg-background border border-border rounded-lg p-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono font-bold text-primary mr-2">
                            {task.startTime || "--:--"} - {task.endTime || "--:--"}
                          </span>
                          <span className="font-medium text-foreground">{task.title}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize bg-secondary text-foreground">
                          {task.status.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Fuel Logs */}
              <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Fuel className="w-4 h-4 text-primary" /> Recent Fuel Logs
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {vFuel.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No fuel logs recorded.</p>
                  ) : (
                    vFuel.slice(0, 5).map(f => {
                      const kmplValue = f.kmpl_calculated != null ? `${f.kmpl_calculated.toFixed(2)} km/L` : "—";
                      return (
                        <div key={f.id} className="text-xs flex justify-between items-center bg-background border border-border p-2 rounded-lg">
                          <span className="text-muted-foreground">{f.date}</span>
                          <span className="font-mono">{f.liters} L</span>
                          <span className={`font-mono font-bold ${f.below_benchmark ? "text-red-400" : "text-emerald-400"}`}>
                            {kmplValue}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PREVENTIVE MAINTENANCE (Change 5) */}
          {activeTab === "maintenance" && (
            <div className="space-y-3.5">
              {/* Actions Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-secondary/20 border border-border rounded-xl p-3">
                <div>
                  <p className="text-xs font-bold text-foreground">Parts Lifecycle & Service Alerts</p>
                  <p className="text-[11px] text-muted-foreground">Amber warning at 500 km / 7 days, Red alert when overdue.</p>
                </div>
                <div className="flex items-center gap-2">
                  {sameModelVehicles.length > 0 && parts.length > 0 && (
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={handleCopyPartsToModel}
                      className="px-2.5 py-1.5 bg-secondary text-foreground text-xs font-semibold rounded-lg hover:bg-secondary/80 flex items-center gap-1.5 transition-all border border-border"
                      title={`Copy ${parts.length} parts to ${sameModelVehicles.length} ${vehicle.model}s`}
                    >
                      <Copy className="w-3.5 h-3.5 text-primary" />
                      <span>Copy to {sameModelVehicles.length} {vehicle.model}s</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleOpenAddPart}
                    className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:opacity-90 flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Part
                  </button>
                </div>
              </div>

              {/* Parts list */}
              {parts.length === 0 ? (
                <div className="text-center py-10 bg-card/40 border border-border rounded-xl text-muted-foreground">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30 text-primary" />
                  <p className="text-xs">No preventive maintenance parts configured for this vehicle yet.</p>
                  <button
                    onClick={handleOpenAddPart}
                    className="mt-3 text-xs text-primary font-bold hover:underline"
                  >
                    + Add your first part
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {parts.map(part => {
                    const kmUsed = Math.max(0, currentKm - part.fitted_km);
                    const remainingKm = part.life_km - kmUsed;
                    const pctUsed = Math.min(100, Math.round((kmUsed / part.life_km) * 100));
                    const isOverdue = remainingKm <= 0;
                    const isDueSoon = remainingKm > 0 && remainingKm <= 500;

                    return (
                      <div
                        key={part.id}
                        className={`bg-card border rounded-xl p-3 space-y-2 transition-all ${
                          isOverdue
                            ? "border-red-500/50 bg-red-500/5"
                            : isDueSoon
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">{part.name}</span>
                              {isOverdue && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Overdue by {Math.abs(remainingKm).toLocaleString()} km
                                </span>
                              )}
                              {isDueSoon && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" /> Due soon: {remainingKm.toLocaleString()} km left
                                </span>
                              )}
                              {!isOverdue && !isDueSoon && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  {remainingKm.toLocaleString()} km left
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Fitted at {part.fitted_km.toLocaleString()} km · Life span: {part.life_km.toLocaleString()} km · Last replaced: {part.last_replaced_date || "N/A"}{part.last_done_by ? ` (${part.last_done_by})` : ""}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                setReplacingPart(part);
                                setReplaceCost("");
                                setReplaceDoneBy(part.last_done_by || "Company Workshop");
                                setReplaceDate(new Date().toISOString().split("T")[0]);
                              }}
                              className="px-2 py-1 bg-secondary hover:bg-primary/20 text-foreground hover:text-primary rounded-lg text-xs font-semibold flex items-center gap-1 border border-border"
                              title="Mark Replaced & record cost"
                            >
                              <RotateCcw className="w-3 h-3" /> Replaced
                            </button>
                            <button
                              onClick={() => deletePart.mutateAsync({ vehicleId, partId: part.id })}
                              className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg"
                              title="Delete part"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-secondary/50 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverdue ? "bg-red-500" : isDueSoon ? "bg-amber-400" : "bg-emerald-400"
                            }`}
                            style={{ width: `${pctUsed}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: REPAIRS (Change 5) */}
          {activeTab === "repairs" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-foreground">Repair Requests & Work Orders</p>
                <span className="text-xs text-muted-foreground">{vRepairs.length} total</span>
              </div>

              {vRepairs.length === 0 ? (
                <div className="text-center py-10 bg-card/40 border border-border rounded-xl text-muted-foreground">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No repair requests logged for this vehicle.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vRepairs.map((repair: any) => {
                    const reporter = drivers.find(d => d.id === repair.driver_id);
                    const isPending = repair.status === "pending";
                    return (
                      <div
                        key={repair.id}
                        className="bg-card border border-border rounded-xl p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-foreground">{repair.description}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize border ${
                            repair.status === "completed"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : repair.status === "approved"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          }`}>
                            {repair.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Reported by {reporter?.name || "Driver"} · {repair.created_at ? format(parseISO(repair.created_at), "dd MMM yyyy") : "N/A"}</span>
                          {repair.estimated_cost && (
                            <span className="font-mono text-foreground font-semibold">
                              Est: Rs. {Number(repair.estimated_cost).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTORY (Change 5) */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-foreground">Service & Maintenance Ledger</p>
                <p className="text-xs text-muted-foreground">
                  Total Spent: <span className="font-bold text-foreground font-mono">
                    Rs. {vCosts.reduce((s, c) => s + Number(c.amount || 0), 0).toLocaleString()}
                  </span>
                </p>
              </div>

              {vCosts.length === 0 ? (
                <div className="text-center py-10 bg-card/40 border border-border rounded-xl text-muted-foreground">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No service or cost entries recorded for this vehicle.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {vCosts.map(c => (
                    <div
                      key={c.id}
                      className="bg-card border border-border rounded-xl p-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-medium text-foreground truncate">{c.description || "Service Entry"}</p>
                        <p className="text-[11px] text-muted-foreground">{c.date} · <span className="capitalize">{c.category}</span></p>
                      </div>
                      <span className="font-mono font-bold text-foreground shrink-0">
                        Rs. {Number(c.amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 bg-secondary text-foreground font-semibold rounded-xl text-xs hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Submodal: Add Part */}
      {showAddPart && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-xl">
            <h4 className="font-bold text-sm text-foreground">Add Maintenance Part</h4>
            <form onSubmit={handleSaveNewPart} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Part Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Engine Oil, Front Brake Pads, Battery"
                  value={newPartName}
                  onChange={e => setNewPartName(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Lifespan (KM) *</label>
                <input
                  type="number"
                  placeholder="10000"
                  value={newPartLifeKm}
                  onChange={e => {
                    setNewPartLifeKm(e.target.value);
                    setNewPartRepeatInterval(e.target.value);
                  }}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Fitted At (KM)</label>
                <input
                  type="number"
                  placeholder={String(currentKm)}
                  value={newPartFittedKm}
                  onChange={e => setNewPartFittedKm(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1">Repeat Rule</label>
                <div className="flex gap-2">
                  <select
                    value={newPartRepeatType}
                    onChange={e => setNewPartRepeatType(e.target.value as "km" | "months")}
                    className="flex-1 bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="km">Every X km</option>
                    <option value="months">Every X months</option>
                  </select>
                  <input
                    type="number"
                    value={newPartRepeatInterval}
                    onChange={e => setNewPartRepeatInterval(e.target.value)}
                    className="w-24 bg-background border border-input rounded-xl px-2.5 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddPart(false)}
                  className="flex-1 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !newPartName.trim()}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs disabled:opacity-50"
                >
                  {submittingAction ? "Saving..." : "Add Part"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submodal: Mark Replaced */}
      {replacingPart && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-xl">
            <h4 className="font-bold text-sm text-foreground">Mark Part as Replaced</h4>
            <p className="text-xs text-muted-foreground">
              Reset lifecycle for <strong className="text-foreground">{replacingPart.name}</strong> to current odometer ({currentKm.toLocaleString()} km).
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1 text-xs">
                  Done by (Workshop) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Company Workshop"
                  value={replaceDoneBy}
                  onChange={e => setReplaceDoneBy(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1 text-xs">
                  Date Replaced *
                </label>
                <input
                  type="date"
                  value={replaceDate}
                  onChange={e => setReplaceDate(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-muted-foreground uppercase tracking-wide block mb-1 text-xs">
                Service / Part Cost (Rs., Optional)
              </label>
              <input
                type="number"
                placeholder="e.g. 8500"
                value={replaceCost}
                onChange={e => setReplaceCost(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Automatically recorded in the vehicle&apos;s History tab.</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReplacingPart(null)}
                className="flex-1 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmReplace}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500"
              >
                {submittingAction ? "Saving..." : "Confirm Replacement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
