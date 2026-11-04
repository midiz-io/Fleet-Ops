import { useState, useMemo, useEffect } from "react";
import { Car, X, AlertCircle, CheckCircle2, ClipboardCheck, ArrowRight, AlertTriangle } from "lucide-react";
import { VehicleWithFuelType } from "@/hooks/use-vehicles";

interface VehicleSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVehicle?: VehicleWithFuelType | null;
  availableVehicles: VehicleWithFuelType[];
  todayChecklistVehicleIds?: string[];
  inUseByOtherDriverMap?: Record<string, string>;
  onConfirm: (vehicle: VehicleWithFuelType, odometer: number, needsChecklist: boolean) => Promise<void>;
}

export function VehicleSwitchModal({
  isOpen,
  onClose,
  currentVehicle,
  availableVehicles = [],
  todayChecklistVehicleIds = [],
  inUseByOtherDriverMap = {},
  onConfirm,
}: VehicleSwitchModalProps) {
  // List all vehicles across ALL groups (Fix 2 / O9), sorting free vehicles first and greying out vehicles in use
  const allOtherVehicles = useMemo(() => {
    return (availableVehicles || [])
      .filter(v => v.id !== currentVehicle?.id)
      .sort((a, b) => {
        const aBusy = Boolean(inUseByOtherDriverMap[a.id]);
        const bBusy = Boolean(inUseByOtherDriverMap[b.id]);
        if (aBusy !== bBusy) return aBusy ? 1 : -1;
        return a.vehicle_no.localeCompare(b.vehicle_no);
      });
  }, [availableVehicles, currentVehicle, inUseByOtherDriverMap]);

  const freeVehicles = useMemo(
    () => allOtherVehicles.filter(v => !inUseByOtherDriverMap[v.id]),
    [allOtherVehicles, inUseByOtherDriverMap]
  );

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [odometer, setOdometer] = useState("");
  const [confirmOdometer, setConfirmOdometer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (freeVehicles.length > 0 && (!selectedVehicleId || inUseByOtherDriverMap[selectedVehicleId])) {
      setSelectedVehicleId(freeVehicles[0].id);
    }
  }, [freeVehicles, selectedVehicleId, inUseByOtherDriverMap]);

  const targetVehicle =
    allOtherVehicles.find(v => v.id === selectedVehicleId) || freeVehicles[0] || null;
  const lastKm = Number(targetVehicle?.current_km) || 0;
  const enteredKm = Number(odometer) || 0;
  const isOver500KmJump = odometer !== "" && lastKm > 0 && enteredKm - lastKm > 500;
  const isJumpConfirmed = !isOver500KmJump || confirmOdometer.trim() === odometer.trim();
  const hasChecklistToday = targetVehicle ? todayChecklistVehicleIds.includes(targetVehicle.id) : false;

  useEffect(() => {
    setOdometer("");
    setConfirmOdometer("");
    setError("");
  }, [selectedVehicleId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetVehicle) {
      setError("Please select a vehicle to switch to");
      return;
    }
    if (inUseByOtherDriverMap[targetVehicle.id]) {
      setError(`${targetVehicle.vehicle_no} is currently in use by ${inUseByOtherDriverMap[targetVehicle.id]}`);
      return;
    }

    const reading = Number(odometer);
    if (!reading || isNaN(reading) || reading <= 0) {
      setError("Please enter a valid odometer number");
      return;
    }
    if (lastKm > 0 && reading < lastKm) {
      setError(`Odometer cannot be lower than the last recorded reading (${lastKm.toLocaleString()} km)`);
      return;
    }
    if (isOver500KmJump && !isJumpConfirmed) {
      setError(
        `Reading is ${(reading - lastKm).toLocaleString()} km above last reading (${lastKm.toLocaleString()} km). Please retype to confirm.`
      );
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      // Always open checklist for the switched vehicle if not checked today
      await onConfirm(targetVehicle, reading, !hasChecklistToday);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to switch vehicle");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[90dvh] flex flex-col p-5 space-y-4 shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm">Switch Vehicle</h3>
              <p className="text-xs text-muted-foreground">Take another free vehicle for today's shift</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Vehicle Selector (All groups, free vehicles selectable, in-use greyed out) */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Select Vehicle (All Groups) *
            </label>
            {allOtherVehicles.length === 0 ? (
              <p className="text-xs text-amber-400 bg-amber-400/10 p-2.5 rounded-xl border border-amber-400/20">
                No other vehicles found in the fleet.
              </p>
            ) : (
              <select
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
                className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-bold"
              >
                {allOtherVehicles.map(v => {
                  const busyDriver = inUseByOtherDriverMap[v.id];
                  return (
                    <option key={v.id} value={v.id} disabled={Boolean(busyDriver)}>
                      {v.vehicle_no} · {v.model} ({Number(v.current_km || 0).toLocaleString()} km)
                      {v.group ? ` [${v.group}]` : ""}
                      {busyDriver ? ` — In use (${busyDriver})` : " — Free"}
                    </option>
                  );
                })}
              </select>
            )}
            {targetVehicle && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Group: <span className="text-primary font-semibold">{targetVehicle.group || "Centres"}</span> · Tank:{" "}
                {targetVehicle.tank_size || 45} L · Last reading:{" "}
                <span className="text-foreground font-mono font-semibold">{lastKm.toLocaleString()} km</span>
              </p>
            )}
          </div>

          {/* Step 2: Odometer Now */}
          {targetVehicle && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                Its Odometer Now (km) *
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={odometer}
                onChange={e => {
                  setOdometer(e.target.value);
                  setConfirmOdometer("");
                  setError("");
                }}
                placeholder={`e.g. ${lastKm > 0 ? lastKm + 10 : 75000}`}
                className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono text-lg font-bold"
                autoFocus
              />
              <p className="text-xs text-amber-400 font-medium">
                Last reading: {lastKm.toLocaleString()} km ({targetVehicle.vehicle_no})
              </p>

              {isOver500KmJump && enteredKm >= lastKm && (
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex items-start gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      More than 500 km above last reading ({lastKm.toLocaleString()} km). Retype{" "}
                      <strong>{odometer}</strong> to confirm:
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={`Retype ${odometer} to confirm`}
                    value={confirmOdometer}
                    onChange={e => setConfirmOdometer(e.target.value)}
                    className="w-full bg-background border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Checklist Status Notification */}
          {targetVehicle && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                hasChecklistToday
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
            >
              {hasChecklistToday ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Checklist already done today</p>
                    <p className="text-[11px] opacity-90">This vehicle has passed daily morning inspection.</p>
                  </div>
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">No checklist today for {targetVehicle.vehicle_no}</p>
                    <p className="text-[11px] opacity-90">
                      Daily checklist is compulsory per vehicle per day. It will open next.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 p-2.5 rounded-lg border border-red-400/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 border border-border text-muted-foreground hover:text-foreground py-2.5 rounded-xl text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !targetVehicle || !odometer || !isJumpConfirmed}
              className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                "Switching..."
              ) : !hasChecklistToday ? (
                <>
                  Switch & Start Checklist <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                "Confirm Switch"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
