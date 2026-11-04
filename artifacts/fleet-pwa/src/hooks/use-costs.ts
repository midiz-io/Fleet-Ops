import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";

export function useCosts() {
  return useQuery({
    queryKey: ["costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_entries").select("*").order("date", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []);
    },
  });
}

export type CostInsert = {
  vehicle_id: string;
  category: "fuel" | "service" | "other";
  amount: number;
  description: string | null;
  date: string;
};

export function useCreateCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: CostInsert) => {
      const { data, error } = await supabase.from("cost_entries").insert(entry).select().single();
      if (error) handleSupabaseError(error);
      return (data || []);
    },
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: ["costs"] });
      const previous = queryClient.getQueryData<any[]>(["costs"]);
      const optimisticItem = { id: `temp-${Date.now()}`, created_at: new Date().toISOString(), ...newEntry };
      queryClient.setQueryData(["costs"], (old: any[] = []) => [optimisticItem, ...old]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["costs"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["costs"] });
    },
  });
}
