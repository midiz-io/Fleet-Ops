import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { handleSupabaseError } from "@/lib/error-handler";
import { getTodaySriLankaDate } from "@/hooks/use-vehicles";

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled" | "unfinished";

export type DriverTask = {
  id: string;
  title: string;
  description: string;
  driverId: string;
  vehicleId: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  startDate?: string | null;
  endDate?: string | null;
  route: string;
  notes: string;
  proofUrl: string;
  startTime?: string | null;
  endTime?: string | null;
  photoRequired?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
};

export type TaskMeta = {
  status?: TaskStatus | null;
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  photoRequired?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
};

// Helper: parse HH:mm AM/PM to minutes for proper chronological sorting
export function timeStringToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 9999;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 9999;
  let [, h, m, ampm] = match;
  let hours = parseInt(h, 10);
  const mins = parseInt(m, 10);
  if (ampm) {
    const isPm = ampm.toUpperCase() === "PM";
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
  }
  return hours * 60 + mins;
}

// Helper: sort tasks by scheduled start time earliest first
export function sortTasksEarliestFirst(tasks: DriverTask[]): DriverTask[] {
  return [...tasks].sort((a, b) => {
    const aDate = a.startDate || a.dueDate || "";
    const bDate = b.startDate || b.dueDate || "";
    if (aDate && bDate && aDate !== bDate) {
      return aDate.localeCompare(bDate);
    }
    const aMins = timeStringToMinutes(a.startTime);
    const bMins = timeStringToMinutes(b.startTime);
    if (aMins !== bMins) return aMins - bMins;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

// Map database row to frontend DriverTask (including midnight auto-unfinished detection)
function mapToCamelCase(row: any, metaMap?: Record<string, TaskMeta>): DriverTask {
  const meta = metaMap?.[row.id] || {};
  const todayStr = getTodaySriLankaDate();
  const startDate = meta.startDate || row.start_date || row.due_date || null;
  const endDate = meta.endDate || row.end_date || startDate || null;
  const dueDate = startDate || row.due_date || "";

  // Resolve status: prefer meta.status when DB constraint prevented saving "cancelled" or "unfinished"
  let effectiveStatus = (meta.status || row.status || "pending") as TaskStatus;
  if (row.status === "done" && meta.status !== "cancelled") {
    effectiveStatus = "done";
  } else if (row.status === "cancelled" || row.status === "unfinished") {
    effectiveStatus = row.status as TaskStatus;
  }

  // Midnight rule (Fix 4 / A3 / A7 / O1): Any open task from before today is automatically marked "unfinished"
  const checkDate = String(endDate || startDate || dueDate || "").slice(0, 10);
  if (
    (effectiveStatus === "pending" || effectiveStatus === "in_progress") &&
    checkDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(checkDate) &&
    checkDate < todayStr
  ) {
    effectiveStatus = "unfinished";
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    driverId: row.driver_id || "",
    vehicleId: row.vehicle_id || "",
    priority: (row.priority || "medium") as TaskPriority,
    status: effectiveStatus,
    dueDate,
    startDate,
    endDate,
    route: row.route || "",
    notes: row.notes || "",
    proofUrl: row.proof_url || "",
    startTime: meta.startTime || row.start_time || null,
    endTime: meta.endTime || row.end_time || null,
    photoRequired: meta.photoRequired !== undefined ? meta.photoRequired : (row.photo_required ?? false),
    startedAt: meta.startedAt || row.started_at || null,
    finishedAt: meta.finishedAt || row.finished_at || null,
    createdAt: row.created_at,
  };
}

// Map frontend DriverTask object to database row (standard columns guaranteed in public.tasks)
function mapToSnakeCase(task: Partial<DriverTask>): any {
  const row: any = {};
  if (task.title !== undefined) row.title = task.title;
  if (task.description !== undefined) row.description = task.description?.trim() ? task.description.trim() : null;
  if (task.driverId !== undefined) row.driver_id = task.driverId?.trim() ? task.driverId.trim() : null;
  if (task.vehicleId !== undefined) row.vehicle_id = task.vehicleId?.trim() ? task.vehicleId.trim() : null;
  if (task.priority !== undefined) row.priority = task.priority;
  if (task.status !== undefined) row.status = task.status;
  if (task.startDate !== undefined) {
    row.due_date = task.startDate || null;
  } else if (task.dueDate !== undefined) {
    row.due_date = task.dueDate || null;
  }
  if (task.route !== undefined) row.route = task.route?.trim() ? task.route.trim() : null;
  if (task.notes !== undefined) row.notes = task.notes?.trim() ? task.notes.trim() : null;
  if (task.proofUrl !== undefined) row.proof_url = task.proofUrl?.trim() ? task.proofUrl.trim() : null;
  return row;
}

export function useTasks(driverId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", driverId],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*");
      if (driverId) {
        q = q.eq("driver_id", driverId);
      }
      const [{ data, error }, { data: metaData }] = await Promise.all([
        q.order("created_at", { ascending: false }),
        supabase.from("settings").select("value").eq("key", "task_meta").maybeSingle(),
      ]);
      if (error) handleSupabaseError(error, "load tasks");

      const cachedMeta = (() => {
        try {
          return JSON.parse(localStorage.getItem("fleet_task_meta_cache") || "{}");
        } catch {
          return {};
        }
      })();

      const serverMeta = (metaData?.value as Record<string, TaskMeta>) || {};
      const metaMap: Record<string, TaskMeta> = {};
      const allIds = new Set([...Object.keys(cachedMeta), ...Object.keys(serverMeta)]);
      allIds.forEach(id => {
        metaMap[id] = { ...(cachedMeta[id] || {}), ...(serverMeta[id] || {}) };
      });

      const mapped = (data || []).map(row => mapToCamelCase(row, metaMap));

      // Background sync any newly auto-marked "unfinished" past-day tasks to task_meta so all devices agree
      const autoUnfinishedIds = (data || [])
        .filter((row: any) => {
          const m = mapped.find(t => t.id === row.id);
          return m?.status === "unfinished" && metaMap[row.id]?.status !== "unfinished" && row.status !== "unfinished";
        })
        .map((row: any) => row.id);

      if (autoUnfinishedIds.length > 0) {
        try {
          const nextMeta = { ...serverMeta };
          for (const id of autoUnfinishedIds) {
            nextMeta[id] = { ...(nextMeta[id] || {}), status: "unfinished" };
          }
          localStorage.setItem("fleet_task_meta_cache", JSON.stringify({ ...cachedMeta, ...nextMeta }));
          supabase
            .from("settings")
            .upsert({ key: "task_meta", value: nextMeta })
            .then(() => {});
        } catch {}
      }

      // Always sort by start time, earliest first
      return sortTasksEarliestFirst(mapped);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (task: Omit<DriverTask, "id" | "createdAt" | "proofUrl">) => {
      const baseRow = mapToSnakeCase(task);
      const extendedRow = {
        ...baseRow,
        start_date: task.startDate || task.dueDate || null,
        end_date: task.endDate || task.startDate || task.dueDate || null,
        start_time: task.startTime || null,
        end_time: task.endTime || null,
        photo_required: task.photoRequired ?? false,
      };

      let data: any = null;
      const { data: extData, error: extError } = await supabase.from("tasks").insert(extendedRow).select().maybeSingle();
      if (!extError && extData) {
        data = extData;
      } else {
        const safeBase = { ...baseRow };
        if (safeBase.status === "cancelled" || safeBase.status === "unfinished") {
          safeBase.status = "pending";
        }
        const { data: baseData, error: baseError } = await supabase.from("tasks").insert(safeBase).select().single();
        if (baseError) {
          console.error("Task insert error:", baseError);
          handleSupabaseError(baseError, "create task");
        }
        data = baseData;
      }

      // Persist extended task metadata in localStorage and settings table
      if (data?.id) {
        const metaPayload: TaskMeta = {
          status: task.status || "pending",
          startTime: task.startTime || null,
          endTime: task.endTime || null,
          startDate: task.startDate || task.dueDate || null,
          endDate: task.endDate || task.startDate || task.dueDate || null,
          photoRequired: task.photoRequired ?? false,
          startedAt: task.startedAt || null,
          finishedAt: task.finishedAt || null,
        };

        try {
          const cached = JSON.parse(localStorage.getItem("fleet_task_meta_cache") || "{}");
          cached[data.id] = metaPayload;
          localStorage.setItem("fleet_task_meta_cache", JSON.stringify(cached));
        } catch {}

        try {
          const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "task_meta").maybeSingle();
          const existing = (currentMeta?.value as Record<string, TaskMeta>) || {};
          await supabase.from("settings").upsert({
            key: "task_meta",
            value: { ...existing, [data.id]: metaPayload },
          });
        } catch (e) {
          console.warn("Could not persist task meta in settings:", e);
        }
      }

      return mapToCamelCase(data, {
        [data.id]: {
          status: task.status,
          startTime: task.startTime,
          endTime: task.endTime,
          startDate: task.startDate,
          endDate: task.endDate,
          photoRequired: task.photoRequired,
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
        },
      });
    },
    onMutate: async newTask => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = queryClient.getQueryData<DriverTask[]>(["tasks", driverId]);
      const tempTask: DriverTask = {
        id: `temp-${Date.now()}`,
        createdAt: new Date().toISOString(),
        proofUrl: "",
        ...newTask,
      };

      queryClient.setQueryData(["tasks", driverId], (old: DriverTask[] = []) =>
        sortTasksEarliestFirst([tempTask, ...old])
      );
      return { previousTasks };
    },
    onError: (_err, _newTask, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["tasks", driverId], context.previousTasks);
      }
    },
    onSuccess: async data => {
      if (!data.driverId) return;
      try {
        const { data: driver } = await supabase.from("drivers").select("phone, name").eq("id", data.driverId).single();
        if (driver) {
          let msg = `*New Task Assigned*\n\n*Title:* ${data.title}\n*Description:* ${data.description || "N/A"}\n*Route:* ${data.route || "N/A"}\n*Priority:* ${data.priority}\n`;
          if (data.startDate)
            msg += `*Date:* ${data.startDate}${data.endDate && data.endDate !== data.startDate ? ` -> ${data.endDate}` : ""}\n`;
          if (data.startTime) msg += `*Start Time:* ${data.startTime}\n`;
          if (data.endTime) msg += `*End Time:* ${data.endTime}\n`;
          if (data.notes) msg += `*Notes:* ${data.notes}\n`;
          sendWhatsAppMessage(driver.phone, msg);
        }
      } catch (e) {
        console.warn("WhatsApp notification error:", e);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DriverTask> }) => {
      const baseRow = mapToSnakeCase(updates);
      const extendedRow = {
        ...baseRow,
        ...(updates.startDate !== undefined && { start_date: updates.startDate || null }),
        ...(updates.endDate !== undefined && { end_date: updates.endDate || null }),
        ...(updates.startTime !== undefined && { start_time: updates.startTime || null }),
        ...(updates.endTime !== undefined && { end_time: updates.endTime || null }),
        ...(updates.photoRequired !== undefined && { photo_required: updates.photoRequired }),
        ...(updates.startedAt !== undefined && { started_at: updates.startedAt || null }),
        ...(updates.finishedAt !== undefined && { finished_at: updates.finishedAt || null }),
      };

      let data: any = null;
      if (Object.keys(extendedRow).length > 0) {
        const { data: extData, error: extError } = await supabase
          .from("tasks")
          .update(extendedRow)
          .eq("id", id)
          .select()
          .maybeSingle();

        if (!extError && extData) {
          data = extData;
        } else {
          // Try baseRow first
          const { data: baseData, error: baseError } = await supabase
            .from("tasks")
            .update(baseRow)
            .eq("id", id)
            .select()
            .maybeSingle();

          if (!baseError && baseData) {
            data = baseData;
          } else {
            // If DB constraint tasks_status_check rejects "cancelled" or "unfinished", fallback to keeping DB status "pending" and saving status in task_meta!
            const fallbackRow = { ...baseRow };
            if (fallbackRow.status === "cancelled" || fallbackRow.status === "unfinished") {
              fallbackRow.status = "pending";
            }
            const { data: fbData, error: fbError } = await supabase
              .from("tasks")
              .update(fallbackRow)
              .eq("id", id)
              .select()
              .maybeSingle();

            if (fbError) {
              console.error("Task update error:", fbError);
              handleSupabaseError(fbError, "update task");
            }
            data = fbData;
          }
        }
      }

      // Persist extended task metadata (including status) in localStorage & settings
      const metaPayload: TaskMeta = {
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.startTime !== undefined && { startTime: updates.startTime }),
        ...(updates.endTime !== undefined && { endTime: updates.endTime }),
        ...(updates.startDate !== undefined && { startDate: updates.startDate }),
        ...(updates.endDate !== undefined && { endDate: updates.endDate }),
        ...(updates.photoRequired !== undefined && { photoRequired: updates.photoRequired }),
        ...(updates.startedAt !== undefined && { startedAt: updates.startedAt }),
        ...(updates.finishedAt !== undefined && { finishedAt: updates.finishedAt }),
      };

      let finalMetaForTask: TaskMeta = metaPayload;

      try {
        const cached = JSON.parse(localStorage.getItem("fleet_task_meta_cache") || "{}");
        cached[id] = { ...(cached[id] || {}), ...metaPayload };
        finalMetaForTask = cached[id];
        localStorage.setItem("fleet_task_meta_cache", JSON.stringify(cached));
      } catch {}

      try {
        const { data: currentMeta } = await supabase.from("settings").select("value").eq("key", "task_meta").maybeSingle();
        const existing = (currentMeta?.value as Record<string, TaskMeta>) || {};
        const prevTaskMeta = existing[id] || {};
        finalMetaForTask = { ...prevTaskMeta, ...metaPayload };
        await supabase.from("settings").upsert({
          key: "task_meta",
          value: { ...existing, [id]: finalMetaForTask },
        });
      } catch (e) {
        console.warn("Could not update task meta in settings:", e);
      }

      return mapToCamelCase(data || { id, ...baseRow, created_at: new Date().toISOString() }, {
        [id]: finalMetaForTask,
      });
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = queryClient.getQueryData<DriverTask[]>(["tasks", driverId]);

      queryClient.setQueryData(["tasks", driverId], (old: DriverTask[] = []) =>
        sortTasksEarliestFirst(old.map(t => (t.id === id ? { ...t, ...updates } : t)))
      );
      return { previousTasks };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["tasks", driverId], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) handleSupabaseError(error);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = queryClient.getQueryData<DriverTask[]>(["tasks", driverId]);

      queryClient.setQueryData(["tasks", driverId], (old: DriverTask[] = []) => old.filter(t => t.id !== id));
      return { previousTasks };
    },
    onError: (_err, _id, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["tasks", driverId], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const createTask = useCallback(
    (task: Omit<DriverTask, "id" | "createdAt" | "proofUrl">) => {
      return createMutation.mutateAsync(task);
    },
    [createMutation]
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<DriverTask>) => {
      return updateMutation.mutateAsync({ id, updates });
    },
    [updateMutation]
  );

  const deleteTask = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const updateStatus = useCallback(
    (id: string, status: TaskStatus) => {
      const extraUpdates: Partial<DriverTask> = { status };
      if (status === "in_progress") {
        extraUpdates.startedAt = new Date().toISOString();
      } else if (status === "done") {
        extraUpdates.finishedAt = new Date().toISOString();
      }
      return updateTask(id, extraUpdates);
    },
    [updateTask]
  );

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    createTask,
    updateTask,
    deleteTask,
    updateStatus,
  };
}
