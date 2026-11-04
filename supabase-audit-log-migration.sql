-- ─── AUDIT LOGS TABLE FOR FLEETOPS ──────────────────────────────────────────
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/mxqxmtvbahgsfrzwshdl/sql

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  driver_id      UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver_name    TEXT,
  vehicle_id     UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_no     TEXT,
  action_type    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'success', -- 'success' | 'warning' | 'error' | 'timeout' | 'offline'
  odometer       NUMERIC(10,1),
  liters         NUMERIC(8,2),
  photos_count   INTEGER DEFAULT 0,
  details        TEXT,
  error_message  TEXT,
  network_status TEXT DEFAULT 'online', -- 'online' | 'slow' | 'offline'
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disable RLS for custom PIN auth compatibility
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;

-- Performance indexes for querying and filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_driver ON public.audit_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_vehicle ON public.audit_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON public.audit_logs(status);

-- Enable Supabase Realtime for audit_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
