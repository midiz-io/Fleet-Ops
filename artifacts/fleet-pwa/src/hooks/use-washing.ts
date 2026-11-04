import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";
import { startOfWeek, parseISO, isAfter } from "date-fns";

export interface WashRecord {
  id: string;
  vehicleId: string;
  driverId: string;
  photoUrl: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export function useVehicleWashing(vehicleId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["vehicle_washes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "vehicle_washes")
        .maybeSingle();

      if (error) handleSupabaseError(error);
      const list = (data?.value as WashRecord[]) || [];
      return list;
    },
  });

  const allWashes = query.data || [];
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday

  // Filter washes for this week
  const getWeeklyWashCount = (vId: string): number => {
    return allWashes.filter(w => w.vehicleId === vId && isAfter(parseISO(w.createdAt), weekStart)).length;
  };

  const logWash = useMutation({
    mutationFn: async ({
      vehicleId,
      driverId,
      photoUrl,
    }: {
      vehicleId: string;
      driverId: string;
      photoUrl: string;
    }) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "vehicle_washes")
        .maybeSingle();

      const existing = (currentData?.value as WashRecord[]) || [];
      const newWash: WashRecord = {
        id: `wash-${Date.now()}`,
        vehicleId,
        driverId,
        photoUrl,
        date: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
      };

      const updated = [newWash, ...existing];
      const { error } = await supabase.from("settings").upsert({
        key: "vehicle_washes",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_washes"] });
    },
  });

  const washMap: Record<string, { count: number; photos: string[] }> = {};
  allWashes.forEach(w => {
    if (!washMap[w.vehicleId]) {
      washMap[w.vehicleId] = { count: 0, photos: [] };
    }
    if (isAfter(parseISO(w.createdAt), weekStart)) {
      washMap[w.vehicleId].count += 1;
      washMap[w.vehicleId].photos.push(w.photoUrl);
    }
  });

  return {
    washes: allWashes,
    washMap,
    weeklyCount: vehicleId ? getWeeklyWashCount(vehicleId) : 0,
    getWeeklyWashCount,
    logWash,
    isLoading: query.isLoading,
  };
}

export const useWashing = useVehicleWashing;
