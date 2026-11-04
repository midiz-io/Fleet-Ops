import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export type GateStatus = "cleared" | "pending" | "stopped" | "inactive";

export interface GateClearanceRecord {
  vehicle_id: string;
  status: GateStatus;
  notes?: string;
  updated_at: string;
  cleared_by?: string;
}

export function useGateClearance() {
  const [clearances, setClearances] = useState<Record<string, GateClearanceRecord>>(() => {
    try {
      const saved = localStorage.getItem("fleetops_gate_clearances");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    // Fetch settings from supabase if available
    const fetchClearances = async () => {
      try {
        const { data } = await supabase
          .from("settings")
          .select("*")
          .eq("key", "gate_clearances")
          .single();
        if (data && data.value) {
          setClearances(data.value);
          localStorage.setItem("fleetops_gate_clearances", JSON.stringify(data.value));
        }
      } catch (e) {
        // Fallback to local storage
      }
    };
    fetchClearances();
  }, []);

  const updateGateStatus = async (vehicleId: string, status: GateStatus, clearedBy?: string, notes?: string) => {
    const updated = {
      ...clearances,
      [vehicleId]: {
        vehicle_id: vehicleId,
        status,
        notes,
        cleared_by: clearedBy || "Security",
        updated_at: new Date().toISOString(),
      },
    };
    setClearances(updated);
    localStorage.setItem("fleetops_gate_clearances", JSON.stringify(updated));

    try {
      await supabase.from("settings").upsert({
        key: "gate_clearances",
        value: updated,
      });
    } catch (e) {
      console.error("Failed to sync gate clearance to Supabase", e);
    }
  };

  const getVehicleGateStatus = (vehicleId: string): GateStatus => {
    return clearances[vehicleId]?.status || "pending";
  };

  return {
    clearances,
    updateGateStatus,
    getVehicleGateStatus,
  };
}
