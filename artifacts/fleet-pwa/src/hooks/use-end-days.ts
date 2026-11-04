import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";
import { getTodaySriLankaDate } from "@/hooks/use-vehicles";

export interface EndDayRecord {
  id: string;
  vehicleId: string;
  vehicleNo: string;
  driverId: string;
  driverName: string;
  date: string; // YYYY-MM-DD
  endKm: number;
  startKm?: number | null;
  deltaKm?: number | null;
  fuelBars: number;
  fuelLitersRemaining?: number;
  photoUrl?: string | null;
  workedHours: number;
  otHours: number;
  otReason?: string;
  otNote?: string;
  submittedAt: string;
}

const LOCAL_STORAGE_KEY = "fleet_end_day_records";

export function getLocalEndDayRecords(): EndDayRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read local end day records", err);
    return [];
  }
}

export function saveLocalEndDayRecords(records: EndDayRecord[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent("fleet:end_day_added"));
  } catch (err) {
    console.warn("Failed to persist local end day records", err);
  }
}

export function useEndDays() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["end_day_records"],
    queryFn: async (): Promise<EndDayRecord[]> => {
      let remoteRecords: EndDayRecord[] = [];
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "end_day_records")
          .maybeSingle();

        if (!error && Array.isArray(data?.value)) {
          remoteRecords = data.value as EndDayRecord[];
        }
      } catch (err) {
        console.warn("Failed to fetch end_day_records from Supabase:", err);
      }

      const localRecords = getLocalEndDayRecords();
      const map = new Map<string, EndDayRecord>();

      // Merge remote records first
      for (const r of remoteRecords) {
        if (r.id) map.set(r.id, r);
      }
      // Merge local records
      for (const l of localRecords) {
        if (l.id && !map.has(l.id)) {
          map.set(l.id, l);
        }
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );

      // Keep local cache synced
      saveLocalEndDayRecords(merged);
      return merged;
    },
    refetchInterval: 15000,
  });

  const submitEndDay = useMutation({
    mutationFn: async (record: Omit<EndDayRecord, "id" | "submittedAt">) => {
      const todayStr = getTodaySriLankaDate();
      const newRec: EndDayRecord = {
        ...record,
        id: `endday-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: record.date || todayStr,
        submittedAt: new Date().toISOString(),
      };

      // 1. Immediately cache locally
      const current = getLocalEndDayRecords();
      const updated = [newRec, ...current.filter(r => r.id !== newRec.id)];
      saveLocalEndDayRecords(updated);

      // 2. Persist to Supabase settings
      try {
        const { data: serverData } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "end_day_records")
          .maybeSingle();

        const serverExisting = Array.isArray(serverData?.value) ? (serverData.value as EndDayRecord[]) : [];
        const nextServer = [newRec, ...serverExisting.filter(r => r.id !== newRec.id)].slice(0, 500);

        await supabase.from("settings").upsert({
          key: "end_day_records",
          value: nextServer,
        });
      } catch (err) {
        console.warn("Could not push end day to Supabase, saved locally:", err);
      }

      return newRec;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["end_day_records"] });
    },
  });

  const records = query.data || getLocalEndDayRecords();

  const getDriverTodayEndDay = (driverId?: string, date?: string): EndDayRecord | null => {
    if (!driverId) return null;
    const targetDate = date || getTodaySriLankaDate();
    return (
      records.find(
        r => r.driverId === driverId && (r.date === targetDate || r.submittedAt.startsWith(targetDate))
      ) || null
    );
  };

  const getVehicleTodayEndDay = (vehicleId?: string, date?: string): EndDayRecord | null => {
    if (!vehicleId) return null;
    const targetDate = date || getTodaySriLankaDate();
    return (
      records.find(
        r => r.vehicleId === vehicleId && (r.date === targetDate || r.submittedAt.startsWith(targetDate))
      ) || null
    );
  };

  return {
    ...query,
    records,
    submitEndDay,
    getDriverTodayEndDay,
    getVehicleTodayEndDay,
  };
}

