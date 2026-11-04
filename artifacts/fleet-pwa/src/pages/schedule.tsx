import { useState } from "react";
import { useVehicles } from "@/hooks/use-vehicles";
import { useSchedules, useCreateSchedule } from "@/hooks/use-schedule";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, X, Trash2 } from "lucide-react";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
type Day = typeof DAYS[number];

export function SchedulePage() {
  const { data: vehicles } = useVehicles();
  const { data: schedules, isLoading } = useSchedules();
  const createSchedule = useCreateSchedule();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState("all");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formDay, setFormDay] = useState<Day>("mon");
  const [formTask, setFormTask] = useState("");
  const [formKmInterval, setFormKmInterval] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredSchedules = selectedVehicleFilter === "all"
    ? schedules
    : schedules?.filter(s => s.vehicle_id === selectedVehicleFilter);

  const handleAdd = async () => {
    if (!formVehicleId || !formTask.trim()) {
      toast({ title: "Vehicle and task required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await createSchedule.mutateAsync({
        vehicle_id: formVehicleId,
        day_of_week: formDay,
        task: formTask.trim(),
        km_interval: formKmInterval ? Number(formKmInterval) : null,
        next_due_km: null,
      });
      toast({ title: "Schedule added" });
      setFormTask(""); setFormKmInterval(""); setShowModal(false);
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("maintenance_schedules").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast({ title: "Removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  };

  const vehicleMap = Object.fromEntries(vehicles?.map(v => [v.id, v]) ?? []);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Maintenance Schedule</h1>
        <button data-testid="btn-add-schedule" onClick={() => { setShowModal(true); setFormVehicleId(vehicles?.[0]?.id ?? ""); }} className="flex items-center gap-1.5 bg-primary text-primary-foreground font-semibold text-sm px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" />Add
        </button>
      </div>

      {/* Vehicle Filter */}
      <div className="p-4 pb-0">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            data-testid="filter-all"
            onClick={() => setSelectedVehicleFilter("all")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${selectedVehicleFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
          >
            All Vehicles
          </button>
          {vehicles?.map(v => (
            <button
              key={v.id}
              data-testid={`filter-vehicle-${v.id}`}
              onClick={() => setSelectedVehicleFilter(v.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${selectedVehicleFilter === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
            >
              {v.vehicle_no}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="h-40 bg-card border border-border rounded-xl animate-pulse" />
        ) : (
          DAYS.map(day => {
            const daySchedules = filteredSchedules?.filter(s => s.day_of_week === day) ?? [];
            return (
              <div key={day} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className={`px-4 py-2 border-b border-border flex items-center gap-2 ${daySchedules.length > 0 ? "bg-primary/10" : ""}`}>
                  <CalendarDays className={`w-4 h-4 ${daySchedules.length > 0 ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-semibold text-sm ${daySchedules.length > 0 ? "text-primary" : "text-muted-foreground"}`}>{DAY_LABELS[day]}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{daySchedules.length} task{daySchedules.length !== 1 ? "s" : ""}</span>
                </div>
                {daySchedules.length > 0 ? (
                  <div className="divide-y divide-border">
                    {daySchedules.map(s => (
                      <div key={s.id} data-testid={`schedule-item-${s.id}`} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-foreground text-sm font-medium">{s.task}</p>
                          <p className="text-xs text-muted-foreground">{vehicleMap[s.vehicle_id]?.vehicle_no ?? "Unknown"}</p>
                          {s.km_interval && <p className="text-xs text-muted-foreground">Every {s.km_interval.toLocaleString()} km</p>}
                        </div>
                        <button data-testid={`btn-delete-schedule-${s.id}`} onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-xs text-muted-foreground">No tasks scheduled</div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">Add Schedule</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Vehicle *</label>
                <select data-testid="select-schedule-vehicle" value={formVehicleId} onChange={e => setFormVehicleId(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm">
                  <option value="">Select vehicle</option>
                  {vehicles?.map(v => <option key={v.id} value={v.id}>{v.vehicle_no} - {v.model}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Day *</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map(d => (
                    <button key={d} data-testid={`btn-day-${d}`} onClick={() => setFormDay(d)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${formDay === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Task *</label>
                <input data-testid="input-schedule-task" type="text" placeholder="e.g. Oil change, Service" value={formTask} onChange={e => setFormTask(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">KM Interval (optional)</label>
                <input data-testid="input-km-interval" type="number" placeholder="e.g. 5000" value={formKmInterval} onChange={e => setFormKmInterval(e.target.value)} className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-border text-muted-foreground py-2.5 rounded-xl text-sm">Cancel</button>
              <button data-testid="btn-save-schedule" onClick={handleAdd} disabled={submitting} className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {submitting ? "Saving..." : "Add Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

