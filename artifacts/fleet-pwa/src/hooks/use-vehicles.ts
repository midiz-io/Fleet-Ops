import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Database } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";

export type VehicleWithFuelType = Database["public"]["Tables"]["vehicles"]["Row"] & {
  fuel_type: "Petrol" | "Diesel";
  tank_size: number;
  group: "Centres" | "Tropical";
  current_km: number;
  is_hidden?: boolean;
  odometer_override_km?: number;
  odometer_override_at?: string;
  odometer_override_by?: string;
};

export type Vehicle = VehicleWithFuelType;

export type VehicleMetaRecord = {
  fuel_type?: "Petrol" | "Diesel";
  tank_size?: number;
  group?: "Centres" | "Tropical";
  current_km?: number;
  is_hidden?: boolean;
  current_km_updated_at?: string;
  odometer_override_km?: number;
  odometer_override_at?: string;
  odometer_override_by?: string;
  odometer_override_reason?: string;
};

export function getTodaySriLankaDate(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

/**
 * Shared One-Vehicle-for-the-Day resolver (Fix 1 / A4 / O2 / O8).
 * Used across Driver Home, Checklist, Fuel Log, Tasks, and End Day.
 * Automatically clears yesterday's selection at midnight because keys include today's date.
 */
export function getDriverDailyVehicleId(
  userId?: string | null,
  vehicles?: VehicleWithFuelType[] | null,
  checklists?: Array<{ driver_id: string; vehicle_id: string; date: string; submitted_at?: string }> | null
): string {
  if (!userId) return "";
  const todayStr = getTodaySriLankaDate();

  try {
    // 1. Check today's explicit daily vehicle key
    const dailyKey = `daily_vehicle_${userId}_${todayStr}`;
    const dailyVal = localStorage.getItem(dailyKey);
    if (dailyVal && (!vehicles || vehicles.length === 0 || vehicles.some(v => v.id === dailyVal))) {
      return dailyVal;
    }

    // 2. Check today's morning picker key
    const morningKey = `morning_vehicle_${userId}_${todayStr}`;
    const morningVal = localStorage.getItem(morningKey);
    if (morningVal && (!vehicles || vehicles.length === 0 || vehicles.some(v => v.id === morningVal))) {
      localStorage.setItem(dailyKey, morningVal);
      return morningVal;
    }

    // 3. Check today's submitted checklists for this driver (newest first)
    if (checklists && checklists.length > 0) {
      const todayDriverChecklists = checklists
        .filter(c => c.driver_id === userId && (c.date === todayStr || (c.submitted_at && c.submitted_at.startsWith(todayStr))))
        .sort((a, b) => new Date(b.submitted_at || b.date).getTime() - new Date(a.submitted_at || a.date).getTime());
      if (todayDriverChecklists.length > 0 && todayDriverChecklists[0].vehicle_id) {
        const clVid = todayDriverChecklists[0].vehicle_id;
        localStorage.setItem(dailyKey, clVid);
        localStorage.setItem(morningKey, clVid);
        return clVid;
      }
    }

    // 4. Check switched_vehicle only if it was switched today; otherwise clear stale yesterday switch
    const switchedDate = localStorage.getItem(`switched_vehicle_date_${userId}`);
    const switchedVal = localStorage.getItem(`switched_vehicle_${userId}`);
    if (switchedVal) {
      if (switchedDate === todayStr && (!vehicles || vehicles.length === 0 || vehicles.some(v => v.id === switchedVal))) {
        return switchedVal;
      } else if (switchedDate && switchedDate !== todayStr) {
        localStorage.removeItem(`switched_vehicle_${userId}`);
        localStorage.removeItem(`switched_vehicle_date_${userId}`);
      }
    }
  } catch (e) {
    console.warn("Failed reading daily vehicle from localStorage", e);
  }

  // 5. Fallback to vehicle assigned to this driver in DB
  if (vehicles && vehicles.length > 0) {
    const assigned = vehicles.find(v => v.assigned_driver_id === userId);
    if (assigned) return assigned.id;
  }

  return "";
}

export function setDriverDailyVehicleId(userId?: string | null, vehicleId?: string | null): void {
  if (!userId) return;
  const todayStr = getTodaySriLankaDate();
  try {
    const dailyKey = `daily_vehicle_${userId}_${todayStr}`;
    const morningKey = `morning_vehicle_${userId}_${todayStr}`;
    if (vehicleId) {
      localStorage.setItem(dailyKey, vehicleId);
      localStorage.setItem(morningKey, vehicleId);
      localStorage.setItem(`switched_vehicle_${userId}`, vehicleId);
      localStorage.setItem(`switched_vehicle_date_${userId}`, todayStr);
    } else {
      localStorage.removeItem(dailyKey);
      localStorage.removeItem(morningKey);
      localStorage.removeItem(`switched_vehicle_${userId}`);
      localStorage.removeItem(`switched_vehicle_date_${userId}`);
    }
    window.dispatchEvent(new CustomEvent("fleet:daily_vehicle_changed", { detail: { userId, vehicleId } }));
  } catch (e) {
    console.warn("Failed saving daily vehicle to localStorage", e);
  }
}

function getDefaultFuelType(vehicleNo: string, model: string): "Petrol" | "Diesel" {
  const normNo = vehicleNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const normModel = model.toLowerCase();
  if (normNo.includes("BIC6942") || normModel.includes("dio") || normModel.includes("bike") || normModel.includes("scooter")) {
    return "Petrol";
  }
  return "Diesel";
}

function getDefaultTankSize(vehicleNo: string, model: string): number {
  const normNo = vehicleNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const normModel = model.toLowerCase();
  if (normNo.includes("BIC6942") || normModel.includes("dio") || normModel.includes("bike")) {
    return 5.3;
  }
  return 45;
}

export function normalizeVehicleNo(vehicleNo?: string | null): string {
  if (!vehicleNo) return "";
  let clean = vehicleNo.trim().toUpperCase();
  clean = clean.replace(/\s*-\s*/g, " ");
  clean = clean.replace(/\s+/g, " ");
  const m = clean.match(/^([A-Z]{2,3})\s*(\d{4})$/);
  if (m) {
    return `${m[1]} ${m[2]}`;
  }
  return clean;
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const [
        { data: vehicles, error },
        { data: metaData },
        { data: checklists },
        { data: fuelLogs },
        { data: fuelLogMetaData }
      ] = await Promise.all([
        supabase.from("vehicles").select("*").order("vehicle_no", { ascending: true }),
        supabase.from("settings").select("value").eq("key", "vehicle_meta").maybeSingle(),
        supabase.from("checklists").select("vehicle_id, meter_reading, submitted_at, date").order("submitted_at", { ascending: false }),
        supabase.from("fuel_logs").select("id, vehicle_id, after_meter, before_meter, date, created_at").order("created_at", { ascending: false }),
        supabase.from("settings").select("value").eq("key", "fuel_log_meta").maybeSingle(),
      ]);

      if (error) handleSupabaseError(error);
      const meta = (metaData?.value as Record<string, VehicleMetaRecord>) || {};
      const fuelLogMeta = (fuelLogMetaData?.value as Record<string, { is_past_entry?: boolean; added_by?: string; time?: string }>) || {};

      // Group checklists and fuel logs by vehicle_id
      const clByVehicle: Record<string, Array<{ km: number; ts: number }>> = {};
      (checklists || []).forEach((c: any) => {
        const km = Number(c.meter_reading) || 0;
        if (km <= 0 || km === 909090) return;
        const ts = new Date(c.submitted_at || c.date || 0).getTime() || 0;
        if (!clByVehicle[c.vehicle_id]) clByVehicle[c.vehicle_id] = [];
        clByVehicle[c.vehicle_id].push({ km, ts });
      });

      const flByVehicle: Record<string, Array<{ km: number; ts: number; isPast: boolean }>> = {};
      (fuelLogs || []).forEach((f: any) => {
        const km = Math.max(Number(f.after_meter) || 0, Number(f.before_meter) || 0);
        if (km <= 0 || km === 909090) return;
        const isPast = Boolean(fuelLogMeta[f.id]?.is_past_entry);
        const ts = new Date(f.created_at || f.date || 0).getTime() || 0;
        if (!flByVehicle[f.vehicle_id]) flByVehicle[f.vehicle_id] = [];
        flByVehicle[f.vehicle_id].push({ km, ts, isPast });
      });

      const seenNumbers = new Set<string>();
      const processed: VehicleWithFuelType[] = [];

      for (const v of (vehicles || [])) {
        const normNo = normalizeVehicleNo(v.vehicle_no);
        const dedupeKey = normNo.replace(/[^A-Z0-9]/g, "");
        if (seenNumbers.has(dedupeKey)) continue; // Merge duplicate entries e.g. DAI 0632 and DAI - 0632
        seenNumbers.add(dedupeKey);

        const vMeta = meta[v.id] || {};
        const fuel_type = vMeta.fuel_type || (v as any).fuel_type || getDefaultFuelType(normNo, v.model);
        const tank_size = vMeta.tank_size || Number((v as any).tank_size) || getDefaultTankSize(normNo, v.model);
        const group = vMeta.group || (v as any).group || "Centres";

        // Filter out known unverified test typos unless explicitly set by manager override
        const isCorruptedOutlier = (km: number): boolean => {
          if (km === 909090 || km <= 0) return true;
          if (dedupeKey.includes("BIC6942") && (km === 89509 || km > 80000)) return true;
          if (dedupeKey.includes("DAI1699") && (km === 87500 || km > 50000)) return true;
          if (dedupeKey.includes("DAI1696") && km === 85959) return true;
          return false;
        };

        const overrideKm = Number(vMeta.odometer_override_km) || 0;
        const overrideTs = vMeta.odometer_override_at ? new Date(vMeta.odometer_override_at).getTime() : 0;

        // Collect all accepted live readings with timestamps (newest accepted reading wins, NOT Math.max!)
        const candidates: Array<{ km: number; ts: number; priority: number }> = [];

        if (overrideKm > 0) {
          candidates.push({
            km: overrideKm,
            ts: overrideTs || new Date("2026-10-28T00:00:00Z").getTime(),
            priority: 4,
          });
        }

        const metaKm = Number(vMeta.current_km) || 0;
        const metaTs = vMeta.current_km_updated_at ? new Date(vMeta.current_km_updated_at).getTime() : 0;
        if (metaKm > 0 && !isCorruptedOutlier(metaKm) && (!overrideTs || metaTs >= overrideTs)) {
          candidates.push({
            km: metaKm,
            ts: metaTs,
            priority: 3,
          });
        }

        for (const fl of flByVehicle[v.id] || []) {
          // Past back-fill entries do not change the vehicle's live km
          if (fl.isPast) continue;
          if (isCorruptedOutlier(fl.km)) continue;
          if (overrideTs && fl.ts < overrideTs) continue;
          candidates.push({ km: fl.km, ts: fl.ts, priority: 2 });
        }

        for (const cl of clByVehicle[v.id] || []) {
          if (isCorruptedOutlier(cl.km)) continue;
          if (overrideTs && cl.ts < overrideTs) continue;
          candidates.push({ km: cl.km, ts: cl.ts, priority: 1 });
        }

        // Sort by timestamp descending (newest accepted reading first), then priority
        candidates.sort((a, b) => {
          if (b.ts !== a.ts) return b.ts - a.ts;
          return b.priority - a.priority;
        });

        const current_km = candidates.length > 0 ? candidates[0].km : 0;

        processed.push({
          ...v,
          vehicle_no: normNo,
          fuel_type,
          tank_size,
          group,
          current_km,
          is_hidden: Boolean(vMeta.is_hidden),
          odometer_override_km: vMeta.odometer_override_km,
          odometer_override_at: vMeta.odometer_override_at,
          odometer_override_by: vMeta.odometer_override_by,
        } as VehicleWithFuelType);
      }

      return processed;
    },
  });
}

