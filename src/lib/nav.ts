// Navigation map, grouped the way people think about the work. Shared by the side navigation,
// the command palette and the breadcrumb, so labels never drift apart.
import { can, type Role } from "@/lib/roles"

export type NavIcon =
  | "home" | "items" | "movements" | "count" | "inward" | "distribution" | "requests" | "approvals"
  | "events" | "employees" | "leaderboard" | "rewards" | "reports" | "users" | "rules" | "rewardRules"
  | "masters" | "audit" | "system" | "me" | "assistant" | "prizes"

export type NavItem = { href: string; label: string; icon: NavIcon; badge?: "approvals" | "mine" | "rewardsDue" | "prizesDue"; exact?: boolean }
export type NavGroup = { label: string; items: NavItem[] }

export function navFor(role: Role): NavGroup[] {
  if (role === "EMPLOYEE")
    return [
      {
        label: "My space",
        items: [
          { href: "/me", label: "My dashboard", icon: "me", exact: true },
          { href: "/me/history", label: "Points history", icon: "movements" },
          { href: "/me/goodies", label: "Goodies received", icon: "rewards" },
          { href: "/me/events", label: "Events", icon: "events" },
        ],
      },
    ]
  const exec = role === "EXECUTIVE"
  const groups: NavGroup[] = [
    { label: "", items: [{ href: "/", label: "Home", icon: "home", exact: true }] },
    {
      label: "Inventory",
      items: [
        { href: "/stock", label: "Items", icon: "items" },
        { href: "/movements", label: "Stock movements", icon: "movements" },
        { href: "/receipts", label: "Stock inward", icon: "inward" },
        { href: "/counts", label: "Stock counts", icon: "count" },
      ],
    },
    {
      label: "Fulfilment",
      items: [
        { href: "/distributions", label: "Distributions", icon: "distribution" },
        { href: "/requests", label: exec ? "My requests" : "All requests", icon: "requests", badge: exec ? "mine" : undefined },
        ...(can(role, "request:approve") ? [{ href: "/approvals", label: "Approvals", icon: "approvals" as const, badge: "approvals" as const }] : []),
      ],
    },
    {
      label: "Engagement",
      items: [
        { href: "/events", label: "Events", icon: "events" },
        { href: "/employees", label: "Employees and points", icon: "employees" },
        { href: "/rewards", label: "Milestone rewards", icon: "rewards", badge: exec ? "rewardsDue" : undefined },
        { href: "/prizes", label: "Event prizes", icon: "prizes", badge: exec ? "prizesDue" : undefined },
        { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
      ],
    },
  ]
  if (can(role, "report:view")) groups.push({ label: "Analytics", items: [{ href: "/reports", label: "Reports", icon: "reports" }] })
  const admin: NavItem[] = []
  if (role === "ADMIN")
    admin.push(
      { href: "/admin/users", label: "Users and roles", icon: "users" },
      { href: "/admin/workflow", label: "Approval rules", icon: "rules" },
      { href: "/admin/rewards", label: "Points and rewards rules", icon: "rewardRules" },
      { href: "/admin/masters", label: "Master data", icon: "masters" },
    )
  if (can(role, "audit:view")) admin.push({ href: "/admin/audit", label: "Audit log", icon: "audit" })
  if (role === "ADMIN") admin.push({ href: "/admin/system", label: "System status", icon: "system" })
  if (admin.length) groups.push({ label: "Administration", items: admin })
  return groups
}

/** Paths an employee (portal-only) account may open. */
export const EMPLOYEE_PATHS = ["/me", "/profile"]
export const employeeAllowed = (path: string) => EMPLOYEE_PATHS.some((p) => path === p || path.startsWith(p + "/"))

export function findNav(role: Role, path: string) {
  for (const g of navFor(role)) for (const i of g.items) if (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/")) return { group: g.label, item: i }
  return null
}
