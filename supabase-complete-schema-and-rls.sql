-- ==============================================================================
-- FleetOps PWA — 100% COMPLETE SUPABASE SCHEMA & RLS POLICIES (PRODUCTION BACKUP)
-- Generated for: Complete User Profile Data, Vehicles, Fleet Operations & RLS
-- Date: November 2026
-- 
-- INSTRUCTIONS:
-- 1. Create a new Supabase project (or open existing project SQL Editor).
-- 2. Paste this entire script into the SQL Editor and click "Run".
-- 3. This script is 100% IDEMPOTENT (safe to run multiple times without data loss).
-- ==============================================================================

-- ─── 1. EXTENSIONS ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 2. DRIVERS TABLE (User Profiles, Authentication & Roles) ─────────────────
CREATE TABLE IF NOT EXISTS public.drivers (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL UNIQUE,
  pin              TEXT NOT NULL,                      -- 4-digit PIN for Driver/Staff login
  role             TEXT NOT NULL DEFAULT 'driver',     -- 'driver' | 'manager' | 'admin' | 'team_leader' | 'head_of_teams' | 'team_head' | 'security'
  "group"          TEXT NOT NULL DEFAULT 'Centres',    -- 'Centres' | 'Tropical'
  dob              DATE,
  license_no       TEXT,
  license_expiry   DATE,
  incentive_points INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist in drivers
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS "group" TEXT NOT NULL DEFAULT 'Centres';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS license_no TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS incentive_points INTEGER NOT NULL DEFAULT 0;

-- Remove any old/restrictive check constraints on drivers.role dynamically
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.drivers'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%role%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Role check constraint
ALTER TABLE public.drivers ADD CONSTRAINT drivers_role_check 
  CHECK (role IN ('driver', 'manager', 'admin', 'team_leader', 'head_of_teams', 'team_head', 'security'));

-- Remove and re-apply drivers.group check constraint dynamically
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.drivers'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%group%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.drivers ADD CONSTRAINT drivers_group_check 
  CHECK ("group" IN ('Centres', 'Tropical'));

-- ─── 3. VEHICLES TABLE (Fleet Vehicles & Specifications) ──────────────────────
CREATE TABLE IF NOT EXISTS public.vehicles (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_no              TEXT NOT NULL UNIQUE,             -- e.g. DAI 0632, GAI 1005
  model                   TEXT NOT NULL,                   -- e.g. Bolero, Mahindra Pickup
  benchmark_kmpl          NUMERIC(5,2) NOT NULL DEFAULT 14.0,
  fuel_type               TEXT DEFAULT 'Diesel',            -- 'Diesel' | 'Petrol'
  tank_size               NUMERIC(8,2) DEFAULT 55.0,
  "group"                 TEXT NOT NULL DEFAULT 'Centres',  -- 'Centres' | 'Tropical'
  current_odometer        NUMERIC(10,1) DEFAULT 0,
  current_km              NUMERIC(10,1) DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'active',
  is_hidden               BOOLEAN NOT NULL DEFAULT false,
  purchase_date           DATE,
  license_expiry          DATE,
  insurance_expiry        DATE,
  sim_gps_number          TEXT,
  assigned_driver_id      UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  odometer_override_km    NUMERIC(10,1),
  odometer_override_at    TIMESTAMPTZ,
  odometer_override_by    TEXT,
  odometer_override_reason TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist in vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'Diesel';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS tank_size NUMERIC(8,2) DEFAULT 55.0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS "group" TEXT NOT NULL DEFAULT 'Centres';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS current_odometer NUMERIC(10,1) DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS current_km NUMERIC(10,1) DEFAULT 0;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer_override_km NUMERIC(10,1);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer_override_at TIMESTAMPTZ;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer_override_by TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS odometer_override_reason TEXT;

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.vehicles'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%group%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_group_check 
  CHECK ("group" IN ('Centres', 'Tropical'));

-- ─── 4. CHECKLISTS (Morning Inspection & Shift End Records) ───────────────────
CREATE TABLE IF NOT EXISTS public.checklists (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id         UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id        UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  meter_reading     NUMERIC(10,1) NOT NULL,
  meter_photo_url   TEXT,
  oil_status        TEXT NOT NULL DEFAULT 'ok',
  fuel_bars         INTEGER,
  end_day_odometer  NUMERIC(10,1),
  shift_end_time    TIMESTAMPTZ,
  tyres_ok          BOOLEAN NOT NULL DEFAULT true,
  lights_ok         BOOLEAN NOT NULL DEFAULT true,
  brakes_ok         BOOLEAN NOT NULL DEFAULT true,
  gps_lat           NUMERIC(10,6),
  gps_lng           NUMERIC(10,6),
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS fuel_bars INTEGER;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS end_day_odometer NUMERIC(10,1);
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS shift_end_time TIMESTAMPTZ;

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.checklists'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%oil_status%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.checklists ADD CONSTRAINT checklists_oil_status_check 
  CHECK (oil_status IN ('ok', 'low', 'needs_change', 'completed_end_day'));

-- Relax unique constraint to permit multiple vehicle shifts per day
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_driver_id_vehicle_id_date_key;

-- ─── 5. FUEL LOGS (Refueling Records, Receipts & KMPL Efficiency) ─────────────
CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id              UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id             UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date                   DATE NOT NULL DEFAULT CURRENT_DATE,
  time                   TEXT,
  liters                 NUMERIC(8,2) NOT NULL,
  amount_paid            NUMERIC(10,2) NOT NULL,
  before_meter           NUMERIC(10,1) NOT NULL DEFAULT 0,
  fuel_pump_meter        NUMERIC(10,2) NOT NULL DEFAULT 0,
  after_meter            NUMERIC(10,1) NOT NULL DEFAULT 0,
  bill_meter             NUMERIC(10,1),
  previous_odometer      NUMERIC(10,1),
  is_full_tank           BOOLEAN NOT NULL DEFAULT false,
  kmpl_calculated        NUMERIC(6,2),
  below_benchmark        BOOLEAN NOT NULL DEFAULT false,
  fuel_type              TEXT DEFAULT 'Diesel',
  unit_price             NUMERIC(10,2),
  before_meter_photo_url TEXT,
  pump_meter_photo_url   TEXT,
  meter_photo_url        TEXT,
  bill_photo_url         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS before_meter NUMERIC(10,1) DEFAULT 0;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS fuel_pump_meter NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS after_meter NUMERIC(10,1) DEFAULT 0;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS bill_meter NUMERIC(10,1);
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS previous_odometer NUMERIC(10,1);
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'Diesel';
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS before_meter_photo_url TEXT;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS pump_meter_photo_url TEXT;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS meter_photo_url TEXT;
ALTER TABLE public.fuel_logs ADD COLUMN IF NOT EXISTS bill_photo_url TEXT;

-- ─── 6. TASKS TABLE (Daily Routes, Assignments & Deliveries) ──────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  driver_id      UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id     UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  priority       TEXT NOT NULL DEFAULT 'medium',
  status         TEXT NOT NULL DEFAULT 'pending',
  due_date       TEXT,
  start_date     TEXT,
  end_date       TEXT,
  start_time     TEXT,
  end_time       TEXT,
  route          TEXT,
  notes          TEXT,
  proof_url      TEXT,
  photo_required BOOLEAN DEFAULT false,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS photo_required BOOLEAN DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.tasks'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%status%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled', 'unfinished'));

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.tasks'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%priority%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check 
  CHECK (priority IN ('low', 'medium', 'high'));

-- ─── 7. REPAIR REQUESTS TABLE (Driver Defect Reports & Approvals) ─────────────
CREATE TABLE IF NOT EXISTS public.repair_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id       UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id      UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  parts_needed    TEXT,
  photo_url       TEXT,
  voice_memo_url  TEXT,                               -- Up to 60s voice message
  audio_url       TEXT,
  audio_duration  INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',
  manager_notes   TEXT,
  estimated_cost  NUMERIC(12,2),
  actual_cost     NUMERIC(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.repair_requests ADD COLUMN IF NOT EXISTS voice_memo_url TEXT;
ALTER TABLE public.repair_requests ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.repair_requests ADD COLUMN IF NOT EXISTS audio_duration INTEGER;
ALTER TABLE public.repair_requests ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2);
ALTER TABLE public.repair_requests ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(12,2);

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.repair_requests'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) LIKE '%status%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.repair_requests DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.repair_requests ADD CONSTRAINT repair_requests_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS repair_requests_updated_at ON public.repair_requests;
CREATE TRIGGER repair_requests_updated_at
  BEFORE UPDATE ON public.repair_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 8. TRIP REQUESTS TABLE (Team Leader / Field Dispatch Portal) ─────────────
CREATE TABLE IF NOT EXISTS public.trip_requests (
  id                   TEXT PRIMARY KEY,
  "from"               TEXT NOT NULL,
  "to"                 TEXT NOT NULL,
  "when"               TEXT NOT NULL,
  what                 TEXT NOT NULL,
  urgent               BOOLEAN DEFAULT false,
  photo_url            TEXT,
  requester_id         TEXT,
  requester_name       TEXT,
  status               TEXT NOT NULL DEFAULT 'waiting', -- 'waiting' | 'assigned' | 'rejected'
  assigned_driver_id   TEXT,
  assigned_driver_name TEXT,
  assigned_vehicle_id  TEXT,
  assigned_vehicle_no  TEXT,
  task_id              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 9. MAINTENANCE SCHEDULES & SERVICE CYCLES ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id   UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  day_of_week  TEXT NOT NULL
                 CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
  task         TEXT NOT NULL,
  km_interval  INTEGER,
  next_due_km  NUMERIC(10,1),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 10. COST ENTRIES TABLE (Fleet Operating Expenses) ────────────────────────
CREATE TABLE IF NOT EXISTS public.cost_entries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id  UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('fuel', 'service', 'other')),
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 11. AUDIT LOGS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  driver_id      UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver_name    TEXT,
  vehicle_id     UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_no     TEXT,
  action_type    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'success',
  odometer       NUMERIC(10,1),
  liters         NUMERIC(8,2),
  photos_count   INTEGER DEFAULT 0,
  details        TEXT,
  error_message  TEXT,
  network_status TEXT DEFAULT 'online',
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 12. SETTINGS TABLE (Key-Value Configuration Store) ────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ─── 13. PUSH NOTIFICATION SUBSCRIPTIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_name       TEXT,
  endpoint          TEXT NOT NULL UNIQUE,
  p256dh            TEXT,
  auth              TEXT,
  subscription_json JSONB,
  created_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 14. STORAGE BUCKETS SETUP ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('checklist-photos', 'checklist-photos', true),
  ('repair-photos', 'repair-photos', true),
  ('fuel-photos', 'fuel-photos', true),
  ('voice-notes', 'voice-notes', true),
  ('task-proofs', 'task-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ─── 15. PERFORMANCE INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON public.drivers(phone);
CREATE INDEX IF NOT EXISTS idx_drivers_role ON public.drivers(role);
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_no ON public.vehicles(vehicle_no);
CREATE INDEX IF NOT EXISTS idx_checklists_date ON public.checklists(date DESC);
CREATE INDEX IF NOT EXISTS idx_checklists_driver ON public.checklists(driver_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle ON public.fuel_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_driver ON public.fuel_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_date ON public.fuel_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_driver ON public.tasks(driver_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_repair_requests_vehicle ON public.repair_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON public.push_subscriptions(endpoint);

-- ─── 16. REALTIME PUBLICATION ─────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.checklists; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.fuel_logs; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_requests; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_requests; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.settings; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ==============================================================================
-- ─── 17. ROW LEVEL SECURITY (RLS) POLICIES — 100% COMPLETE & PERMISSIVE ────────
-- ==============================================================================
ALTER TABLE public.drivers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions      ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "fleetops_drivers_all" ON public.drivers;
DROP POLICY IF EXISTS "fleetops_vehicles_all" ON public.vehicles;
DROP POLICY IF EXISTS "fleetops_checklists_all" ON public.checklists;
DROP POLICY IF EXISTS "fleetops_fuel_logs_all" ON public.fuel_logs;
DROP POLICY IF EXISTS "fleetops_tasks_all" ON public.tasks;
DROP POLICY IF EXISTS "fleetops_repair_requests_all" ON public.repair_requests;
DROP POLICY IF EXISTS "fleetops_trip_requests_all" ON public.trip_requests;
DROP POLICY IF EXISTS "fleetops_maintenance_all" ON public.maintenance_schedules;
DROP POLICY IF EXISTS "fleetops_cost_entries_all" ON public.cost_entries;
DROP POLICY IF EXISTS "fleetops_audit_logs_all" ON public.audit_logs;
DROP POLICY IF EXISTS "fleetops_settings_all" ON public.settings;
DROP POLICY IF EXISTS "fleetops_push_subs_all" ON public.push_subscriptions;

-- Create full CRUD policies for anon and authenticated users
CREATE POLICY "fleetops_drivers_all" ON public.drivers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_vehicles_all" ON public.vehicles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_checklists_all" ON public.checklists FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_fuel_logs_all" ON public.fuel_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_tasks_all" ON public.tasks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_repair_requests_all" ON public.repair_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_trip_requests_all" ON public.trip_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_maintenance_all" ON public.maintenance_schedules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_cost_entries_all" ON public.cost_entries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_audit_logs_all" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_settings_all" ON public.settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fleetops_push_subs_all" ON public.push_subscriptions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Storage Object Policies (Photo Uploads, Receipts, Audio Memos)
DROP POLICY IF EXISTS "fleetops_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "fleetops_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "fleetops_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "fleetops_storage_delete" ON storage.objects;

CREATE POLICY "fleetops_storage_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('checklist-photos', 'repair-photos', 'fuel-photos', 'voice-notes', 'task-proofs'));

CREATE POLICY "fleetops_storage_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id IN ('checklist-photos', 'repair-photos', 'fuel-photos', 'voice-notes', 'task-proofs'));

CREATE POLICY "fleetops_storage_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id IN ('checklist-photos', 'repair-photos', 'fuel-photos', 'voice-notes', 'task-proofs'))
  WITH CHECK (bucket_id IN ('checklist-photos', 'repair-photos', 'fuel-photos', 'voice-notes', 'task-proofs'));

CREATE POLICY "fleetops_storage_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id IN ('checklist-photos', 'repair-photos', 'fuel-photos', 'voice-notes', 'task-proofs'));

-- ─── 18. DEFAULT CONFIGURATION & SEED DATA ────────────────────────────────────
INSERT INTO public.settings (key, value)
VALUES 
  ('fuel_price', '382'),
  ('evening_fuel_alert_group', '"Tropical"'),
  ('trip_requests', '[]'::jsonb),
  ('shift_options', '["6:00 AM - 3:00 PM", "8:00 AM - 5:00 PM", "10:00 AM - 7:00 PM", "1:00 PM - 10:00 PM", "2:00 PM - 11:00 PM", "8:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "5:00 PM", "7:00 PM", "10:00 PM", "11:00 PM", "Leave"]'::jsonb),
  ('end_day_records', '[]'::jsonb),
  ('driver_overtime', '[]'::jsonb),
  ('vehicle_washes', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed core Administrative and Operational user profiles
INSERT INTO public.drivers (name, phone, pin, role, "group", license_no, license_expiry)
VALUES
  ('Admin Office', '0770000000', '9999', 'admin', 'Tropical', 'A1000001', '2030-12-31'),
  ('Fleet Manager', '0771234567', '1234', 'manager', 'Tropical', 'M1000001', '2028-12-31'),
  ('Head of Teams', '0770000002', '1234', 'head_of_teams', 'Tropical', 'H1000001', '2028-12-31'),
  ('Security Gate', '0770000003', '1234', 'security', 'Tropical', 'S1000001', '2028-12-31')
ON CONFLICT (phone) DO UPDATE 
SET role = EXCLUDED.role, "group" = EXCLUDED."group";

-- Seed all real Fleet Vehicles (Tropical & Centres)
INSERT INTO public.vehicles (vehicle_no, model, benchmark_kmpl, fuel_type, tank_size, "group")
VALUES
  ('DAI 0632', 'Bolero', 12.0, 'Diesel', 55.0, 'Tropical'),
  ('DAI 1699', 'Bolero', 12.0, 'Diesel', 55.0, 'Tropical'),
  ('DAI 0185', 'Mahindra Bolero', 11.5, 'Diesel', 55.0, 'Tropical'),
  ('DAI 1005', 'Bolero', 11.8, 'Diesel', 55.0, 'Tropical'),
  ('DAI 1007', 'Bolero', 12.2, 'Diesel', 55.0, 'Tropical'),
  ('BIC 6942', 'Dio', 45.0, 'Petrol', 5.3, 'Centres'),
  ('GAI 1005', 'Bolero', 14.0, 'Diesel', 55.0, 'Centres')
ON CONFLICT (vehicle_no) DO UPDATE 
SET model = EXCLUDED.model, 
    fuel_type = EXCLUDED.fuel_type, 
    tank_size = EXCLUDED.tank_size, 
    "group" = EXCLUDED."group";

-- ==============================================================================
-- BACKUP COMPLETE: All tables, columns, indexes, storage buckets, RLS policies, 
-- and core seed records are 100% configured and ready.
-- ==============================================================================
