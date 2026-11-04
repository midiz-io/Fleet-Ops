import { useState } from "react";
import { useDrivers, useCreateDriver, useUpdateDriver, useDeleteDriver, Driver } from "@/hooks/use-drivers";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Pencil, Trash2, X, Star, Phone, Calendar } from "lucide-react";
import Swal from "sweetalert2";

type DriverForm = {
  name: string;
  phone: string;
  pin: string;
  role: "manager" | "driver" | "team_leader" | "security" | "admin" | "head_of_teams" | string;
  group: "Centres" | "Tropical";
  dob: string;
  license_no: string;
  license_expiry: string;
};

const empty: DriverForm = {
  name: "",
  phone: "",
  pin: "",
  role: "driver",
  group: "Centres",
  dob: "",
  license_no: "",
  license_expiry: "",
};

function getRoleBadge(role: string) {
  switch (role) {
    case "admin":
      return { label: "Admin", class: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
    case "manager":
      return { label: "Manager", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    case "team_leader":
    case "head_of_teams":
      return { label: "Head of Teams", class: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "security":
      return { label: "Security", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "driver":
    default:
      return { label: "Driver", class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  }
}

export function DriversManagerPage() {
  const { data: drivers, isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DriverForm>(empty);
  const [submitting, setSubmitting] = useState(false);

  const openNew = () => {
    setForm(empty);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (d: Driver) => {
    setForm({
      name: d.name,
      phone: d.phone,
      pin: "",
      role: d.role,
      group: (d.group as "Centres" | "Tropical") || "Centres",
      dob: d.dob || "",
      license_no: d.license_no ?? "",
      license_expiry: d.license_expiry ?? "",
    });
    setEditId(d.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      Swal.fire({ title: "Validation Error", text: "Name and Phone required", icon: "warning" });
      return;
    }
    if (!editId && (!form.pin || form.pin.length !== 4)) {
      Swal.fire({ title: "Validation Error", text: "PIN must be exactly 4 digits", icon: "warning" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        pin: form.pin,
        role: form.role as any,
        group: form.group,
        dob: form.dob || null,
        license_no: form.license_no.trim() || null,
        license_expiry: form.license_expiry || null,
        incentive_points: 0,
      };
      if (editId) {
        await updateDriver.mutateAsync({ id: editId, updates: payload });
        Swal.fire({ title: "Success", text: "Driver updated successfully", icon: "success", timer: 2000, showConfirmButton: false });
      } else {
        await createDriver.mutateAsync(payload);
        Swal.fire({ title: "Success", text: "Driver added successfully", icon: "success", timer: 2000, showConfirmButton: false });
      }
      setShowModal(false);
    } catch (err: unknown) {
      Swal.fire({ title: "Error", text: err instanceof Error ? err.message : "Failed to save driver", icon: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you want to delete ${name}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#3b82f6",
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteDriver.mutateAsync(id);
      Swal.fire({ title: "Deleted!", text: "Driver has been deleted.", icon: "success", timer: 2000, showConfirmButton: false });
    } catch {
      Swal.fire({ title: "Error", text: "Failed to delete driver.", icon: "error" });
    }
  };

  const set = (k: keyof DriverForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Drivers</h1>
        <button data-testid="btn-add-driver" onClick={openNew} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />Add
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          [1, 2].map(i => <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />)
        ) : drivers && drivers.length > 0 ? (
          drivers.map(d => {
            const badge = getRoleBadge(d.role);
            return (
              <div key={d.id} data-testid={`driver-card-${d.id}`} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                      {d.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{d.name}</p>
                        {d.group && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            d.group === "Tropical" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          }`}>
                            {d.group}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-0.5">
                        <Phone className="w-3.5 h-3.5" />
                        {d.phone}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button data-testid={`btn-edit-driver-${d.id}`} onClick={() => openEdit(d)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button data-testid={`btn-delete-driver-${d.id}`} onClick={() => handleDelete(d.id, d.name)} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.class}`}>
                    {badge.label}
                  </span>
                  <div className="flex items-center gap-1 text-amber-400 text-sm font-medium">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {d.incentive_points} pts
                  </div>
                  {d.license_no && <span className="text-xs text-muted-foreground">Lic: {d.license_no}</span>}
                  {d.dob && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      DOB: {d.dob}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No drivers yet</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="font-bold text-foreground">{editId ? "Edit Driver" : "Add Driver"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-secondary rounded-lg"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              {([
                { k: "name", label: "Full Name *", placeholder: "Kamal Perera" },
                { k: "phone", label: "Phone *", placeholder: "e.g. 07X XXXXXXX" },
                { k: "pin", label: `PIN ${editId ? "(leave blank to keep)" : "*"}`, placeholder: "4 digits", type: "password", maxLength: 4 },
                { k: "dob", label: "Date of Birth (DOB)", type: "date" },
                { k: "license_no", label: "License No", placeholder: "B1234567" },
                { k: "license_expiry", label: "License Expiry", type: "date" },
              ] as Array<{ k: keyof DriverForm; label: string; placeholder?: string; type?: string; maxLength?: number }>).map(({ k, label, placeholder, type, maxLength }) => (
                <div key={k}>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
                  <input
                    data-testid={`input-driver-${k}`}
                    type={type ?? "text"}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    value={form[k]}
                    onChange={set(k)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Role *</label>
                  <select
                    data-testid="select-driver-role"
                    value={form.role}
                    onChange={set("role")}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    <option value="driver">Driver</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="team_leader">Head of Teams</option>
                    <option value="security">Security</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Group *</label>
                  <select
                    data-testid="select-driver-group"
                    value={form.group}
                    onChange={set("group")}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    <option value="Centres">Centres</option>
                    <option value="Tropical">Tropical</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border sticky bottom-0 bg-card">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-border text-muted-foreground font-medium py-2.5 rounded-xl text-sm hover:bg-secondary transition-colors">Cancel</button>
              <button
                data-testid="btn-save-driver"
                onClick={handleSave}
                disabled={submitting}
                className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {submitting ? "Saving..." : editId ? "Update" : "Add Driver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
