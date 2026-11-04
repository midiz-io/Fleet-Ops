import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";

export type OvertimeRecord = {
  id: string;
  driverId: string;
  driverName: string;
  date: string;
  day: string; // "Mon", "Tue", etc.
  workedHours: number;
  otHours: number;
  hours?: number;
  cappedHours?: number;
  capHours?: number;
  capReason?: string;
  reason: "Late return" | "Long trip" | "Loading" | "Other" | string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  approvedAt?: string;
  createdAt: string;
};

export function useOvertime() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["driver_overtime"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "driver_overtime")
        .maybeSingle();

      if (error) handleSupabaseError(error);
      const list = (data?.value as OvertimeRecord[]) || [];
      return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
  });

  const recordOvertime = useMutation({
    mutationFn: async (record: Omit<OvertimeRecord, "id" | "status" | "createdAt">) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "driver_overtime")
        .maybeSingle();

      const existing = (currentData?.value as OvertimeRecord[]) || [];
      const newRec: OvertimeRecord = {
        ...record,
        id: `ot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: "pending",
        hours: record.hours ?? record.otHours,
        capHours: record.capHours ?? record.cappedHours,
        createdAt: new Date().toISOString(),
      };

      const updated = [newRec, ...existing];
      const { error } = await supabase.from("settings").upsert({
        key: "driver_overtime",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return newRec;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver_overtime"] });
    },
  });

  const approveOvertime = useMutation({
    mutationFn: async (id: string) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "driver_overtime")
        .maybeSingle();

      const existing = (currentData?.value as OvertimeRecord[]) || [];
      const updated = existing.map(item =>
        item.id === id ? { ...item, status: "approved" as const, approvedAt: new Date().toISOString() } : item
      );

      const { error } = await supabase.from("settings").upsert({
        key: "driver_overtime",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver_overtime"] });
    },
  });

  const rejectOvertime = useMutation({
    mutationFn: async (id: string) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "driver_overtime")
        .maybeSingle();

      const existing = (currentData?.value as OvertimeRecord[]) || [];
      const updated = existing.map(item =>
        item.id === id ? { ...item, status: "rejected" as const } : item
      );

      const { error } = await supabase.from("settings").upsert({
        key: "driver_overtime",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver_overtime"] });
    },
  });

  const rawList = (query.data as OvertimeRecord[]) || [];
  const list = rawList.map(r => ({
    ...r,
    hours: r.hours ?? r.otHours ?? 0,
    capHours: r.capHours ?? r.cappedHours,
  }));

  return {
    overtimeRecords: list,
    overtimes: list,
    data: list,
    isLoading: query.isLoading,
    recordOvertime,
    approveOvertime,
    rejectOvertime,
    caps: {
      Vavuniya: 2,
      Polonnaruwa: 1.5,
    },
  };
}
