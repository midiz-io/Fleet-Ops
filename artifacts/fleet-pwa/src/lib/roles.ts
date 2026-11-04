/**
 * FleetOps Role Helper Utilities
 * Robust role normalization handling casing, underscores, spaces, and plural forms.
 */

export function cleanRoleString(role?: string | null): string {
  if (!role) return "";
  return role.toLowerCase().replace(/[\s_-]+/g, "");
}

export function isHeadOfTeamsRole(role?: string | null): boolean {
  if (!role) return false;
  const clean = cleanRoleString(role);
  return (
    clean === "headofteams" ||
    clean === "headofteam" ||
    clean === "teamhead" ||
    clean === "teamleader" ||
    clean.includes("headofteam") ||
    clean.includes("teamhead") ||
    clean.includes("teamleader")
  );
}

export function isManagerRole(role?: string | null): boolean {
  if (!role) return false;
  const clean = cleanRoleString(role);
  return clean === "manager" || clean === "admin";
}

export function isSecurityRole(role?: string | null): boolean {
  if (!role) return false;
  const clean = cleanRoleString(role);
  return clean === "security";
}

export function isDriverRole(role?: string | null): boolean {
  if (!role) return false;
  const clean = cleanRoleString(role);
  return clean === "driver";
}

export function getRoleDisplayName(role?: string | null): string {
  if (isHeadOfTeamsRole(role)) return "Head of Teams";
  if (isManagerRole(role)) return "Fleet Manager";
  if (isSecurityRole(role)) return "Security Gate";
  return "Driver";
}
