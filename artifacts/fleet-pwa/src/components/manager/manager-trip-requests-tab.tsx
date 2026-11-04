import { useState } from "react";
import { useTripRequests, TripRequest } from "@/hooks/use-trip-requests";
import { useDrivers } from "@/hooks/use-drivers";
import { useVehicles } from "@/hooks/use-vehicles";
import { useShifts } from "@/hooks/use-shifts";
import { useTasks } from "@/hooks/use-tasks";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, Clock, Users, Car, CheckCircle2, AlertCircle, 
  MapPin, Package, ArrowRight, ShieldCheck, Eye, Phone
} from "lucide-react";
import { format, parseISO } from "date-fns";

export function ManagerTripRequestsTab() {
  const { data: requests = [], isLoading, assignRequest } = useTripRequests();
  const { data: drivers = [] } = useDrivers();
  const { data: vehicles = [] } = useVehicles();
  const { shifts } = useShifts();
  const { tasks = [] } = useTasks();
  const { toast } = useToast();

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);

  const selectedRequest = requests.find(r => r.id === selectedRequestId);

  // Filter and prioritize drivers (Issue 10: On shift & free first, Leave NEVER listed)
  const eligibleDrivers = drivers.filter(d => {
    if (d.role !== "driver") return false;
    const shift = shifts?.[d.id]?.shift || "";
    // On leave NEVER listed
    if (shift === "Leave" || shift.toLowerCase().includes("leave")) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    // Check if free (no in_progress tasks)
    const aBusy = tasks.some(t => t.driverId === a.id && t.status === "in_progress");
    const bBusy = tasks.some(t => t.driverId === b.id && t.status === "in_progress");
    if (!aBusy && bBusy) return -1;
    if (aBusy && !bBusy) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelectRequest = (req: TripRequest) => {
    setSelectedRequestId(req.id);
    if (req.assignedDriverId) {
      setSelectedDriverId(req.assignedDriverId);
      setSelectedVehicleId(req.assignedVehicleId || "");
    } else {
      // Pick first free driver by default
      const defaultDriver = eligibleDrivers[0];
      if (defaultDriver) {
        setSelectedDriverId(defaultDriver.id);
        const assignedVeh = vehicles.find(v => v.assigned_driver_id === defaultDriver.id);
        setSelectedVehicleId(assignedVeh ? assignedVeh.id : (vehicles[0]?.id || ""));
      }
    }
  };

  const handleDriverChange = (driverId: string) => {
    setSelectedDriverId(driverId);
    // Vehicle fills in from the driver (Mockup on Page 6)
    const assignedVeh = vehicles.find(v => v.assigned_driver_id === driverId);
    if (assignedVeh) {
      setSelectedVehicleId(assignedVeh.id);
    }
  };

  const handleAssign = async () => {
    if (!selectedRequest || !selectedDriverId) {
      toast({ title: "Please select a driver to assign", variant: "destructive" });
      return;
    }

    const driver = drivers.find(d => d.id === selectedDriverId);
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);

    setIsAssigning(true);
    try {
      await assignRequest.mutateAsync({
        requestId: selectedRequest.id,
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId || null,
        driverName: driver?.name || "Driver",
        driverPhone: driver?.phone || null,
        vehicleNo: vehicle?.vehicle_no || null,
      });

      toast({
        title: "Trip Request Assigned",
        description: `Task created for ${driver?.name}. Notification sent via WhatsApp.`,
      });
      setSelectedRequestId(null);
    } catch (err: any) {
      toast({
        title: "Assignment failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const waitingCount = requests.filter(r => r.status === "waiting").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">Trip Requests</p>
            {waitingCount > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold px-2 py-0.5 rounded-full">
                {waitingCount} waiting
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Submitted by Heads of Teams · Assign a driver and vehicle to dispatch
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Requests List */}
        <div className="lg:col-span-7 space-y-2.5">
          {requests.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              <Send className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No trip requests received yet.</p>
              <p className="text-xs mt-1">Heads of Teams submit requests via their portal.</p>
            </div>
          ) : (
            requests.map(req => {
              const isSelected = selectedRequestId === req.id;
              const isWaiting = req.status === "waiting";

              return (
                <div
                  key={req.id}
                  onClick={() => handleSelectRequest(req)}
                  className={`bg-card border rounded-xl p-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary shadow-md bg-primary/5"
                      : isWaiting
                      ? "border-amber-500/40 hover:border-amber-500/70"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-foreground text-sm">
                        <span>{req.from}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{req.to}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        When: <span className="text-foreground font-medium">{req.when}</span> · From: <span className="text-foreground font-medium">{req.requesterName}</span>
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border shrink-0 ${
                        isWaiting
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <p className="text-xs text-foreground/90 bg-secondary/30 p-2 rounded-lg mb-2">
                    {req.what}
                  </p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <span className="text-[11px]">
                      Received: {format(parseISO(req.createdAt), "MMM d, h:mm a")}
                    </span>

                    {req.photoUrl && (
                      <span className="flex items-center gap-1 text-primary text-[11px] font-medium">
                        <Eye className="w-3 h-3" /> Photo Attached
                      </span>
                    )}

                    {isWaiting ? (
                      <span className="text-amber-400 font-bold text-[11px]">Tap to Assign →</span>
                    ) : (
                      <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Dispatched
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Assignment Form Panel (Mockup on Page 6) */}
        <div className="lg:col-span-5">
          <div className="bg-card border border-border rounded-xl p-4 sticky top-20 space-y-4">
            <div>
              <p className="font-bold text-foreground text-sm">Trip Assignment Panel</p>
              <p className="text-xs text-muted-foreground">
                Assign makes a normal task. The driver's app does not change.
              </p>
            </div>

            {selectedRequest ? (
              <div className="space-y-3.5">
                {/* Selected Summary */}
                <div className="bg-secondary/40 border border-border rounded-xl p-3 text-xs space-y-1">
                  <p className="font-bold text-foreground">
                    {selectedRequest.from} → {selectedRequest.to}
                  </p>
                  <p className="text-muted-foreground">When: {selectedRequest.when}</p>
                  <p className="text-muted-foreground">Cargo/Details: {selectedRequest.what}</p>
                  <p className="text-primary font-medium">Requested by: {selectedRequest.requesterName}</p>

                  {selectedRequest.photoUrl && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <img
                        src={selectedRequest.photoUrl}
                        alt="Cargo proof"
                        className="w-full h-32 object-cover rounded-lg border border-border"
                      />
                    </div>
                  )}
                </div>

                {/* Driver Selector (Issue 10: On shift & free first, Leave NEVER listed) */}
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
                    Driver * <span className="text-[10px] text-primary lowercase">(on shift and free first; on leave never listed)</span>
                  </label>
                  <select
                    value={selectedDriverId}
                    onChange={e => handleDriverChange(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">-- Select Available Driver --</option>
                    {eligibleDrivers.map(d => {
                      const shift = shifts?.[d.id]?.shift || "No shift";
                      const isBusy = tasks.some(t => t.driverId === d.id && t.status === "in_progress");
                      return (
                        <option key={d.id} value={d.id}>
                          {d.name} {isBusy ? "(Busy)" : "(Free)"} · {shift}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Vehicle Selector (Fills in from driver) */}
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
                    Vehicle * <span className="text-[10px] text-muted-foreground lowercase">(fills in from the driver)</span>
                  </label>
                  <select
                    value={selectedVehicleId}
                    onChange={e => setSelectedVehicleId(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">-- Select Vehicle --</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_no} ({v.model})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assign Button */}
                <button
                  onClick={handleAssign}
                  disabled={isAssigning || !selectedDriverId || selectedRequest.status === "assigned"}
                  className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isAssigning
                    ? "Dispatching..."
                    : selectedRequest.status === "assigned"
                    ? "Already Assigned"
                    : "Assign Trip Request"}
                </button>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                Select a trip request from the left list to assign driver and vehicle.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
