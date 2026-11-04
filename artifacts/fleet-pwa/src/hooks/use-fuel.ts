import { handleSupabaseError } from "@/lib/error-handler";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Database } from "@/lib/supabase";
import { notifyManagers, getDriverAndVehicle } from "@/lib/whatsapp";

export type FuelLog = Database["public"]["Tables"]["fuel_logs"]["Row"];
type FuelLogInsert = Database["public"]["Tables"]["fuel_logs"]["Insert"];

export function useFuelLogs() {
  return useQuery({
    queryKey: ["fuel_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_logs").select("*").order("date", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []) as FuelLog[];
    },
  });
}

export function useDriverFuelLogs(driverId: string | null) {
  return useQuery({
    queryKey: ["fuel_logs", "driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_logs").select("*").eq("driver_id", driverId as string).order("date", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []) as FuelLog[];
    },
    enabled: !!driverId,
  });
}

export function useVehicleFuelLogs(vehicleId: string | null) {
  return useQuery({
    queryKey: ["fuel_logs", "vehicle", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_logs").select("*").eq("vehicle_id", vehicleId as string).order("date", { ascending: false });
      if (error) handleSupabaseError(error);
      return (data || []) as FuelLog[];
    },
    enabled: !!vehicleId,
  });
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Module-level map to resolve temporary / optimistic IDs to real DB UUIDs immediately
export const tempToRealFuelLogIdMap = new Map<string, string>();

export function useCreateFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: FuelLogInsert) => {
      const assignedId = (log as any).id && UUID_REGEX.test((log as any).id)
        ? (log as any).id
        : generateUUID();

      const payload: any = { ...log, id: assignedId };
      // Assign fallback for original schema
      payload.odometer = payload.after_meter;

      const { data, error } = await supabase.from("fuel_logs").insert(payload).select().single();
      
      if (error) {
        handleSupabaseError(error);
      }

      if (data?.id) {
        tempToRealFuelLogIdMap.set(assignedId, data.id);
        if ((log as any).tempId) {
          tempToRealFuelLogIdMap.set((log as any).tempId, data.id);
        }
      }

      return data;
    },
    onMutate: async (newLog) => {
      await queryClient.cancelQueries({ queryKey: ["fuel_logs"] });
      const previousAll = queryClient.getQueryData(["fuel_logs"]);
      const previousDriver = queryClient.getQueryData(["fuel_logs", "driver", newLog.driver_id]);

      const validId = (newLog as any).id && UUID_REGEX.test((newLog as any).id)
        ? (newLog as any).id
        : generateUUID();
      (newLog as any).id = validId;

      const optimisticItem = {
        id: validId,
        created_at: new Date().toISOString(),
        ...newLog,
      };

      queryClient.setQueryData(["fuel_logs"], (old: any[] = []) => [optimisticItem, ...old]);
      if (newLog.driver_id) {
        queryClient.setQueryData(["fuel_logs", "driver", newLog.driver_id], (old: any[] = []) => [optimisticItem, ...old]);
      }
      if (newLog.vehicle_id) {
        queryClient.setQueryData(["fuel_logs", "vehicle", newLog.vehicle_id], (old: any[] = []) => [optimisticItem, ...old]);
      }

      return { previousAll, previousDriver, driverId: newLog.driver_id, vehicleId: newLog.vehicle_id, tempId: validId };
    },
    onError: (_err, _newLog, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(["fuel_logs"], context.previousAll);
      }
      if (context?.previousDriver && context?.driverId) {
        queryClient.setQueryData(["fuel_logs", "driver", context.driverId], context.previousDriver);
      }
    },
    onSuccess: async (data, _vars, context) => {
      // Immediately replace optimistic item with real data in all fuel_logs caches
      queryClient.setQueriesData({ queryKey: ["fuel_logs"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map(item => (item.id === context?.tempId || item.id === data.id || (typeof item.id === "string" && item.id.startsWith("temp-"))) ? data : item);
      });

      const { driverName, vehicleNo } = await getDriverAndVehicle(data.driver_id, data.vehicle_id);
      let msg = `*Fuel Log Submitted*\n\n*Vehicle:* ${vehicleNo}\n*Driver:* ${driverName}\n*Liters:* ${data.liters}L\n*Amount:* Rs.${data.amount_paid}\n*Odometer:* ${data.after_meter}\n`; if (data.before_meter_photo_url) msg += `\n*Before Meter:* ${data.before_meter_photo_url}`; if (data.pump_meter_photo_url) msg += `\n*Pump Meter:* ${data.pump_meter_photo_url}`; if (data.meter_photo_url) msg += `\n*After Odometer:* ${data.meter_photo_url}`; if (data.bill_photo_url) msg += `\n*Bill:* ${data.bill_photo_url}`; notifyManagers(msg);
    },
    onSettled: (_data, _err, newLog) => {
      queryClient.invalidateQueries({ queryKey: ["fuel_logs"] });
      if (newLog.driver_id) {
        queryClient.invalidateQueries({ queryKey: ["fuel_logs", "driver", newLog.driver_id] });
      }
      if (newLog.vehicle_id) {
        queryClient.invalidateQueries({ queryKey: ["fuel_logs", "vehicle", newLog.vehicle_id] });
      }
    },
  });
}

