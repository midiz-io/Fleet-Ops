import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Database } from "@/lib/supabase";
import { notifyManagers, getDriverAndVehicle, sendWhatsAppMessage } from "@/lib/whatsapp";
import { handleSupabaseError } from "@/lib/error-handler";

type RepairRequestInsert = Database["public"]["Tables"]["repair_requests"]["Insert"];
type RepairRequestUpdate = Database["public"]["Tables"]["repair_requests"]["Update"];

export function useRepairs() {
  return useQuery({
    queryKey: ["repairs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("repair_requests").select("*").order("created_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []);
    },
  });
}

export function useDriverRepairs(driverId: string | null) {
  return useQuery({
    queryKey: ["repairs", "driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from("repair_requests").select("*").eq("driver_id", driverId as string).order("created_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    enabled: !!driverId,
  });
}

export function useCreateRepair() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repair: RepairRequestInsert) => {
      const { data, error } = await supabase.from("repair_requests").insert(repair).select().single();
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    onMutate: async (newRepair) => {
      await queryClient.cancelQueries({ queryKey: ["repairs"] });
      const previousAll = queryClient.getQueryData(["repairs"]);
      const previousDriver = queryClient.getQueryData(["repairs", "driver", newRepair.driver_id]);

      const optimisticItem = Object.assign({ status: "pending", created_at: new Date().toISOString() }, newRepair, { id: `temp-${Date.now()}` });

      queryClient.setQueryData(["repairs"], (old: any[] = []) => [optimisticItem, ...old]);
      if (newRepair.driver_id) {
        queryClient.setQueryData(["repairs", "driver", newRepair.driver_id], (old: any[] = []) => [optimisticItem, ...old]);
      }

      return { previousAll, previousDriver, driverId: newRepair.driver_id };
    },
    onError: (_err, _newRepair, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(["repairs"], context.previousAll);
      }
      if (context?.previousDriver && context?.driverId) {
        queryClient.setQueryData(["repairs", "driver", context.driverId], context.previousDriver);
      }
    },
    onSuccess: async (data) => {
      const { driverName, vehicleNo } = await getDriverAndVehicle(data.driver_id, data.vehicle_id);
      notifyManagers(`${driverName} requested a repair for ${vehicleNo}: ${data.description}`); const { data: driverInfo } = await supabase.from("drivers").select("phone").eq("id", data.driver_id).single(); if (driverInfo) { sendWhatsAppMessage(driverInfo.phone, `*Repair Requested*\n\nYou have requested a repair for ${vehicleNo}: ${data.description}`); }
    },
    onSettled: (_data, _err, newRepair) => {
      queryClient.invalidateQueries({ queryKey: ["repairs"] });
      if (newRepair.driver_id) {
        queryClient.invalidateQueries({ queryKey: ["repairs", "driver", newRepair.driver_id] });
      }
    },
  });
}

export function useUpdateRepair() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: RepairRequestUpdate }) => {
      const { data, error } = await supabase.from("repair_requests").update(updates).eq("id", id).select().single();
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["repairs"] });
      const previousAll = queryClient.getQueryData<any[]>(["repairs"]);

      queryClient.setQueryData(["repairs"], (old: any[] = []) =>
        old.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );

      return { previousAll };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(["repairs"], context.previousAll);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["repairs"] });
    },
  });
}
