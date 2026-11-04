import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Create a real-time channel listening to all database table changes
    const channel = supabase
      .channel("fleetops-db-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload) => {
          const table = payload.table;

          // Invalidate relevant TanStack Query keys depending on the changed table
          switch (table) {
            case "checklists":
              queryClient.invalidateQueries({ queryKey: ["checklists"] });
              break;
            case "fuel_logs":
              queryClient.invalidateQueries({ queryKey: ["fuel_logs"] });
              break;
            case "repair_requests":
              queryClient.invalidateQueries({ queryKey: ["repairs"] });
              break;
            case "tasks":
              queryClient.invalidateQueries({ queryKey: ["tasks"] });
              break;
            case "vehicles":
              queryClient.invalidateQueries({ queryKey: ["vehicles"] });
              break;
            case "drivers":
              queryClient.invalidateQueries({ queryKey: ["drivers"] });
              break;
            case "cost_entries":
              queryClient.invalidateQueries({ queryKey: ["costs"] });
              break;
            case "maintenance_schedules":
              queryClient.invalidateQueries({ queryKey: ["schedules"] });
              break;
            default:
              queryClient.invalidateQueries();
              break;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