export type OutstationOtRule = {
  area: string;
  hours: number;
};

export type FuelPrices = {
  diesel: number;
  petrol: number;
  eveningAlertTime?: string;
  eveningAlertCovers?: "Tropical" | "Centres" | "All";
  outstationOtRules?: OutstationOtRule[];
  normalOtBlockMinutes?: number;
};

export function useFuelPrices() {
  return useQuery({
    queryKey: ["settings", "fuel_prices"],
    queryFn: async () => {
      const [{ data: dualData }, { data: legacyData }] = await Promise.all([
        supabase.from("settings").select("value").eq("key", "fuel_prices").maybeSingle(),
        supabase.from("settings").select("value").eq("key", "fuel_price").maybeSingle(),
      ]);

      const legacy = legacyData?.value ? Number(legacyData.value) : 392;
      const prices = dualData?.value as FuelPrices | undefined;

      return {
        diesel: prices?.diesel ? Number(prices.diesel) : (legacy || 392),
        petrol: prices?.petrol ? Number(prices.petrol) : 368,
        eveningAlertTime: prices?.eveningAlertTime || "18:00",
        eveningAlertCovers: prices?.eveningAlertCovers || "Tropical",
        outstationOtRules: Array.isArray(prices?.outstationOtRules)
          ? prices!.outstationOtRules
          : [
              { area: "Vavuniya", hours: 2.0 },
              { area: "Jaffna", hours: 3.0 },
              { area: "Anuradhapura", hours: 2.0 },
              { area: "Trincomalee", hours: 2.5 },
            ],
        normalOtBlockMinutes: prices?.normalOtBlockMinutes || 30,
      };
    },
  });
}

export function useFuelPrice(fuelType: string = "Diesel") {
  const { data: prices, isLoading } = useFuelPrices();
  const price = (fuelType?.toLowerCase() === "petrol") ? (prices?.petrol ?? 368) : (prices?.diesel ?? 392);
  return {
    data: price,
    isLoading,
  };
}

export function useUpdateFuelPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prices: Partial<FuelPrices>) => {
      const { data: currentData } = await supabase.from("settings").select("value").eq("key", "fuel_prices").maybeSingle();
      const existing = (currentData?.value as FuelPrices) || { diesel: 392, petrol: 368, eveningAlertTime: "18:00", eveningAlertCovers: "Tropical" };
      const updated: FuelPrices = {
        ...existing,
        diesel: prices.diesel !== undefined ? prices.diesel : existing.diesel,
        petrol: prices.petrol !== undefined ? prices.petrol : existing.petrol,
        eveningAlertTime: prices.eveningAlertTime || existing.eveningAlertTime || "18:00",
        eveningAlertCovers: prices.eveningAlertCovers || existing.eveningAlertCovers || "Tropical",
        outstationOtRules: prices.outstationOtRules !== undefined ? prices.outstationOtRules : existing.outstationOtRules,
        normalOtBlockMinutes: prices.normalOtBlockMinutes !== undefined ? prices.normalOtBlockMinutes : (existing.normalOtBlockMinutes || 30),
      };

      const { data, error } = await supabase
        .from("settings")
        .upsert({ key: "fuel_prices", value: updated })
        .select()
        .single();

      if (error) handleSupabaseError(error);

      // Keep legacy key synced with diesel price
      await supabase.from("settings").upsert({ key: "fuel_price", value: updated.diesel.toString() });

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "fuel_prices"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "fuel_price"] });
    },
  });
}

