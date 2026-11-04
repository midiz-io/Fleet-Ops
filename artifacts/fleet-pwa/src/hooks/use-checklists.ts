import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Database } from "@/lib/supabase";
import { notifyManagers, getDriverAndVehicle, sendWhatsAppMessage } from "@/lib/whatsapp";
import { handleSupabaseError } from "@/lib/error-handler";

type ChecklistInsert = Database["public"]["Tables"]["checklists"]["Insert"];

export function useChecklists() {
  return useQuery({
    queryKey: ["checklists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklists").select("*").order("submitted_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []);
    },
  });
}

export function useDriverChecklists(driverId: string | null) {
  return useQuery({
    queryKey: ["checklists", "driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklists").select("*").eq("driver_id", driverId as string).order("submitted_at", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    enabled: !!driverId,
  });
}

export function useCreateChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (checklist: ChecklistInsert) => {
      const { data, error } = await supabase.from("checklists").insert(checklist).select().single();
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    onMutate: async (newChecklist) => {
      await queryClient.cancelQueries({ queryKey: ["checklists"] });
      const previousAll = queryClient.getQueryData(["checklists"]);
      const previousDriver = queryClient.getQueryData(["checklists", "driver", newChecklist.driver_id]);

      const optimisticItem = Object.assign({ submitted_at: new Date().toISOString() }, newChecklist, { id: `temp-${Date.now()}` });

      queryClient.setQueryData(["checklists"], (old: any[] = []) => [optimisticItem, ...old]);
      if (newChecklist.driver_id) {
        queryClient.setQueryData(["checklists", "driver", newChecklist.driver_id], (old: any[] = []) => [optimisticItem, ...old]);
      }

      return { previousAll, previousDriver, driverId: newChecklist.driver_id };
    },
    onError: (_err, _newChecklist, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(["checklists"], context.previousAll);
      }
      if (context?.previousDriver && context?.driverId) {
        queryClient.setQueryData(["checklists", "driver", context.driverId], context.previousDriver);
      }
    },
    onSuccess: async (data) => {
      const { driverName, vehicleNo } = await getDriverAndVehicle(data.driver_id, data.vehicle_id);
      const msg = `${driverName} submitted the daily checklist for ${vehicleNo} on ${data.date}.`; notifyManagers(msg); const { data: driverInfo } = await supabase.from("drivers").select("phone").eq("id", data.driver_id).single(); if (driverInfo) { sendWhatsAppMessage(driverInfo.phone, `*Checklist Submitted*\n\nYou have successfully submitted the daily checklist for ${vehicleNo} on ${data.date}.`); }
    },
    onSettled: (_data, _err, newChecklist) => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      if (newChecklist.driver_id) {
        queryClient.invalidateQueries({ queryKey: ["checklists", "driver", newChecklist.driver_id] });
      }
    },
  });
}
