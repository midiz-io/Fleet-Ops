# FleetOps — Fleet Vehicle Maintenance PWA

A mobile-first dark-theme Progressive Web App for managing a vehicle fleet with two roles: Fleet Manager and Driver.

## Run & Operate

- `pnpm --filter @workspace/fleet-pwa run dev` — run the PWA dev server (port configured via workflow)
- `pnpm --filter @workspace/fleet-pwa run typecheck` — typecheck the app
- Run `supabase-schema.sql` in your Supabase SQL editor to create tables + seed data

## Stack

- React 18 + Vite + TypeScript
- Supabase (PostgreSQL + Storage — no Express API server, direct Supabase client)
- TanStack Query (server state, caching, mutations)
- Tailwind CSS v4 + shadcn/ui (dark mode forced via `document.documentElement.classList.add("dark")`)
- Recharts (cost dashboard bar chart)
- Wouter (routing)
- date-fns (date formatting, expiry calculations)
- PWA manifest at `artifacts/fleet-pwa/public/manifest.json`

## Where things live

- `artifacts/fleet-pwa/src/` — all source
  - `contexts/AuthContext.tsx` — phone+PIN auth, stores session in localStorage as `fleet_user`
  - `lib/supabase.ts` — Supabase client + full `Database` type definition
  - `hooks/` — TanStack Query hooks: use-vehicles, use-drivers, use-checklists, use-fuel, use-repairs, use-schedule, use-costs
  - `pages/` — all 10 pages (see Routes below)
  - `components/layout.tsx` — sidebar (desktop) + bottom nav (mobile)
- `supabase-schema.sql` — full schema + seed data (run in Supabase SQL editor)

## Routes

| Path | Page | Role |
|------|------|------|
| `/login` | Login (phone + PIN) | all |
| `/` | Driver Dashboard | driver |
| `/checklist` | Daily Checklist (camera + GPS) | driver |
| `/fuel` | Fuel Log + KMPL calc | driver |
| `/repairs` | Repair Request submission | driver |
| `/manager` | Manager Dashboard | manager |
| `/vehicles` | Vehicle Profiles CRUD | manager |
| `/drivers` | Driver Profiles CRUD | manager |
| `/schedule` | Weekly Maintenance Schedule | manager |
| `/repairs-manager` | Repair Approval Workflow | manager |
| `/costs` | Cost Dashboard + Recharts | manager |

## Architecture decisions

- **No backend API server** — Supabase client used directly from the React frontend via TanStack Query hooks
- **Custom PIN auth** — not Supabase Auth; login queries `drivers` table by phone+PIN, stores user in localStorage
- **Role-based routing** — managers redirect to `/manager`, drivers stay at `/`; `ProtectedRoute` wrapper enforces roles
- **KMPL calculated client-side** — compares odometer delta against previous fuel entry, flags below-benchmark entries
- **Document expiry alerts** — computed in real time from Supabase data, not stored separately

## Supabase Setup

Required tables (see `supabase-schema.sql`):
- `drivers`, `vehicles`, `checklists`, `fuel_logs`, `maintenance_schedules`, `repair_requests`, `cost_entries`

Required storage buckets (both public):
- `checklist-photos`
- `repair-photos`

Environment variables (set in Replit secrets):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## User preferences

- Dark industrial amber theme — amber/orange primary (#f97316), dark navy background (#0b0f1a)
- Mobile-first — bottom navigation on mobile, sidebar on desktop
- No Express/API server — pure Supabase client
