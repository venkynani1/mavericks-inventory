// Role model shared by server and client code (no server-only imports here).
export type Role = "EXECUTIVE" | "MANAGER" | "AUTHORITY" | "ADMIN" | "EMPLOYEE"

export const ROLE_LABEL: Record<Role, string> = {
  EXECUTIVE: "Executive",
  MANAGER: "Manager",
  AUTHORITY: "Management Authority",
  ADMIN: "System Administrator",
  EMPLOYEE: "Employee",
}

export const ROLE_HINT: Record<Role, string> = {
  EXECUTIVE: "Manages stock, distributions, events and attendance; submits for approval",
  MANAGER: "Reviews and approves stock transactions (level 1)",
  AUTHORITY: "Final approval authority (level 1 or 2)",
  ADMIN: "Manages users, approval and reward rules, masters and audit logs",
  EMPLOYEE: "Sees their own points, rewards, goodies received and events",
}

export type Permission =
  | "stock:write" // add items, uploads
  | "request:create" // distributions, stock inward, stock counts
  | "request:approve"
  | "report:view"
  | "audit:view"
  | "admin:manage"
  | "stock:override"
  | "inventory:view" // stock, movements, requests
  | "rewards:view" // employees, events, leaderboard, rewards worklist
  | "rewards:operate" // events, attendance, reward fulfilment
  | "rewards:configure" // points per event type, milestones, adjust and reset points
  | "portal:self" // own points and goodies

const MATRIX: Record<Role, Permission[]> = {
  EXECUTIVE: ["stock:write", "request:create", "report:view", "inventory:view", "rewards:view", "rewards:operate"],
  MANAGER: ["request:approve", "report:view", "audit:view", "inventory:view", "rewards:view"],
  AUTHORITY: ["request:approve", "report:view", "audit:view", "inventory:view", "rewards:view"],
  ADMIN: ["admin:manage", "audit:view", "report:view", "stock:override", "inventory:view", "rewards:view", "rewards:configure"],
  EMPLOYEE: ["portal:self"],
}

export function can(role: Role | undefined | null, p: Permission) {
  return !!role && MATRIX[role].includes(p)
}

export const isStaff = (role: Role | undefined | null) => !!role && role !== "EMPLOYEE"

/** Which roles may act at a given approval level (1-based). */
export function rolesForLevel(level: number): Role[] {
  return level <= 1 ? ["MANAGER", "AUTHORITY"] : ["AUTHORITY"]
}