export function useToggleHideVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isHidden }: { id: string; isHidden: boolean }) => {
      const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "vehicle_meta").maybeSingle();
      const existing = (currentMeta?.value as Record<string, VehicleMetaRecord>) || {};
      const updated = {
        ...existing,
        [id]: {
          ...(existing[id] || {}),
          is_hidden: isHidden,
        },
      };
      const { error } = await supabase.from("settings").upsert({
        key: "vehicle_meta",
        value: updated,
      });
      if (error) handleSupabaseError(error);
      return { id, isHidden };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

export function useVehicle(id: string | null) {
  const { data: vehicles } = useVehicles();
  return useQuery({
    queryKey: ["vehicles", id],
    queryFn: () => vehicles?.find(v => v.id === id) || null,
    enabled: !!id,
  });
}

export function useVehiclesByDriver(driverId: string | null) {
  const { data: vehicles } = useVehicles();
  return useQuery({
    queryKey: ["vehicles", "driver", driverId],
    queryFn: () => vehicles?.filter(v => v.assigned_driver_id === driverId) || [],
    enabled: !!driverId,
  });
}

type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"] & {
  fuel_type?: "Petrol" | "Diesel";
  tank_size?: number;
  group?: "Centres" | "Tropical";
};

type VehicleUpdate = Database["public"]["Tables"]["vehicles"]["Update"] & {
  fuel_type?: "Petrol" | "Diesel";
  tank_size?: number;
  group?: "Centres" | "Tropical";
  current_km?: number;
  odometer_override_km?: number;
  odometer_override_at?: string;
  odometer_override_by?: string;
  odometer_override_reason?: string;
};

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vehicle: VehicleInsert) => {
      const { fuel_type, tank_size, group, ...dbPayload } = vehicle;
      const { data, error } = await supabase.from("vehicles").insert(dbPayload).select().single();
      if (error) handleSupabaseError(error);

      if (data?.id) {
        try {
          const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "vehicle_meta").maybeSingle();
          const existing = (currentMeta?.value as Record<string, VehicleMetaRecord>) || {};
          await supabase.from("settings").upsert({
            key: "vehicle_meta",
            value: {
              ...existing,
              [data.id]: {
                fuel_type: fuel_type || getDefaultFuelType(data.vehicle_no, data.model),
                tank_size: tank_size || getDefaultTankSize(data.vehicle_no, data.model),
                group: group || "Centres",
              }
            }
          });
        } catch (e) {
          console.warn("Could not save vehicle_meta to settings:", e);
        }
      }

      return {
        ...data,
        fuel_type: fuel_type || getDefaultFuelType(data.vehicle_no, data.model),
        tank_size: tank_size || getDefaultTankSize(data.vehicle_no, data.model),
        group: group || "Centres",
        current_km: 0,
      } as VehicleWithFuelType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: VehicleUpdate }) => {
      // Strip non-table fields (including current_km and odometer_override_*) so Supabase never errors on missing columns
      const {
        fuel_type,
        tank_size,
        group,
        current_km,
        odometer_override_km,
        odometer_override_at,
        odometer_override_by,
        odometer_override_reason,
        ...dbUpdates
      } = updates;

      let data: any = null;
      if (Object.keys(dbUpdates).length > 0) {
        const res = await supabase.from("vehicles").update(dbUpdates).eq("id", id).select().maybeSingle();
        if (res.error) {
          console.warn("Vehicle table update warning:", res.error.message);
          // If only updating assigned_driver_id or optional column fails, do not block workflow
          if (!res.error.message?.includes("column")) {
            handleSupabaseError(res.error);
          }
        }
        data = res.data;
      }

      if (
        fuel_type !== undefined ||
        tank_size !== undefined ||
        group !== undefined ||
        current_km !== undefined ||
        odometer_override_km !== undefined
      ) {
        try {
          const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "vehicle_meta").maybeSingle();
          const existing = (currentMeta?.value as Record<string, VehicleMetaRecord>) || {};
          const prev = existing[id] || {};
          const nowIso = new Date().toISOString();
          await supabase.from("settings").upsert({
            key: "vehicle_meta",
            value: {
              ...existing,
              [id]: {
                ...prev,
                ...(fuel_type !== undefined && { fuel_type }),
                ...(tank_size !== undefined && { tank_size }),
                ...(group !== undefined && { group }),
                ...(current_km !== undefined && {
                  current_km: Number(current_km),
                  current_km_updated_at: nowIso,
                }),
                ...(odometer_override_km !== undefined && {
                  odometer_override_km: Number(odometer_override_km),
                  odometer_override_at: odometer_override_at || nowIso,
                  odometer_override_by: odometer_override_by || "Manager",
                  odometer_override_reason: odometer_override_reason || "Manual odometer correction",
                  current_km: Number(odometer_override_km),
                  current_km_updated_at: odometer_override_at || nowIso,
                }),
              }
            }
          });
        } catch (e) {
          console.warn("Could not update vehicle_meta in settings:", e);
        }
      }

      return { ...(data || {}), id, fuel_type, tank_size, group, current_km: odometer_override_km ?? current_km };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) handleSupabaseError(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
