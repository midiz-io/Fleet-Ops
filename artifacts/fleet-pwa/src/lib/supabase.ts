import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://mxqxmtvbahgsfrzwshdl.supabase.co";

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14cXhtdHZiYWhnc2ZyendzaGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzYyMzksImV4cCI6MjA5MzAxMjIzOX0.khGshy_3IaNbtAWTYjk4Zi9xWfHNcMFkpC1iHI-YhaM";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      vehicles: {
        Row: {
          id: string;
          vehicle_no: string;
          model: string;
          benchmark_kmpl: number;
          purchase_date: string | null;
          license_expiry: string | null;
          insurance_expiry: string | null;
          sim_gps_number: string | null;
          assigned_driver_id: string | null;
          fuel_type?: "Petrol" | "Diesel" | string | null;
          tank_size?: number | null;
          group?: "Centres" | "Tropical" | string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["vehicles"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
      };
      drivers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          pin: string;
          role: "manager" | "driver" | "security" | "team_leader" | "admin" | "head_of_teams" | string;
          license_no: string | null;
          license_expiry: string | null;
          incentive_points: number;
          dob?: string | null;
          group?: "Centres" | "Tropical" | string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["drivers"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["drivers"]["Insert"]>;
      };
      checklists: {
        Row: {
          id: string;
          driver_id: string;
          vehicle_id: string;
          date: string;
          meter_reading: number;
          meter_photo_url: string | null;
          oil_status: "ok" | "low" | "needs_change";
          tyres_ok: boolean;
          lights_ok: boolean;
          brakes_ok: boolean;
          gps_lat: number | null;
          gps_lng: number | null;
          submitted_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["checklists"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["checklists"]["Insert"]>;
      };
      fuel_logs: {
        Row: {
          id: string;
          driver_id: string;
          vehicle_id: string;
          date: string;
          liters: number;
          amount_paid: number;
          before_meter: number;
          fuel_pump_meter: number;
          after_meter: number;
          bill_meter: number | null;
          previous_odometer: number | null;
          is_full_tank: boolean;
          kmpl_calculated: number | null;
          below_benchmark: boolean;
          before_meter_photo_url: string | null;
          pump_meter_photo_url: string | null;
          meter_photo_url: string | null;
          bill_photo_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["fuel_logs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["fuel_logs"]["Insert"]>;
      };
      maintenance_schedules: {
        Row: {
          id: string;
          vehicle_id: string;
          day_of_week: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
          task: string;
          km_interval: number | null;
          next_due_km: number | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["maintenance_schedules"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["maintenance_schedules"]["Insert"]>;
      };
      repair_requests: {
        Row: {
          id: string;
          driver_id: string;
          vehicle_id: string;
          description: string;
          parts_needed: string | null;
          photo_url: string | null;
          voice_memo_url?: string | null;
          estimated_cost?: number | null;
          actual_cost?: number | null;
          status: "pending" | "approved" | "rejected";
          manager_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["repair_requests"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["repair_requests"]["Insert"]>;
      };
      cost_entries: {
        Row: {
          id: string;
          vehicle_id: string;
          category: "fuel" | "service" | "other";
          amount: number;
          description: string | null;
          date: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["cost_entries"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["cost_entries"]["Insert"]>;
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          driver_id: string | null;
          vehicle_id: string | null;
          priority: "low" | "medium" | "high";
          status: "pending" | "in_progress" | "done";
          due_date: string | null;
          start_date?: string | null;
          end_date?: string | null;
          route: string | null;
          notes: string | null;
          proof_url: string | null;
          start_time: string | null;
          end_time: string | null;
          photo_required?: boolean | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["tasks"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
      };
      settings: {
        Row: {
          key: string;
          value: any;
        };
        Insert: Database["public"]["Tables"]["settings"]["Row"];
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          timestamp: string;
          driver_id: string | null;
          driver_name: string | null;
          vehicle_id: string | null;
          vehicle_no: string | null;
          action_type: string;
          status: "success" | "warning" | "error" | "timeout" | "offline" | string;
          odometer: number | null;
          liters: number | null;
          photos_count: number | null;
          details: string | null;
          error_message: string | null;
          network_status: "online" | "slow" | "offline" | string | null;
          metadata: any | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
      };
    };
  };
};

