import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVehicles } from "@/hooks/use-vehicles";
import { useVehicleMaintenance, MaintenancePart } from "@/hooks/use-vehicle-maintenance";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/language-toggle";
import { 
  Wrench, AlertTriangle, CheckCircle2, RotateCcw, Plus, DollarSign, 
  Car, Copy, Trash2, Clock, Check, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function MaintenancePage() {
  const { user } = useAuth();
  const { data: vehicles } = useVehicles();
  const { maintenanceMap, addPart, replacePart, deletePart, copyPartsToModel } = useVehicleMaintenance();
  const { t } = useLanguage();
  const { toast } = useToast();

  const isManager = user?.role === "manager" || user?.role === "admin";
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [replacingPart, setReplacingPart] = useState<MaintenancePart | null>(null);
  const [replaceCost, setReplaceCost] = useState("");
  const [replaceDoneBy, setReplaceDoneBy] = useState("");
  const [replaceDate, setReplaceDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Add Part Form
  const [partName, setPartName] = useState("");
  const [fittedKm, setFittedKm] = useState("");
  const [lifeKm, setLifeKm] = useState("10000");
  const [repeatType, setRepeatType] = useState<"km" | "months">("km");
  const [repeatInterval, setRepeatInterval] = useState("10000");

  useEffect(() => {
    if (vehicles && vehicles.length > 0 && !selectedVehicleId) {
      // If driver, prefer their assigned vehicle
      const driverVehicle = vehicles.find(v => v.assigned_driver_id === user?.id);
      setSelectedVehicleId(driverVehicle ? driverVehicle.id : vehicles[0].id);
    }
  }, [vehicles, selectedVehicleId, user?.id]);

  const selectedVehicle = vehicles?.find(v => v.id === selectedVehicleId);
  const currentVehicleKm = selectedVehicle?.current_km || 0;
  const parts = selectedVehicleId ? (maintenanceMap[selectedVehicleId] || []) : [];

  // Same model vehicles for copying
  const sameModelVehicles = vehicles?.filter(
    v => v.id !== selectedVehicleId && v.model.toLowerCase() === selectedVehicle?.model.toLowerCase()
  ) || [];

  const handleOpenAdd = () => {
    setPartName("");
    setFittedKm(String(currentVehicleKm));
    setLifeKm("10000");
    setRepeatType("km");
    setRepeatInterval("10000");
    setShowAddModal(true);
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim() || !lifeKm || isNaN(Number(lifeKm))) {
      toast({ title: "Valid part name and lifespan KM required", variant: "destructive" });
      return;
    }

    try {
      await addPart.mutateAsync({
        vehicleId: selectedVehicleId,
        part: {
          name: partName.trim(),
          fitted_km: Number(fittedKm) || currentVehicleKm,
          life_km: Number(lifeKm),
          repeat_type: repeatType,
          repeat_interval: Number(repeatInterval) || Number(lifeKm),
        },
      });
      toast({ title: "Part added successfully" });
      setShowAddModal(false);
    } catch (err: any) {
      toast({ title: "Failed to add part", description: err.message, variant: "destructive" });
    }
  };

  const handleConfirmReplace = async () => {
    if (!replacingPart) return;
    try {
      const cost = Number(replaceCost) || 0;
      await replacePart.mutateAsync({
        vehicleId: selectedVehicleId,
        partId: replacingPart.id,
        currentKm: currentVehicleKm,
        cost,
        vehicleNo: selectedVehicle?.vehicle_no,
        doneBy: replaceDoneBy.trim() || user?.name || "Workshop",
        doneDate: replaceDate || new Date().toISOString().split("T")[0],
      });

      toast({
        title: "Part Replaced ✓",
        description: `${replacingPart.name} cycle reset to current odometer (${currentVehicleKm.toLocaleString()} km). Next reminder auto-scheduled!`,
      });
      setReplacingPart(null);
      setReplaceCost("");
      setReplaceDoneBy("");
    } catch (err: any) {
      toast({ title: "Failed to replace part", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyParts = async () => {
    if (sameModelVehicles.length === 0 || parts.length === 0) return;
    try {
      const currentKmsMap: Record<string, number> = {};
      vehicles?.forEach(v => {
        currentKmsMap[v.id] = v.current_km || 0;
      });

      await copyPartsToModel.mutateAsync({
        sourceVehicleId: selectedVehicleId,
        targetVehicleIds: sameModelVehicles.map(v => v.id),
        currentKmsMap,
      });

      toast({
        title: "Parts Copied Successfully",
        description: `Copied ${parts.length} parts to ${sameModelVehicles.length} other ${selectedVehicle?.model} vehicle(s).`,
      });
    } catch (err: any) {
      toast({ title: "Failed to copy parts", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary p-3 rounded-xl">
            <Wrench className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Preventive Maintenance & Part Lifespan</h1>
            <p className="text-xs text-muted-foreground">
              Calculated dynamically from live checklist readings. Only manager can replace parts.
            </p>
          </div>
        </div>
        <LanguageToggle />
      </div>

      {/* Vehicle Selector Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-border no-scrollbar">
        {vehicles?.map(v => (
          <button
            key={v.id}
            onClick={() => setSelectedVehicleId(v.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 ${
              selectedVehicleId === v.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground hover:text-foreground border-border"
            }`}
          >
            <Car className="w-4 h-4" />
            {v.vehicle_no} - {v.model}
          </button>
        ))}
      </div>

      {/* Active Vehicle Status Bar & Manager Actions */}
      {selectedVehicle && (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">{selectedVehicle.vehicle_no}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold">
                {selectedVehicle.model}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                {selectedVehicle.fuel_type || "Diesel"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Current Live Odometer: <span className="text-foreground font-bold font-mono">{currentVehicleKm.toLocaleString()} km</span>
              {" "}· {parts.length} part(s) tracked
            </p>
          </div>

          {isManager && (
            <div className="flex items-center gap-2 flex-wrap">
              {sameModelVehicles.length > 0 && parts.length > 0 && (
                <button
                  onClick={handleCopyParts}
                  className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs px-3 py-2 rounded-xl border border-border transition-colors"
                  title={`Copy parts to other ${selectedVehicle.model} vehicles`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy to {sameModelVehicles.length} {selectedVehicle.model}(s)
                </button>
              )}
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-xs px-3 py-2 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Part
              </button>
            </div>
          )}
        </div>
      )}

      {/* Parts Lifespan Cards Grid */}
      {parts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground space-y-3">
          <Wrench className="w-10 h-10 mx-auto opacity-30" />
          <h3 className="text-base font-bold text-foreground">No maintenance parts for this vehicle</h3>
          <p className="text-xs max-w-md mx-auto text-muted-foreground leading-relaxed">
            {isManager
              ? "Every vehicle starts empty. Add maintenance parts (e.g. Engine Oil, Tyres, Brake Pads) to begin tracking wear based on daily odometer readings."
              : "No parts configured by fleet manager yet. Daily inspection readings will automatically update maintenance once parts are assigned."}
          </p>
          {isManager && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-4 py-2 rounded-xl mt-2"
            >
              <Plus className="w-4 h-4" /> Add First Part
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parts.map(part => {
            const usedKm = Math.max(0, currentVehicleKm - (part.fitted_km || 0));
            const usagePercent = part.life_km > 0 ? Math.min(100, Math.round((usedKm / part.life_km) * 100)) : 0;
            const isRed = usagePercent >= 100;
            const isAmber = usagePercent >= 90 && usagePercent < 100;
            const isOk = usagePercent < 90;

            return (
              <Card
                key={part.id}
                className={`border transition-all shadow-sm ${
                  isRed
                    ? "border-red-500/50 bg-red-950/10"
                    : isAmber
                    ? "border-amber-500/50 bg-amber-950/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-foreground">{part.name}</CardTitle>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isRed
                            ? "bg-red-500/20 text-red-400 border-red-500/40"
                            : isAmber
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        }`}
                      >
                        {isRed ? "Change now" : isAmber ? "Due soon" : "OK"}
                      </Badge>
                      {isManager && (
                        <button
                          onClick={() => deletePart.mutate({ vehicleId: selectedVehicleId, partId: part.id })}
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="Delete part"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    every {part.life_km.toLocaleString()} km &bull; fitted at {part.fitted_km.toLocaleString()} km
                  </p>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="text-muted-foreground">
                        {usedKm.toLocaleString()} / {part.life_km.toLocaleString()} km
                      </span>
                      <span className={`font-bold ${isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-emerald-400"}`}>
                        {usagePercent}%
                      </span>
                    </div>
                    <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden border border-border">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isRed ? "bg-red-500" : isAmber ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                    <span>Last replaced: {part.last_replaced_date || "New"}{part.last_done_by ? ` (${part.last_done_by})` : ""}</span>
                    <span>Repeats: every {(part.repeat_interval || part.life_km).toLocaleString()} {part.repeat_type === "months" ? "mo" : "km"}</span>
                  </div>

                  {/* Replaced Button - Manager Only */}
                  {isManager ? (
                    <button
                      onClick={() => {
                        setReplacingPart(part);
                        setReplaceCost("");
                        setReplaceDoneBy(part.last_done_by || "Company Workshop");
                        setReplaceDate(new Date().toISOString().split("T")[0]);
                      }}
                      className="w-full bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-border active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" /> Replaced ✓
                    </button>
                  ) : (
                    <div className="text-center text-[11px] text-muted-foreground py-1 bg-secondary/30 rounded-lg">
                      Managed by Fleet Manager
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Part Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm">Add Maintenance Part</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePart} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Part Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Engine Oil, Tyres, Brake Pads"
                  value={partName}
                  onChange={e => setPartName(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Fitted at Odometer (km)
                  </label>
                  <input
                    type="number"
                    value={fittedKm}
                    onChange={e => setFittedKm(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Default: vehicle current km</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Life in km *
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={lifeKm}
                    onChange={e => {
                      setLifeKm(e.target.value);
                      setRepeatInterval(e.target.value);
                    }}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Repeat Rule
                </label>
                <div className="flex gap-2">
                  <select
                    value={repeatType}
                    onChange={e => setRepeatType(e.target.value as any)}
                    className="flex-1 bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="km">Every X km</option>
                    <option value="months">Every X months</option>
                  </select>
                  <input
                    type="number"
                    value={repeatInterval}
                    onChange={e => setRepeatInterval(e.target.value)}
                    className="w-32 bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  When marked replaced, the next reminder starts by itself.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl text-xs font-bold shadow-md"
                >
                  Add Part
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Replacement Modal */}
      {replacingPart && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm">Confirm Part Replaced ✓</h3>
              <button onClick={() => setReplacingPart(null)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Marking <span className="font-bold text-foreground">{replacingPart.name}</span> as replaced on{" "}
                <span className="font-bold text-foreground">{selectedVehicle?.vehicle_no}</span> at current odometer{" "}
                <span className="font-bold font-mono text-foreground">{currentVehicleKm.toLocaleString()} km</span>.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Done by (Workshop / Mechanic) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Company Workshop"
                    value={replaceDoneBy}
                    onChange={e => setReplaceDoneBy(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Date Replaced *
                  </label>
                  <input
                    type="date"
                    value={replaceDate}
                    onChange={e => setReplaceDate(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Replacement Cost (LKR, Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  value={replaceCost}
                  onChange={e => setReplaceCost(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground mt-1">Automatically recorded in the vehicle's Service & Cost History.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReplacingPart(null)}
                  className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReplace}
                  className="flex-1 bg-emerald-500 text-black font-bold py-2.5 rounded-xl text-xs shadow-md"
                >
                  Confirm Replaced ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
