import { useState } from "react";
import { useCosts, useCreateCost } from "@/hooks/use-costs";
import { useVehicles } from "@/hooks/use-vehicles";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, Fuel, Wrench, Plus, X } from "lucide-react";

type Category = "fuel" | "service" | "other";

const CAT_ICONS: Record<Category, React.ElementType> = { fuel: Fuel, service: Wrench, other: DollarSign };
const CAT_COLORS: Record<Category, string> = { fuel: "#3b82f6", service: "#f97316", other: "#a78bfa" };

export function CostsPage() {
  const { data: costs, isLoading } = useCosts();
  const { data: vehicles } = useVehicles();
  const { toast } = useToast();
  const addCost = useCreateCost();

  const [filterVehicle, setFilterVehicle] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formCategory, setFormCategory] = useState<Category>("fuel");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);

  const vehicleMap = Object.fromEntries(vehicles?.map(v => [v.id, v]) ?? []);

  const filtered = filterVehicle === "all" ? (costs ?? []) : (costs ?? []).filter(c => c.vehicle_id === filterVehicle);

  // Summary per vehicle
  const vehicleSummary = (vehicles ?? []).map(v => {
    const vCosts = (costs ?? []).filter(c => c.vehicle_id === v.id);
    return {
      vehicle: v.vehicle_no,
      fuel: vCosts.filter(c => c.category === "fuel").reduce((s, c) => s + Number(c.amount), 0),
      service: vCosts.filter(c => c.category === "service").reduce((s, c) => s + Number(c.amount), 0),
      other: vCosts.filter(c => c.category === "other").reduce((s, c) => s + Number(c.amount), 0),
    };
  });

  const totals = {
    fuel: filtered.filter(c => c.category === "fuel").reduce((s, c) => s + Number(c.amount), 0),
    service: filtered.filter(c => c.category === "service").reduce((s, c) => s + Number(c.amount), 0),
    other: filtered.filter(c => c.category === "other").reduce((s, c) => s + Number(c.amount), 0),
  };
  const grandTotal = totals.fuel + totals.service + totals.other;

  const handleAdd = async () => {
    if (!formVehicleId || !formAmount) {
      toast({ title: "Vehicle and amount required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await addCost.mutateAsync({ vehicle_id: formVehicleId, category: formCategory, amount: Number(formAmount), description: formDescription.trim() || null, date: formDate });
      toast({ title: "Cost entry added" });
      setFormAmount(""); setFormDescription(""); setShowModal(false);
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Cost Dashboard</h1>
        <button data-testid="btn-add-cost" onClick={() => { setShowModal(true); setFormVehicleId(vehicles?.[0]?.id ?? ""); }} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" />Add
        </button>
      </div>

      {/* Total Summary Cards */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div data-testid="card-total-cost" className="col-span-2 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Running Cost</span>
          </div>
          <div className="text-3xl font-bold text-foreground">Rs. {grandTotal.toLocaleString()}</div>
        </div>
        {(["fuel", "service", "other"] as Category[]).map(cat => {
          const Icon = CAT_ICONS[cat];
          return (
            <div key={cat} data-testid={`card-${cat}-cost`} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: CAT_COLORS[cat] }} />
                <span className="text-xs text-muted-foreground capitalize">{cat}</span>
              </div>
              <div className="text-lg font-bold text-foreground">Rs. {totals[cat].toLocaleString()}</div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      {vehicleSummary.length > 0 && vehicleSummary.some(v => v.fuel + v.service + v.other > 0) && (
        <div className="mx-4 bg-card border border-border rounded-xl p-4 mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Cost by Vehicle</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vehicleSummary} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="vehicle" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e2a3b", border: "1px solid #334155", borderRadius: "8px", color: "#f1f5f9" }} formatter={(v: number) => [`Rs. ${Number(v).toLocaleString()}`, ""]} />
              <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
              <Bar dataKey="fuel" fill={CAT_COLORS.fuel} radius={[4, 4, 0, 0]} name="Fuel" />
              <Bar dataKey="service" fill={CAT_COLORS.service} radius={[4, 4, 0, 0]} name="Service" />
              <Bar dataKey="other" fill={CAT_COLORS.other} radius={[4, 4, 0, 0]} name="Other" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filter */}
      <div className="px-4 flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => setFilterVehicle("all")} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${filterVehicle === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>All</button>
        {vehicles?.map(v => (
          <button key={v.id} onClick={() => setFilterVehicle(v.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${filterVehicle === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>{v.vehicle_no}</button>
        ))}
      </div>

      {/* Cost Entries */}
      <div className="p-4 space-y-2">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)
        ) : filtered.length > 0 ? filtered.map(c => {
          const Icon = CAT_ICONS[c.category as Category];
          return (
            <div key={c.id} data-testid={`cost-item-${c.id}`} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${CAT_COLORS[c.category as Category]}20` }}>
                <Icon className="w-4 h-4" style={{ color: CAT_COLORS[c.category as Category] }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-sm font-medium capitalize">{c.category}{c.description ? ` - ${c.description}` : ""}</p>
                <p className="text-xs text-muted-foreground">{vehicleMap[c.vehicle_id]?.vehicle_no ?? "-"} &bull; {c.date}</p>
              </div>
              <span className="text-foreground font-semibold text-sm">Rs. {Number(c.amount).toLocaleString()}</span>
            </div>
          );
        }) : (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No cost entries</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">Add Cost Entry</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Vehicle *</label>
                <select value={formVehicleId} onChange={e => setFormVehicleId(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm">
                  {vehicles?.map(v => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Category *</label>
                <div className="flex gap-2">
                  {(["fuel", "service", "other"] as Category[]).map(cat => (
                    <button key={cat} onClick={() => setFormCategory(cat)} className={`flex-1 py-2 rounded-xl text-sm font-medium border capitalize transition-all ${formCategory === cat ? "border-primary text-primary bg-primary/15" : "border-border text-muted-foreground"}`}>{cat}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Amount (Rs.) *</label>
                <input type="number" placeholder="e.g. 5000" value={formAmount} onChange={e => setFormAmount(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
                <input type="text" placeholder="Optional details" value={formDescription} onChange={e => setFormDescription(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-sm">Cancel</button>
              <button data-testid="btn-save-cost" onClick={handleAdd} disabled={submitting} className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {submitting ? "Saving..." : "Add Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

