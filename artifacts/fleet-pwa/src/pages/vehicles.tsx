import { useState } from "react";
import { useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle } from "@/hooks/use-vehicles";
import { useDrivers } from "@/hooks/use-drivers";
import { useToast } from "@/hooks/use-toast";
import { Car, Plus, AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { NumberPlateScanner } from "@/components/number-plate-scanner";

type VehicleForm = {
  vehicle_no: string; model: string; benchmark_kmpl: string;
  purchase_date: string; license_expiry: string; insurance_expiry: string;
  sim_gps_number: string; assigned_driver_id: string; fuel_type: "Petrol" | "Diesel";
};

const empty: VehicleForm = { vehicle_no: "", model: "", benchmark_kmpl: "14", purchase_date: "", license_expiry: "", insurance_expiry: "", sim_gps_number: "", assigned_driver_id: "", fuel_type: "Diesel" };

function expiryColor(date: string | null) {
  if (!date) return "";
  const d = differenceInDays(parseISO(date), new Date());
  if (d < 0) return "text-red-400";
  if (d < 30) return "text-red-400";
  if (d < 60) return "text-amber-400";
  return "text-muted-foreground";
}

export function VehiclesPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const { data: drivers } = useDrivers();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(empty);
  const [submitting, setSubmitting] = useState(false);

  const driverList = drivers?.filter(d => d.role === "driver") ?? [];

  const openNew = () => { setForm(empty); setEditId(null); setShowModal(true); };
  const openEdit = (v: NonNullable<typeof vehicles>[0]) => {
    setForm({
      vehicle_no: v.vehicle_no, model: v.model, benchmark_kmpl: String(v.benchmark_kmpl),
      purchase_date: v.purchase_date ?? "", license_expiry: v.license_expiry ?? "",
      insurance_expiry: v.insurance_expiry ?? "", sim_gps_number: v.sim_gps_number ?? "",
      assigned_driver_id: v.assigned_driver_id ?? "",
      fuel_type: (v.fuel_type === "Petrol" ? "Petrol" : "Diesel"),
    });
    setEditId(v.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vehicle_no.trim() || !form.model.trim()) {
      toast({ title: "Vehicle No and Model required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        vehicle_no: form.vehicle_no.trim().toUpperCase(),
        model: form.model.trim(),
        benchmark_kmpl: Number(form.benchmark_kmpl) || 14,
        purchase_date: form.purchase_date || null,
        license_expiry: form.license_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
        sim_gps_number: form.sim_gps_number.trim() || null,
        assigned_driver_id: form.assigned_driver_id || null,
        fuel_type: form.fuel_type || "Diesel",
      };
      if (editId) {
        await updateVehicle.mutateAsync({ id: editId, updates: payload });
        toast({ title: "Vehicle updated" });
      } else {
        await createVehicle.mutateAsync(payload);
        toast({ title: "Vehicle added" });
      }
      setShowModal(false);
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, vehicleNo: string) => {
    if (!confirm(`Delete vehicle ${vehicleNo}?`)) return;
    try {
      await deleteVehicle.mutateAsync(id);
      toast({ title: "Vehicle deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const set = (k: keyof VehicleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Vehicles</h1>
        <button data-testid="btn-add-vehicle" onClick={openNew} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" />Add
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />)
        ) : vehicles && vehicles.length > 0 ? vehicles.map(v => {
          const driver = driverList.find(d => d.id === v.assigned_driver_id);
          const hasAlert = (v.license_expiry && differenceInDays(parseISO(v.license_expiry), new Date()) < 30) ||
            (v.insurance_expiry && differenceInDays(parseISO(v.insurance_expiry), new Date()) < 30);
          return (
            <div key={v.id} data-testid={`vehicle-card-${v.id}`} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-primary" />
                  <span className="text-lg font-bold text-foreground">{v.vehicle_no}</span>
                  {hasAlert && <AlertTriangle className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex gap-1">
                  <button data-testid={`btn-edit-${v.id}`} onClick={() => openEdit(v)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button data-testid={`btn-delete-${v.id}`} onClick={() => handleDelete(v.id, v.vehicle_no)} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-muted-foreground text-sm">{v.model} - {v.benchmark_kmpl} km/L benchmark</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  v.fuel_type === "Petrol"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                }`}>
                  {v.fuel_type || "Diesel"}
                </span>
              </div>
              {driver && <p className="text-sm text-foreground mb-2">Driver: <span className="font-medium">{driver.name}</span></p>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {v.license_expiry && (
                  <div>
                    <span className="text-muted-foreground">License: </span>
                    <span className={expiryColor(v.license_expiry)}>{format(parseISO(v.license_expiry), "MMM d, yyyy")}</span>
                  </div>
                )}
                {v.insurance_expiry && (
                  <div>
                    <span className="text-muted-foreground">Insurance: </span>
                    <span className={expiryColor(v.insurance_expiry)}>{format(parseISO(v.insurance_expiry), "MMM d, yyyy")}</span>
                  </div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="text-center py-12 text-muted-foreground">
            <Car className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No vehicles yet</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">{editId ? "Edit Vehicle" : "Add Vehicle"}</h2>
              <button data-testid="btn-close-vehicle-modal" onClick={() => setShowModal(false)} className="p-1 hover:bg-secondary rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {([
                { k: "vehicle_no", label: "Vehicle No *", placeholder: "GAI 1005" },
                { k: "model", label: "Model *", placeholder: "Bolero" },
                { k: "benchmark_kmpl", label: "Benchmark KMPL", placeholder: "14", type: "number" },
                { k: "purchase_date", label: "Purchase Date", type: "date" },
                { k: "license_expiry", label: "License Expiry", type: "date" },
                { k: "insurance_expiry", label: "Insurance Expiry", type: "date" },
                { k: "sim_gps_number", label: "SIM/GPS Number", placeholder: "+94771000001" },
              ] as Array<{ k: keyof VehicleForm; label: string; placeholder?: string; type?: string }>).map(({ k, label, placeholder, type }) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-muted-foreground">{label}</label>
                    {k === "vehicle_no" && (
                      <NumberPlateScanner
                        onScanComplete={(plate) => setForm(f => ({ ...f, vehicle_no: plate }))}
                      />
                    )}
                  </div>
                  <input
                    data-testid={`input-vehicle-${k}`}
                    type={type ?? "text"}
                    placeholder={placeholder}
                    value={form[k]}
                    onChange={set(k)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Fuel Type</label>
                <select
                  data-testid="select-vehicle-fuel-type"
                  value={form.fuel_type}
                  onChange={set("fuel_type")}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Petrol">Petrol</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Assigned Driver</label>
                <select
                  data-testid="select-vehicle-driver"
                  value={form.assigned_driver_id}
                  onChange={set("assigned_driver_id")}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="">None</option>
                  {driverList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-border text-muted-foreground font-medium py-2.5 rounded-xl text-sm">Cancel</button>
              <button
                data-testid="btn-save-vehicle"
                onClick={handleSave}
                disabled={submitting}
                className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {submitting ? "Saving..." : editId ? "Update" : "Add Vehicle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

