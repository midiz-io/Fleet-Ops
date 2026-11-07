import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/lib/error-handler";
import { startOfWeek, parseISO, isAfter, subDays, format } from "date-fns";

export interface WashDaySession {
  id: string;
  vehicleId: string;
  driverId: string;
  driverName?: string;
  daySlot: 1 | 2 | 3; // Day 1, Day 2, Day 3
  photos: string[]; // 5 photos: [Front, Rear, Left, Right, Interior]
  date: string; // YYYY-MM-DD
  weekStart: string; // YYYY-MM-DD of Monday of that week
  createdAt: string;
}

export interface WashRecord {
  id: string;
  vehicleId: string;
  driverId: string;
  photoUrl: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface WashSkipRequest {
  id: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleNo: string;
  weekStart: string; // Monday of the blocked week (YYYY-MM-DD)
  prevWeekWashes: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export const WASH_PHOTO_SLOTS = [
  { id: 0, key: "front", label: "1. Front View (ඉදිරිපස)", hint: "Full front bumper, headlights, windscreen" },
  { id: 1, key: "rear", label: "2. Rear View (පසුපස)", hint: "Full rear bumper, license plate, taillights" },
  { id: 2, key: "left", label: "3. Left Side (වම් පස)", hint: "Full side profile, clean doors & wheels" },
  { id: 3, key: "right", label: "4. Right Side (දකුණු පස)", hint: "Full right doors, panels & clean body" },
  { id: 4, key: "interior", label: "5. Interior (ඇතුළත)", hint: "Clean dashboard, seats & floor mats" },
];

export function useVehicleWashing(vehicleId?: string | null) {
  const queryClient = useQueryClient();

  const now = new Date();
  const currentWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const prevWeekStart = format(subDays(startOfWeek(now, { weekStartsOn: 1 }), 7), "yyyy-MM-dd");

  // Query wash sessions (v2 multi-photo 3-day structure)
  const sessionsQuery = useQuery({
    queryKey: ["vehicle_wash_sessions_v2"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "vehicle_wash_sessions_v2")
          .maybeSingle();

        if (error) console.warn("Supabase warning on vehicle_wash_sessions_v2:", error);
        return (data?.value as WashDaySession[]) || [];
      } catch (e) {
        return [];
      }
    },
  });

