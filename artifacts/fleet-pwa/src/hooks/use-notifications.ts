import { useMemo } from "react";
import { useRepairs } from "./use-repairs";
import { useVehicles } from "./use-vehicles";
import { useFuelLogs } from "./use-fuel";
import { differenceInDays, parseISO } from "date-fns";
import { handleSupabaseError } from "@/lib/error-handler";

export type AppAlert = {
  id: string;
  type: "repair" | "expiry" | "kmpl" | "info";
  title: string;
  body: string;
  severity: "high" | "medium" | "low";
  createdAt: string;
};

export function useNotifications() {
  const { data: repairs } = useRepairs();
  const { data: vehicles } = useVehicles();
  const { data: fuelLogs } = useFuelLogs();

  const alerts = useMemo<AppAlert[]>(() => {
    const out: AppAlert[] = [];
    const today = new Date();

    // Pending repairs
    repairs?.filter(r => r.status === "pending").forEach(r => {
      out.push({
        id: `repair-${r.id}`,
        type: "repair",
        title: "Repair Request Pending",
        body: r.description.slice(0, 80),
        severity: "high",
        createdAt: r.created_at,
      });
    });

    // Document expiry
    vehicles?.forEach(v => {
      if (v.license_expiry) {
        const d = differenceInDays(parseISO(v.license_expiry), today);
        if (d < 60) {
          out.push({
            id: `lic-${v.id}`,
            type: "expiry",
            title: `${v.vehicle_no} — License Expiring`,
            body: d < 0 ? `Expired ${Math.abs(d)} days ago!` : `Expires in ${d} days`,
            severity: d < 0 ? "high" : d < 30 ? "high" : "medium",
            createdAt: v.created_at,
          });
        }
      }
      if (v.insurance_expiry) {
        const d = differenceInDays(parseISO(v.insurance_expiry), today);
        if (d < 60) {
          out.push({
            id: `ins-${v.id}`,
            type: "expiry",
            title: `${v.vehicle_no} — Insurance Expiring`,
            body: d < 0 ? `Expired ${Math.abs(d)} days ago!` : `Expires in ${d} days`,
            severity: d < 0 ? "high" : d < 30 ? "high" : "medium",
            createdAt: v.created_at,
          });
        }
      }
    });

    // KMPL alerts
    fuelLogs?.filter(f => f.below_benchmark).forEach(f => {
      out.push({
        id: `kmpl-${f.id}`,
        type: "kmpl",
        title: "KMPL Below Benchmark",
        body: `${f.kmpl_calculated} km/L logged — below target`,
        severity: "medium",
        createdAt: f.created_at,
      });
    });

    // Sort: high first
    return out.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [repairs, vehicles, fuelLogs]);

  return alerts;
}