export function useUpdateFuelPrice() {
  const updatePrices = useUpdateFuelPrices();
  return {
    mutateAsync: (price: number) => updatePrices.mutateAsync({ diesel: price }),
    isPending: updatePrices.isPending,
  };
}

type FuelLogUpdate = Database["public"]["Tables"]["fuel_logs"]["Update"];

export function useUpdateFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: FuelLogUpdate }) => {
      let targetId = id;

      // Self-heal: If an invalid / temporary ID was passed, find the actual record
      if (!UUID_REGEX.test(targetId)) {
        if (tempToRealFuelLogIdMap.has(targetId)) {
          targetId = tempToRealFuelLogIdMap.get(targetId)!;
        } else {
          // Query Supabase for the latest fuel_log matching vehicle / driver
          const query = supabase.from("fuel_logs").select("id").order("created_at", { ascending: false }).limit(1);
          if ((updates as any).vehicle_id) {
            query.eq("vehicle_id", (updates as any).vehicle_id);
          }
          if ((updates as any).driver_id) {
            query.eq("driver_id", (updates as any).driver_id);
          }
          const { data: latest } = await query.maybeSingle();
          if (latest?.id) {
            targetId = latest.id;
            tempToRealFuelLogIdMap.set(id, latest.id);
          }
        }
      }

      // Fallback: If still not a valid UUID, look for most recent record
      if (!UUID_REGEX.test(targetId)) {
        const { data: latestAny } = await supabase.from("fuel_logs").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latestAny?.id) {
          targetId = latestAny.id;
          tempToRealFuelLogIdMap.set(id, latestAny.id);
        }
      }

      const payload: any = { ...updates };
      delete (payload as any).tempId;
      if (payload.after_meter !== undefined) {
        payload.odometer = payload.after_meter;
      }
      const { data, error } = await supabase.from("fuel_logs").update(payload).eq("id", targetId).select().single();
      if (error) handleSupabaseError(error);
      return (data || []) as FuelLog[];
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["fuel_logs"] });
      const previousAll = queryClient.getQueryData<any[]>(["fuel_logs"]);
      queryClient.setQueryData(["fuel_logs"], (old: any[] = []) =>
        old.map(item => (item.id === id || (typeof item.id === "string" && item.id.startsWith("temp-") && typeof id === "string" && id.startsWith("temp-"))) ? { ...item, ...updates } : item)
      );
      return { previousAll };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(["fuel_logs"], context.previousAll);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel_logs"] });
    },
  });
}

export function useDeleteFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      let targetId = id;
      if (!UUID_REGEX.test(targetId)) {
        if (tempToRealFuelLogIdMap.has(targetId)) {
          targetId = tempToRealFuelLogIdMap.get(targetId)!;
        } else {
          const { data: latest } = await supabase.from("fuel_logs").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (latest?.id) targetId = latest.id;
        }
      }
      const { error } = await supabase.from("fuel_logs").delete().eq("id", targetId);
      if (error) handleSupabaseError(error);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["fuel_logs"] });
      const previousAll = queryClient.getQueryData<any[]>(["fuel_logs"]);
      queryClient.setQueryData(["fuel_logs"], (old: any[] = []) =>
        old.filter(item => item.id !== id && (!item.id.startsWith("temp-") || id !== item.id))
      );
      return { previousAll };
    },
    onError: (_err, _id, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(["fuel_logs"], context.previousAll);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel_logs"] });
    },
  });
}

