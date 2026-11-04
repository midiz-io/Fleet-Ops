/**
 * Audit Logger (Feature Disabled / Removed)
 * No-op implementation to maintain API compatibility without persisting or transmitting any audit data.
 */

export type AuditActionType = string;
export type AuditStatus = "success" | "warning" | "error" | "timeout" | "offline" | string;

export interface AuditLogEntry {
  id?: string;
  timestamp?: string;
  driver_id?: string | null;
  driver_name?: string | null;
  vehicle_id?: string | null;
  vehicle_no?: string | null;
  action_type?: string;
  status?: string;
  odometer?: number | null;
  liters?: number | null;
  photos_count?: number | null;
  details?: string | null;
  error_message?: string | null;
  network_status?: string;
  metadata?: Record<string, any> | null;
  created_at?: string;
  _synced?: boolean;
}

export function normalizeAuditVehicleNo(raw?: string | null): string {
  return raw || "";
}

export function normalizeAuditText(raw?: string | null): string | null {
  return raw || null;
}

export function getLocalAuditLogs(): AuditLogEntry[] {
  return [];
}

export async function logAuditEvent(_entry?: any): Promise<void> {
  // Audit log feature completely disabled
  return Promise.resolve();
}

export async function syncOfflineAuditLogs(): Promise<void> {
  return Promise.resolve();
}
