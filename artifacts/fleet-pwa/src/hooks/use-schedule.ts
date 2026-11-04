import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Database } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";

type ScheduleInsert = Database["public"]["Tables"]["maintenance_schedules"]["Insert"];

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_schedules").select("*");
      if (error) handleSupabaseError(error);
      return (data || []);
    },
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (schedule: ScheduleInsert) => {
      const { data, error } = await supabase.from("maintenance_schedules").insert(schedule).select().single();
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    onMutate: async (newSchedule) => {
      await queryClient.cancelQueries({ queryKey: ["schedules"] });
      const previous = queryClient.getQueryData<any[]>(["schedules"]);
      const optimisticItem = { id: `temp-${Date.now()}`, status: "scheduled", ...newSchedule };
      queryClient.setQueryData(["schedules"], (old: any[] = []) => [optimisticItem, ...old]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["schedules"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}
