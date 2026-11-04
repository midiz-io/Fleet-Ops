import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { handleSupabaseError } from "@/lib/error-handler";

export type ShiftData = {
  shift: string;
  date?: string;
  updatedAt: string;
};

export type DriverShifts = Record<string, ShiftData>;
export type DriverCalendarShifts = Record<string, Record<string, string>>;

const SHIFTS_STORAGE_KEY = "fleet_driver_shifts_cache";
const CALENDAR_SHIFTS_STORAGE_KEY = "fleet_driver_calendar_shifts_cache";
const SHIFT_OPTIONS_STORAGE_KEY = "fleet_shift_options_cache";

export const DEFAULT_SHIFT_OPTIONS = [
  "6:00 AM - 3:00 PM",
  "8:00 AM - 5:00 PM",
  "10:00 AM - 7:00 PM",
  "1:00 PM - 10:00 PM",
  "2:00 PM - 11:00 PM",
  "8:00 AM",
  "10:00 AM",
  "11:00 AM",
  "1:00 PM",
  "2:00 PM",
  "5:00 PM",
  "7:00 PM",
  "10:00 PM",
  "11:00 PM",
  "Leave"
];

export function useShifts() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("shifts_channel")
      .on("broadcast", { event: "shifts_updated" }, (payload) => {
        if (payload?.payload) {
          queryClient.setQueryData(["driver_shifts"], payload.payload);
        } else {
          queryClient.invalidateQueries({ queryKey: ["driver_shifts"] });
        }
      })
      .on("broadcast", { event: "calendar_shifts_updated" }, (payload) => {
        if (payload?.payload) {
          queryClient.setQueryData(["driver_calendar_shifts"], payload.payload);
        } else {
          queryClient.invalidateQueries({ queryKey: ["driver_calendar_shifts"] });
        }
      })
      .on("broadcast", { event: "shift_options_updated" }, (payload) => {
        if (payload?.payload) {
          queryClient.setQueryData(["shift_options"], payload.payload);
        } else {
          queryClient.invalidateQueries({ queryKey: ["shift_options"] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: shifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ["driver_shifts"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "driver_shifts")
          .maybeSingle();

        if (error) {
          console.warn("Supabase query warning for driver_shifts:", error);
        }

        if (data?.value) {
          const val = data.value as DriverShifts;
          try {
            localStorage.setItem(SHIFTS_STORAGE_KEY, JSON.stringify(val));
          } catch (e) {}
          return val;
        }
      } catch (err) {
        console.warn("Failed to load driver_shifts from network:", err);
      }

      // Local storage fallback
      try {
        const cached = localStorage.getItem(SHIFTS_STORAGE_KEY);
        if (cached) return JSON.parse(cached) as DriverShifts;
      } catch (e) {}

      return {} as DriverShifts;
    }
  });

  const { data: calendarShifts } = useQuery({
    queryKey: ["driver_calendar_shifts"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "driver_calendar_shifts")
          .maybeSingle();

        if (!error && data?.value) {
          const val = data.value as DriverCalendarShifts;
          try {
            localStorage.setItem(CALENDAR_SHIFTS_STORAGE_KEY, JSON.stringify(val));
          } catch (e) {}
          return val;
        }
      } catch (err) {}

      try {
        const cached = localStorage.getItem(CALENDAR_SHIFTS_STORAGE_KEY);
        if (cached) return JSON.parse(cached) as DriverCalendarShifts;
      } catch (e) {}

      return {} as DriverCalendarShifts;
    }
  });

  const { data: shiftOptions, isLoading: optionsLoading } = useQuery({
    queryKey: ["shift_options"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "shift_options")
          .maybeSingle();

        if (error) {
          console.warn("Supabase query warning for shift_options:", error);
        }

        if (data?.value && Array.isArray(data.value) && data.value.length > 0) {
          try {
            localStorage.setItem(SHIFT_OPTIONS_STORAGE_KEY, JSON.stringify(data.value));
          } catch (e) {}
          return data.value as string[];
        }
      } catch (err) {
        console.warn("Failed to load shift_options from network:", err);
      }

      // Local storage fallback
      try {
        const cached = localStorage.getItem(SHIFT_OPTIONS_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
        }
      } catch (e) {}

      return DEFAULT_SHIFT_OPTIONS;
    }
  });

  const updateShift = useMutation({
    mutationFn: async ({ driverId, shift, date }: { driverId: string; shift: string; date?: string }) => {
      const todayDate = new Date().toISOString().split("T")[0];
      const targetDate = date || todayDate;

      // 1. Update calendar shifts (date-specific)
      let currentCalendar: DriverCalendarShifts = {};
      try {
        const cached = localStorage.getItem(CALENDAR_SHIFTS_STORAGE_KEY);
        if (cached) currentCalendar = JSON.parse(cached);
      } catch (e) {}

      try {
        const { data } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "driver_calendar_shifts")
          .maybeSingle();
        if (data?.value) {
          currentCalendar = { ...currentCalendar, ...(data.value as DriverCalendarShifts) };
        }
      } catch (e) {}

      const driverDates = currentCalendar[driverId] || {};
      driverDates[targetDate] = shift;
      currentCalendar[driverId] = driverDates;

      try {
        localStorage.setItem(CALENDAR_SHIFTS_STORAGE_KEY, JSON.stringify(currentCalendar));
      } catch (e) {}

      await supabase
        .from("settings")
        .upsert({ key: "driver_calendar_shifts", value: currentCalendar });

      // 2. Gather current shifts
      let currentShifts: DriverShifts = {};
      try {
        const cached = localStorage.getItem(SHIFTS_STORAGE_KEY);
        if (cached) currentShifts = JSON.parse(cached);
      } catch (e) {}

      try {
        const { data } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "driver_shifts")
          .maybeSingle();
        if (data?.value) {
          currentShifts = { ...currentShifts, ...(data.value as DriverShifts) };
        }
      } catch (e) {}

      // Update primary shift if date is today or no date specified
      const newShifts: DriverShifts = {
        ...currentShifts,
        [driverId]: { shift, date: targetDate, updatedAt: new Date().toISOString() }
      };

      try {
        localStorage.setItem(SHIFTS_STORAGE_KEY, JSON.stringify(newShifts));
      } catch (e) {}

      const { error } = await supabase
        .from("settings")
        .upsert({ key: "driver_shifts", value: newShifts });

      if (error) {
        console.error("Upsert driver_shifts error:", error);
        handleSupabaseError(error, "save shift");
      }

      // Broadcast update
      try {
        const channel = supabase.channel("shifts_channel");
        await channel.send({
          type: "broadcast",
          event: "shifts_updated",
          payload: newShifts
        });
        await channel.send({
          type: "broadcast",
          event: "calendar_shifts_updated",
          payload: currentCalendar
        });
      } catch (broadcastErr) {}

      return { newShifts, currentCalendar };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["driver_shifts"], data.newShifts);
      queryClient.setQueryData(["driver_calendar_shifts"], data.currentCalendar);
      queryClient.invalidateQueries({ queryKey: ["driver_shifts"] });
      queryClient.invalidateQueries({ queryKey: ["driver_calendar_shifts"] });
    }
  });

  const updateShiftOptions = useMutation({
    mutationFn: async (newOptions: string[]) => {
      try {
        localStorage.setItem(SHIFT_OPTIONS_STORAGE_KEY, JSON.stringify(newOptions));
      } catch (e) {}

      const { error } = await supabase
        .from("settings")
        .upsert({ key: "shift_options", value: newOptions });

      if (error) {
        console.error("Upsert shift_options error:", error);
        handleSupabaseError(error, "save shift options");
      }

      try {
        const channel = supabase.channel("shifts_channel");
        await channel.send({
          type: "broadcast",
          event: "shift_options_updated",
          payload: newOptions
        });
      } catch (e) {
        console.warn("Realtime broadcast shift_options_updated warning:", e);
      }

      return newOptions;
    },
    onSuccess: (newOptions) => {
      queryClient.setQueryData(["shift_options"], newOptions);
      queryClient.invalidateQueries({ queryKey: ["shift_options"] });
    }
  });

  const getDriverShiftForDate = (driverId: string, dateStr: string) => {
    if (calendarShifts?.[driverId]?.[dateStr]) {
      return calendarShifts[driverId][dateStr];
    }
    const today = new Date().toISOString().split("T")[0];
    if (shifts?.[driverId]?.date === dateStr || dateStr === today) {
      return shifts?.[driverId]?.shift || "No shift assigned";
    }
    return "No shift assigned";
  };

  return { 
    shifts, 
    calendarShifts, 
    shiftOptions, 
    isLoading: shiftsLoading || optionsLoading, 
    updateShift, 
    updateShiftOptions,
    getDriverShiftForDate 
  };
}
