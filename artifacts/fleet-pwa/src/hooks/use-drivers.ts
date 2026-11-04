import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, Database } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { handleSupabaseError } from "@/lib/error-handler";

export type DriverMeta = {
  dob?: string | null;
  group?: "Centres" | "Tropical";
  license_no?: string | null;
  license_expiry?: string | null;
};

export type DriverWithMeta = Database["public"]["Tables"]["drivers"]["Row"] & {
  dob?: string | null;
  group: "Centres" | "Tropical";
};

export type Driver = DriverWithMeta;

type DriverInsert = Database["public"]["Tables"]["drivers"]["Insert"] & {
  dob?: string | null;
  group?: "Centres" | "Tropical";
};

type DriverUpdate = Database["public"]["Tables"]["drivers"]["Update"] & {
  dob?: string | null;
  group?: "Centres" | "Tropical";
};

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const [{ data, error }, { data: metaData }] = await Promise.all([
        supabase.from("drivers").select("*").order("name", { ascending: true }),
        supabase.from("settings").select("value").eq("key", "driver_meta").maybeSingle()
      ]);
      if (error) handleSupabaseError(error);

      const metaMap = (metaData?.value as Record<string, DriverMeta>) || {};

      return (data || []).map(d => {
        const m = metaMap[d.id] || {};
        return {
          ...d,
          license_no: d.license_no || m.license_no || null,
          license_expiry: d.license_expiry || m.license_expiry || null,
          dob: m.dob || (d as any).dob || null,
          group: m.group || (d as any).group || "Centres",
        } as DriverWithMeta;
      });
    },
  });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (driver: DriverInsert) => {
      const { dob, group, ...rest } = driver;
      let insertedData: any = null;

      // Try inserting with all fields first
      const fullTry = await supabase.from("drivers").insert(rest).select().single();
      if (!fullTry.error) {
        insertedData = fullTry.data;
      } else {
        // Fallback: strip license fields if columns are missing
        const fallback = { ...rest };
        delete (fallback as any).license_no;
        delete (fallback as any).license_expiry;
        delete (fallback as any).incentive_points;
        const retry = await supabase.from("drivers").insert(fallback).select().single();
        if (retry.error) handleSupabaseError(retry.error);
        insertedData = retry.data;
      }

      // Persist metadata in settings
      if (insertedData?.id) {
        try {
          const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "driver_meta").maybeSingle();
          const existing = (currentMeta?.value as Record<string, DriverMeta>) || {};
          await supabase.from("settings").upsert({
            key: "driver_meta",
            value: {
              ...existing,
              [insertedData.id]: {
                dob: dob || null,
                group: group || "Centres",
                license_no: driver.license_no || null,
                license_expiry: driver.license_expiry || null,
              }
            }
          });
        } catch (e) {
          console.warn("Could not save driver_meta to settings:", e);
        }
      }

      return {
        ...insertedData,
        dob,
        group: group || "Centres",
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      const msg = `*Welcome to Vehicle Fleet Maintenance App!*\n\nHello *${data.name}*, you have been successfully registered.\n\n*Your Login Credentials:*\nPhone: ${data.phone}\nPIN: ${data.pin}\n\nPlease keep this PIN secure.`;
      sendWhatsAppMessage(data.phone, msg);
    },
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DriverUpdate }) => {
      const { dob, group, ...rest } = updates;
      let updatedData: any = null;

      if (Object.keys(rest).length > 0) {
        const fullTry = await supabase.from("drivers").update(rest).eq("id", id).select().single();
        if (!fullTry.error) {
          updatedData = fullTry.data;
        } else {
          const fallback = { ...rest };
          delete (fallback as any).license_no;
          delete (fallback as any).license_expiry;
          delete (fallback as any).incentive_points;
          const retry = await supabase.from("drivers").update(fallback).eq("id", id).select().single();
          if (retry.error) handleSupabaseError(retry.error);
          updatedData = retry.data;
        }
      }

      // Persist meta in settings
      if (dob !== undefined || group !== undefined || updates.license_no !== undefined || updates.license_expiry !== undefined) {
        try {
          const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "driver_meta").maybeSingle();
          const existing = (currentMeta?.value as Record<string, DriverMeta>) || {};
          const prev = existing[id] || {};
          await supabase.from("settings").upsert({
            key: "driver_meta",
            value: {
              ...existing,
              [id]: {
                ...prev,
                ...(dob !== undefined && { dob }),
                ...(group !== undefined && { group }),
                ...(updates.license_no !== undefined && { license_no: updates.license_no }),
                ...(updates.license_expiry !== undefined && { license_expiry: updates.license_expiry }),
              }
            }
          });
        } catch (e) {
          console.warn("Could not update driver_meta in settings:", e);
        }
      }

      return { ...(updatedData || {}), id, dob, group };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}

export function useDeleteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) handleSupabaseError(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}
