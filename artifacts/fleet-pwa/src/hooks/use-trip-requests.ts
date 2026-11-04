import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export type TripRequest = {
  id: string;
  from: string;
  to: string;
  when: string;
  what: string;
  urgent?: boolean;
  photoUrl?: string | null;
  requesterId: string;
  requesterName: string;
  status: "waiting" | "assigned";
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  assignedDriverPhone?: string | null;
  assignedVehicleId?: string | null;
  assignedVehicleNo?: string | null;
  taskId?: string | null;
  createdAt: string;
};

export function useTripRequests() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["trip_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "trip_requests")
        .maybeSingle();

      if (error) handleSupabaseError(error);
      const list = (data?.value as TripRequest[]) || [];
      return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
  });

  const createRequest = useMutation({
    mutationFn: async (req: Omit<TripRequest, "id" | "status" | "createdAt">) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "trip_requests")
        .maybeSingle();

      const existing = (currentData?.value as TripRequest[]) || [];
      const newReq: TripRequest = {
        ...req,
        id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: "waiting",
        createdAt: new Date().toISOString(),
      };

      const updated = [newReq, ...existing];
      const { error } = await supabase.from("settings").upsert({
        key: "trip_requests",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return newReq;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip_requests"] });
    },
  });

  const assignRequest = useMutation({
    mutationFn: async ({
      requestId,
      driverId,
      vehicleId,
      driverName,
      driverPhone,
      vehicleNo,
    }: {
      requestId: string;
      driverId: string;
      vehicleId?: string | null;
      driverName: string;
      driverPhone?: string | null;
      vehicleNo?: string | null;
    }) => {
      // 1. Get current trip requests
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "trip_requests")
        .maybeSingle();

      const existing = (currentData?.value as TripRequest[]) || [];
      const targetReq = existing.find(r => r.id === requestId);
      if (!targetReq) throw new Error("Trip request not found");

      // 2. Create normal task in tasks table
      const title = `Trip: ${targetReq.from} → ${targetReq.to}`;
      const description = `${targetReq.what} (Requested by ${targetReq.requesterName} for ${targetReq.when})`;
      const route = `${targetReq.from} → ${targetReq.to}`;
      const todayDate = new Date().toISOString().split("T")[0];

      const baseTaskPayload = {
        title,
        description,
        route,
        driver_id: driverId,
        vehicle_id: vehicleId || null,
        priority: "high",
        status: "pending",
        due_date: todayDate,
      };

      let newTask: any = null;
      const { data: extTask, error: extErr } = await supabase.from("tasks").insert({
        ...baseTaskPayload,
        start_time: targetReq.when,
      }).select().maybeSingle();

      if (!extErr && extTask) {
        newTask = extTask;
      } else {
        const { data: stdTask, error: stdErr } = await supabase.from("tasks").insert(baseTaskPayload).select().single();
        if (stdErr) handleSupabaseError(stdErr, "assign trip request");
        newTask = stdTask;
      }

      // Save task meta for times if needed
      if (newTask?.id) {
        try {
          const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "task_meta").maybeSingle();
          const metaList = (currentMeta?.value as Record<string, any>) || {};
          await supabase.from("settings").upsert({
            key: "task_meta",
            value: {
              ...metaList,
              [newTask.id]: {
                startTime: targetReq.when,
                startDate: todayDate,
                photoRequired: false,
              }
            }
          });
        } catch (e) {}
      }

      // 3. Mark request as assigned
      const updatedList = existing.map(r =>
        r.id === requestId
          ? {
              ...r,
              status: "assigned" as const,
              assignedDriverId: driverId,
              assignedDriverName: driverName,
              assignedDriverPhone: driverPhone || null,
              assignedVehicleId: vehicleId || null,
              assignedVehicleNo: vehicleNo || null,
              taskId: newTask?.id || null,
            }
          : r
      );

      const { error: updateErr } = await supabase.from("settings").upsert({
        key: "trip_requests",
        value: updatedList,
      });

      if (updateErr) handleSupabaseError(updateErr);

      // 4. Send WhatsApp notification to driver
      if (driverPhone) {
        const msg = `*New Assigned Trip Request*\n\nFrom: ${targetReq.from}\nTo: ${targetReq.to}\nWhen: ${targetReq.when}\nDetails: ${targetReq.what}\nVehicle: ${vehicleNo || 'Assigned'}\n\nPlease check your FleetOps app to start the trip.`;
        sendWhatsAppMessage(driverPhone, msg);
      }

      return { requestId, taskId: newTask?.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip_requests"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return {
    data: query.data || [],
    requests: query.data || [],
    isLoading: query.isLoading,
    createRequest,
    assignRequest,
  };
}
