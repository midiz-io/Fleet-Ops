import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { triggerTaskRing, registerPushSubscription } from "@/lib/web-push-manager";
import { useToast } from "@/hooks/use-toast";
import { isDriverRole } from "@/lib/roles";

export function GlobalTaskNotificationListener() {
  const { user } = useAuth();
  const { toast } = useToast();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!user || !isDriverRole(user.role)) return;

    // Register push subscription if permissions are already granted
    if (!registeredRef.current && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      registerPushSubscription(user.id, user.name);
      registeredRef.current = true;
    }

    // Subscribe to real-time task table events for this driver
    const channel = supabase
      .channel(`driver-tasks-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
        },
        (payload) => {
          const newTask = payload.new as any;
          if (newTask && newTask.driver_id === user.id) {
            const timeStr = newTask.start_time || newTask.due_date || "Today";
            const routeStr = newTask.route ? ` • ${newTask.route}` : "";
            const body = `${timeStr}${routeStr}`;
            
            triggerTaskRing(`New Task: ${newTask.title}`, body, "/");
            toast({
              title: `🔔 New Task: ${newTask.title}`,
              description: body,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
        },
        (payload) => {
          const updatedTask = payload.new as any;
          const oldTask = payload.old as any;

          if (updatedTask && updatedTask.driver_id === user.id) {
            // Check if task status transitioned to cancelled
            if (updatedTask.status === "cancelled" && oldTask?.status !== "cancelled") {
              triggerTaskRing(`Task Cancelled: ${updatedTask.title}`, "This task has been cancelled by the manager.", "/");
              toast({
                title: `Task Cancelled: ${updatedTask.title}`,
                description: "Manager has cancelled this assignment",
                variant: "destructive",
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  return null;
}
