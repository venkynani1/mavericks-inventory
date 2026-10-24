// Role model shared by server and client code (no server-only imports here).
export type Role = "EXECUTIVE" | "MANAGER" | "AUTHORITY" | "ADMIN"

export const ROLE_LABEL: Record<Role, string> = {
  EXECUTIVE: "Executive",
  MANAGER: "Manager",
  AUTHORITY: "Management Authority",
  ADMIN: "System Administrator",
}

export const ROLE_HINT: Record<Role, string> = {
  EXECUTIVE: "Uploads stock, records distributions, submits for approval",
  MANAGER: "Reviews and approves stock transactions (level 1)",
  AUTHORITY: "Final approval authority (level 1 or 2)",
  ADMIN: "Manages users, workflow rules, masters and audit logs",
}

export type Permission =
  | "stock:write"
  | "request:create"
  | "request:approve"
  | "report:view"
  | "audit:view"
  | "admin:manage"
  | "stock:override"

const MATRIX: Record<Role, Permission[]> = {
  EXECUTIVE: ["stock:write", "request:create", "report:view"],
  MANAGER: ["request:approve", "report:view", "audit:view"],
  AUTHORITY: ["request:approve", "report:view", "audit:view"],
  ADMIN: ["admin:manage", "audit:view", "report:view", "stock:override"],
}

export function can(role: Role | undefined | null, p: Permission) {
  return !!role && MATRIX[role].includes(p)
}

/** Which roles may act at a given approval level (1-based). */
export function rolesForLevel(level: number): Role[] {
  return level <= 1 ? ["MANAGER", "AUTHORITY"] : ["AUTHORITY"]
}
