import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useDrivers } from "@/hooks/use-drivers";
import { useOvertime, OvertimeRecord } from "@/hooks/use-overtime";
import { useToast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/lib/audit-logger";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import {
  CheckCircle,
  XCircle,
  Droplet,
  Sparkles,
  Clock,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Users,
  Key,
  Trash2,
  Calendar,
  Check,
  X,
  Phone,
  UserCheck,
  Lock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useVehicleWashing, WashSkipRequest } from "@/hooks/use-washing";

export interface EmergencyLeaveRequest {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_phone?: string;
  task_id: string;
  task_title: string;
  reason: string;
  notes?: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string;
  reviewed_at?: string;
}

export function ManagerApprovalsTab() {
  const { user } = useAuth();
  const { data: drivers = [], refetch: refetchDrivers } = useDrivers();
  const { overtimes = [], approveOvertime, rejectOvertime } = useOvertime();
  const safeOvertimes: OvertimeRecord[] = Array.isArray(overtimes) ? overtimes : [];
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { skipRequests = [], reviewWashSkip } = useVehicleWashing();
  const [washFilter, setWashFilter] = useState<"pending" | "all" | "approved" | "rejected">("pending");
  const pendingWashSkipCount = skipRequests.filter(r => r.status === "pending").length;

  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [editingPinDriverId, setEditingPinDriverId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  // Fetch emergency leave requests from settings
  const { data: leaveRequests = [], isLoading: isLoadingLeave } = useQuery<EmergencyLeaveRequest[]>({
    queryKey: ["emergency_leave_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "emergency_leave_requests")
        .maybeSingle();

      if (error) {
        console.error("Error fetching emergency leave requests:", error);
        return [];
      }
      const list = (data?.value as EmergencyLeaveRequest[]) || [];
      return [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  // Mutation to update emergency leave status
  const updateLeaveStatus = useMutation({
    mutationFn: async ({
      requestId,
      status,
      leaveReq,
    }: {
      requestId: string;
      status: "approved" | "rejected";
      leaveReq: EmergencyLeaveRequest;
    }) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "emergency_leave_requests")
        .maybeSingle();

      const existing = (currentData?.value as EmergencyLeaveRequest[]) || [];
      const updated = existing.map(item =>
        item.id === requestId
          ? {
              ...item,
              status,
              reviewed_by: user?.name || "Admin",
              reviewed_at: new Date().toISOString(),
            }
          : item
      );

      const { error } = await supabase.from("settings").upsert({
        key: "emergency_leave_requests",
        value: updated,
      });

      if (error) throw error;

      // If approved, update driver's shift today to "Leave" and record audit
      if (status === "approved") {
        try {
          const todayDate = new Date().toISOString().split("T")[0];
          // Update shifts setting
          const { data: shiftData } = await supabase
            .from("settings")
            .select("value")
            .eq("key", "driver_shifts")
            .maybeSingle();

          const shiftMap = (shiftData?.value as Record<string, any>) || {};
          shiftMap[leaveReq.driver_id] = {
            ...shiftMap[leaveReq.driver_id],
            shift: "Leave",
            date: todayDate,
            reason: `Emergency: ${leaveReq.reason}`,
          };

          await supabase.from("settings").upsert({
            key: "driver_shifts",
            value: shiftMap,
          });
        } catch (e) {
          console.warn("Could not update shift setting:", e);
        }
      }

      // Log audit event
      await logAuditEvent({
        driver_id: leaveReq.driver_id,
        driver_name: leaveReq.driver_name,
        action_type: status === "approved" ? "EMERGENCY_LEAVE_APPROVED" : "EMERGENCY_LEAVE_REJECTED",
        status: "success",
        details: `Admin ${user?.name || "Admin"} ${status} emergency leave for ${leaveReq.driver_name} (Task: "${leaveReq.task_title}", Reason: ${leaveReq.reason}).`,
        metadata: { requestId, status, notes: leaveReq.notes },
      });

      // Send WhatsApp message to driver if phone available
      if (leaveReq.driver_phone) {
        const msg =
          status === "approved"
            ? `✅ *Emergency Leave Approved*\n\nHello ${leaveReq.driver_name}, your emergency leave request for task "${leaveReq.task_title}" has been approved by Admin.\n\nPlease rest and stay safe.`
            : `❌ *Emergency Leave Notice*\n\nHello ${leaveReq.driver_name}, your emergency leave request for task "${leaveReq.task_title}" was reviewed by Admin.\n\nPlease contact Fleet Management.`;
        sendWhatsAppMessage(leaveReq.driver_phone, msg);
      }

      return { requestId, status };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["emergency_leave_requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver_shifts"] });
      toast({
        title: vars.status === "approved" ? "Emergency Leave Approved" : "Emergency Leave Rejected",
        description: `Status updated for ${vars.leaveReq.driver_name}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Update failed",
        description: err?.message || "Could not update status",
        variant: "destructive",
      });
    },
  });

  // Handle saving new PIN for an account
  const handleUpdatePin = async (driverId: string) => {
    if (!newPin || newPin.length < 4) {
      toast({ title: "PIN must be at least 4 digits", variant: "destructive" });
      return;
    }
    setSavingPin(true);
    try {
      const { error } = await supabase
        .from("drivers")
        .update({ pin: newPin })
        .eq("id", driverId);

      if (error) throw error;

      await logAuditEvent({
        action_type: "PIN_RESET",
        status: "success",
        details: `Admin changed PIN for account ${driverId}.`,
      });

      toast({ title: "PIN Updated Successfully" });
      setEditingPinDriverId(null);
      setNewPin("");
      refetchDrivers();
    } catch (err: any) {
      toast({ title: "Failed to update PIN", description: err.message, variant: "destructive" });
    } finally {
      setSavingPin(false);
    }
  };

  const filteredLeave = leaveRequests.filter(req => {
    if (filterStatus === "all") return true;
    return req.status === filterStatus;
  });

  const pendingLeaveCount = leaveRequests.filter(r => r.status === "pending").length;
  const pendingOTCount = safeOvertimes.filter(ot => ot.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Top Banner: Admin Executive Panel */}
      <div className="bg-gradient-to-r from-card to-card/60 border border-primary/30 rounded-2xl p-4 md:p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary border border-primary/40 flex items-center justify-center shrink-0 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-bold text-foreground">Admin Approvals & Governance</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 uppercase">
                Admin Role
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review driver emergency leaves, approve overtime, and govern system credentials.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-background/80 border border-border rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Pending Leave</p>
            <p className="text-base font-extrabold text-amber-400 font-mono">{pendingLeaveCount}</p>
          </div>
          <div className="bg-background/80 border border-border rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Pending OT</p>
            <p className="text-base font-extrabold text-primary font-mono">{pendingOTCount}</p>
          </div>
          <div className="bg-background/80 border border-border rounded-xl px-3 py-2 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Wash Skips</p>
            <p className="text-base font-extrabold text-blue-400 font-mono">{pendingWashSkipCount}</p>
          </div>
        </div>
      </div>

      {/* SECTION 1: Emergency Leave Requests (Change 6 & Change 7) */}
      <div className="bg-card border border-border rounded-2xl p-4 md:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Emergency Leave Requests</h3>
              {pendingLeaveCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                  {pendingLeaveCount} requires action
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted when a driver uses &ldquo;End early&rdquo; on an active task.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 border border-border/60">
            {(["pending", "all", "approved", "rejected"] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 text-xs font-bold rounded-lg capitalize transition-all ${
                  filterStatus === st
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {isLoadingLeave ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-24 bg-card/60 border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredLeave.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
            <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No {filterStatus} emergency leave requests.</p>
            <p className="text-xs mt-0.5">When drivers end a task early due to illness or emergency, requests appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredLeave.map(req => {
              const isPending = req.status === "pending";
              const isApproved = req.status === "approved";
              const formattedDate = (() => {
                try {
                  return format(parseISO(req.created_at), "d MMM, h:mm a");
                } catch {
                  return req.created_at;
                }
              })();

              return (
                <div
                  key={req.id}
                  className={`border rounded-xl p-4 transition-all space-y-3 ${
                    isPending
                      ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50 shadow-sm"
                      : isApproved
                      ? "bg-emerald-500/5 border-emerald-500/25 opacity-90"
                      : "bg-zinc-900/40 border-border opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {req.driver_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground leading-tight">{req.driver_name}</p>
                        <p className="text-[11px] text-muted-foreground">{formattedDate}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        isPending
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : isApproved
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  {/* Task & Reason Box */}
                  <div className="bg-background/80 border border-border/80 rounded-xl p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Ended Task:</span>
                      <span className="font-bold text-foreground truncate max-w-[200px]">{req.task_title}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Reason:</span>
                      <span className="font-bold text-amber-400">{req.reason}</span>
                    </div>
                    {req.notes && (
                      <div className="pt-1 border-t border-border/40 text-muted-foreground italic">
                        &ldquo;{req.notes}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Actions for Pending */}
                  {isPending ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => updateLeaveStatus.mutate({ requestId: req.id, status: "approved", leaveReq: req })}
                        disabled={updateLeaveStatus.isPending}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => updateLeaveStatus.mutate({ requestId: req.id, status: "rejected", leaveReq: req })}
                        disabled={updateLeaveStatus.isPending}
                        className="flex-1 bg-secondary hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                      <span>Reviewed by: {req.reviewed_by || "Admin"}</span>
                      {req.reviewed_at && (
                        <span>{format(parseISO(req.reviewed_at), "MMM d, h:mm a")}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION: Weekly Vehicle Wash Skip Requests (Item 1) */}
      <div className="bg-card border border-border rounded-2xl p-4 md:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Weekly Vehicle Wash Skip Requests</h3>
              {pendingWashSkipCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
                  {pendingWashSkipCount} pending review
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drivers who completed &lt; 3 washes last week must have a Manager waiver approved to work this week.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 border border-border/60">
            {(["pending", "all", "approved", "rejected"] as const).map(st => (
              <button
                key={st}
                onClick={() => setWashFilter(st)}
                className={`px-3 py-1 text-xs font-bold rounded-lg capitalize transition-all ${
                  washFilter === st
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const filteredWash = skipRequests.filter(r => {
            if (washFilter === "all") return true;
            return r.status === washFilter;
          });

          if (filteredWash.length === 0) {
            return (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl text-xs space-y-1">
                <p className="font-semibold">No wash skip requests in this filter.</p>
                <p className="text-[11px] text-muted-foreground/80">Drivers with &lt; 3 washes who submit a skip waiver appear here for approval.</p>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredWash.map(req => {
                const isPending = req.status === "pending";
                return (
                  <div
                    key={req.id}
                    className={`border rounded-2xl p-4 space-y-3 transition-all ${
                      isPending
                        ? "bg-card border-blue-500/40 shadow-sm ring-1 ring-blue-500/20"
                        : req.status === "approved"
                        ? "bg-secondary/20 border-emerald-500/30"
                        : "bg-secondary/10 border-border/60 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {req.driverName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-xs text-foreground flex items-center gap-2">
                            {req.driverName}
                            <span className="font-mono text-muted-foreground text-[11px]">({req.vehicleNo || "Fleet Vehicle"})</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Target Week: {req.weekStart} &bull; Prev Week Washes: <span className="font-bold text-amber-400 font-mono">{req.prevWeekWashes || 0} of 3</span>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize border ${
                          req.status === "approved"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : req.status === "rejected"
                            ? "bg-destructive/15 text-destructive border-destructive/30"
                            : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className="bg-secondary/50 rounded-xl p-2.5 border border-border/60 text-xs space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        Reason for Wash Skip:
                      </span>
                      <p className="text-foreground italic">&ldquo;{req.reason}&rdquo;</p>
                      <span className="text-[10px] text-muted-foreground block pt-0.5">
                        Submitted: {format(parseISO(req.createdAt), "dd MMM yyyy, h:mm a")}
                      </span>
                    </div>

                    {isPending ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => reviewWashSkip.mutate({ requestId: req.id, status: "approved", reviewerName: user?.name || "Manager" })}
                          disabled={reviewWashSkip.isPending}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve Skip & Unlock
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewWashSkip.mutate({ requestId: req.id, status: "rejected", reviewerName: user?.name || "Manager" })}
                          disabled={reviewWashSkip.isPending}
                          className="flex-1 bg-secondary hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                        <span>Reviewed by: {req.reviewedBy || "Manager"}</span>
                        {req.reviewedAt && (
                          <span>{format(parseISO(req.reviewedAt), "MMM d, h:mm a")}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* SECTION 2: Pending Overtime Approvals */}
      <div className="bg-card border border-border rounded-2xl p-4 md:p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Overtime Approvals</h3>
            <p className="text-xs text-muted-foreground">
              Review and sign off on driver OT hours calculated from Start & End Day.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {pendingOTCount} pending
          </span>
        </div>

        {safeOvertimes.filter(ot => ot.status === "pending").length === 0 ? (
          <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-xl text-xs">
            No pending overtime records requiring approval.
          </div>
        ) : (
          <div className="space-y-2">
            {safeOvertimes
              .filter(ot => ot.status === "pending")
              .map(ot => {
                const driver = drivers.find(d => d.id === ot.driverId);
                return (
                  <div
                    key={ot.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background border border-border rounded-xl p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{driver?.name || "Driver"}</span>
                        <span className="text-xs font-bold text-amber-400 font-mono">
                          +{ot.hours}h OT
                        </span>
                        <span className="text-[10px] text-muted-foreground">({ot.date})</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reason: <span className="text-foreground font-medium">{ot.reason || "Shift overtime"}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          approveOvertime.mutate(ot.id);
                          toast({ title: "Overtime Approved" });
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => {
                          rejectOvertime.mutate(ot.id);
                          toast({ title: "Overtime Rejected" });
                        }}
                        className="bg-secondary hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* SECTION 3: Accounts Management (Change 7) */}
      <div className="bg-card border border-border rounded-2xl p-4 md:p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Accounts Governance</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 uppercase">
                Admin Exclusive
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Add, change PIN, and remove accounts. Only Admin can remove accounts or logs.
            </p>
          </div>
        </div>

        {/* Security Warning notice */}
        <div className="flex items-center gap-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-300">
          <Lock className="w-4 h-4 shrink-0 text-blue-400" />
          <span>
            <strong>Policy Enforcement:</strong> Driver and staff PIN resets and permanent account deletions are strictly restricted to Admin users.
          </span>
        </div>

        {/* Accounts List */}
        <div className="divide-y divide-border/60">
          {drivers.map(d => {
            const isEditingThisPin = editingPinDriverId === d.id;

            return (
              <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary text-foreground flex items-center justify-center font-bold text-xs shrink-0">
                    {d.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">{d.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground capitalize">
                        {d.role.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{d.phone}</span>
                      <span>·</span>
                      <span className="font-mono">PIN: {d.pin ? "••••" : "Not set"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditingThisPin ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="password"
                        maxLength={6}
                        placeholder="New PIN"
                        value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                        className="w-24 bg-background border border-input rounded-lg px-2.5 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdatePin(d.id)}
                        disabled={savingPin}
                        className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
                      >
                        {savingPin ? "..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingPinDriverId(null);
                          setNewPin("");
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingPinDriverId(d.id);
                        setNewPin("");
                      }}
                      className="flex items-center gap-1 bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Key className="w-3 h-3 text-primary" /> Change PIN
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