  // Query legacy single washes for backwards compatibility
  const legacyQuery = useQuery({
    queryKey: ["vehicle_washes"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "vehicle_washes")
          .maybeSingle();

        if (error) console.warn("Supabase warning on vehicle_washes:", error);
        return (data?.value as WashRecord[]) || [];
      } catch (e) {
        return [];
      }
    },
  });

  // Query wash skip requests
  const skipRequestsQuery = useQuery({
    queryKey: ["wash_skip_requests"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "wash_skip_requests")
          .maybeSingle();

        if (error) console.warn("Supabase warning on wash_skip_requests:", error);
        return (data?.value as WashSkipRequest[]) || [];
      } catch (e) {
        return [];
      }
    },
  });

  const allSessions: WashDaySession[] = sessionsQuery.data || [];
  const legacyWashes: WashRecord[] = legacyQuery.data || [];
  const skipRequests: WashSkipRequest[] = skipRequestsQuery.data || [];

  // Helper to get sessions for a vehicle in a particular week
  const getVehicleWeekSessions = (vId: string, weekStartDate: string = currentWeekStart) => {
    return allSessions.filter(s => s.vehicleId === vId && s.weekStart === weekStartDate);
  };

  // Helper to count completed wash days for a vehicle in a week (Day 1, 2, 3)
  const getWeeklyWashCount = (vId: string, weekStartDate: string = currentWeekStart): number => {
    const vSessions = getVehicleWeekSessions(vId, weekStartDate);
    const daySlotsDone = new Set(vSessions.map(s => s.daySlot));
    // Also include legacy single photos for this week if not already covered
    const legacyCount = legacyWashes.filter(
      w => w.vehicleId === vId && format(startOfWeek(parseISO(w.createdAt), { weekStartsOn: 1 }), "yyyy-MM-dd") === weekStartDate
    ).length;
    return Math.min(3, Math.max(daySlotsDone.size, legacyCount));
  };

  // Helper to count completed wash days for a driver in a week
  const getDriverWeeklyWashCount = (driverId: string, weekStartDate: string = currentWeekStart): number => {
    const dSessions = allSessions.filter(s => s.driverId === driverId && s.weekStart === weekStartDate);
    const daySlotsDone = new Set(dSessions.map(s => s.daySlot));
    const legacyCount = legacyWashes.filter(
      w => w.driverId === driverId && format(startOfWeek(parseISO(w.createdAt), { weekStartsOn: 1 }), "yyyy-MM-dd") === weekStartDate
    ).length;
    return Math.min(3, Math.max(daySlotsDone.size, legacyCount));
  };

  // Check if a driver is BLOCKED from working this week due to < 3 washes in previous week
  const checkDriverWashCompliance = (driverId: string, vId?: string | null) => {
    // Check if the previous week had any washes or tasks in system
    const prevWeekDriverWashes = getDriverWeeklyWashCount(driverId, prevWeekStart);
    const prevWeekVehicleWashes = vId ? getWeeklyWashCount(vId, prevWeekStart) : 0;
    const completedPrevWeek = Math.max(prevWeekDriverWashes, prevWeekVehicleWashes);

    // Look for a skip request for the current week
    const currentSkipRequest = skipRequests.find(
      r => (r.driverId === driverId || (vId && r.vehicleId === vId)) && r.weekStart === currentWeekStart
    );

    // If an approved skip exists, driver is not blocked
    if (currentSkipRequest && currentSkipRequest.status === "approved") {
      return {
        isBlocked: false,
        completedPrevWeek,
        skipStatus: "approved" as const,
        skipRequest: currentSkipRequest,
        currentWeekStart,
        prevWeekStart,
      };
    }

    // Only block if prevWeek had fewer than 3 washes AND there exists any record of past activity
    // (To avoid blocking on fresh install or if completed >= 3)
    const hasAnyPastRecords = allSessions.some(s => s.weekStart === prevWeekStart) || legacyWashes.some(w => format(startOfWeek(parseISO(w.createdAt), { weekStartsOn: 1 }), "yyyy-MM-dd") === prevWeekStart);

    const isBlocked = hasAnyPastRecords && completedPrevWeek < 3 && (!currentSkipRequest || currentSkipRequest.status !== "approved");

    return {
      isBlocked,
      completedPrevWeek,
      skipStatus: currentSkipRequest ? currentSkipRequest.status : ("none" as const),
      skipRequest: currentSkipRequest,
      currentWeekStart,
      prevWeekStart,
    };
  };

  // Mutation: Save a Day Session with 5 photos (Day 1, Day 2, or Day 3)
  const saveDaySession = useMutation({
    mutationFn: async ({
      vehicleId,
      driverId,
      driverName,
      daySlot,
      photos,
      weekStartDate = currentWeekStart,
    }: {
      vehicleId: string;
      driverId: string;
      driverName?: string;
      daySlot: 1 | 2 | 3;
      photos: string[];
      weekStartDate?: string;
    }) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "vehicle_wash_sessions_v2")
        .maybeSingle();

      const existing = (currentData?.value as WashDaySession[]) || [];
      const sessionIndex = existing.findIndex(
        s => s.vehicleId === vehicleId && s.weekStart === weekStartDate && s.daySlot === daySlot
      );

      const sessionObj: WashDaySession = {
        id: sessionIndex >= 0 ? existing[sessionIndex].id : `wash-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        vehicleId,
        driverId,
        driverName,
        daySlot,
        photos,
        date: format(new Date(), "yyyy-MM-dd"),
        weekStart: weekStartDate,
        createdAt: new Date().toISOString(),
      };

      let updated: WashDaySession[];
      if (sessionIndex >= 0) {
        updated = [...existing];
        updated[sessionIndex] = sessionObj;
      } else {
        updated = [sessionObj, ...existing];
      }

      const { error } = await supabase.from("settings").upsert({
        key: "vehicle_wash_sessions_v2",
        value: updated,
      });

      if (error) handleSupabaseError(error);

      // Also sync to legacy vehicle_washes so old screens still see count increments
      try {
        const { data: legacyData } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "vehicle_washes")
          .maybeSingle();
        const existingLegacy = (legacyData?.value as WashRecord[]) || [];
        const newLegacy: WashRecord = {
          id: `wash-${Date.now()}`,
          vehicleId,
          driverId,
          photoUrl: photos[0] || "",
          date: format(new Date(), "yyyy-MM-dd"),
          createdAt: new Date().toISOString(),
        };
        await supabase.from("settings").upsert({
          key: "vehicle_washes",
          value: [newLegacy, ...existingLegacy],
        });
      } catch (e) {}

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_wash_sessions_v2"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle_washes"] });
    },
  });

  // Mutation: Driver submits a wash skip request
  const requestWashSkip = useMutation({
    mutationFn: async ({
      driverId,
      driverName,
      vehicleId,
      vehicleNo,
      prevWeekWashes,
      reason,
    }: {
      driverId: string;
      driverName: string;
      vehicleId: string;
      vehicleNo: string;
      prevWeekWashes: number;
      reason: string;
    }) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "wash_skip_requests")
        .maybeSingle();

      const existing = (currentData?.value as WashSkipRequest[]) || [];
      const newRequest: WashSkipRequest = {
        id: `skip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        driverId,
        driverName,
        vehicleId,
        vehicleNo,
        weekStart: currentWeekStart,
        prevWeekWashes,
        reason,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const updated = [newRequest, ...existing.filter(r => !(r.driverId === driverId && r.weekStart === currentWeekStart))];

      const { error } = await supabase.from("settings").upsert({
        key: "wash_skip_requests",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wash_skip_requests"] });
    },
  });

  // Mutation: Manager reviews / approves / rejects skip request
  const reviewWashSkip = useMutation({
    mutationFn: async ({
      requestId,
      status,
      reviewerName,
    }: {
      requestId: string;
      status: "approved" | "rejected";
      reviewerName: string;
    }) => {
      const { data: currentData } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "wash_skip_requests")
        .maybeSingle();

      const existing = (currentData?.value as WashSkipRequest[]) || [];
      const updated = existing.map(r => {
        if (r.id === requestId) {
          return {
            ...r,
            status,
            reviewedBy: reviewerName,
            reviewedAt: new Date().toISOString(),
          };
        }
        return r;
      });

      const { error } = await supabase.from("settings").upsert({
        key: "wash_skip_requests",
        value: updated,
      });

      if (error) handleSupabaseError(error);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wash_skip_requests"] });
    },
  });

  // Build washMap for vehicle cards
  const washMap: Record<string, { count: number; photos: string[] }> = {};
  allSessions.forEach(s => {
    if (s.weekStart === currentWeekStart) {
      if (!washMap[s.vehicleId]) {
        washMap[s.vehicleId] = { count: 0, photos: [] };
      }
      washMap[s.vehicleId].count += 1;
      washMap[s.vehicleId].photos.push(...(s.photos || []));
    }
  });

  // Incorporate legacy counts if not already counted
  legacyWashes.forEach(w => {
    const isThisWeek = format(startOfWeek(parseISO(w.createdAt), { weekStartsOn: 1 }), "yyyy-MM-dd") === currentWeekStart;
    if (isThisWeek) {
      if (!washMap[w.vehicleId]) {
        washMap[w.vehicleId] = { count: 1, photos: [w.photoUrl] };
      }
    }
  });

  // Legacy single photo logger for backwards compatibility
  const logWash = useMutation({
    mutationFn: async ({ vehicleId, driverId, photoUrl }: { vehicleId: string; driverId: string; photoUrl: string }) => {
      return saveDaySession.mutateAsync({
        vehicleId,
        driverId,
        daySlot: 1,
        photos: [photoUrl],
      });
    },
  });

  return {
    washes: legacyWashes,
    washSessions: allSessions,
    skipRequests,
    washMap,
    weeklyCount: vehicleId ? getWeeklyWashCount(vehicleId) : 0,
    getWeeklyWashCount,
    getDriverWeeklyWashCount,
    getVehicleWeekSessions,
    checkDriverWashCompliance,
    saveDaySession,
    requestWashSkip,
    reviewWashSkip,
    logWash,
    currentWeekStart,
    prevWeekStart,
    isLoading: sessionsQuery.isLoading || legacyQuery.isLoading,
  };
}

export const useWashing = useVehicleWashing;
