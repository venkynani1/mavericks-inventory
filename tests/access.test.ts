import { describe, expect, it } from "vitest"
import { can, isStaff, rolesForLevel, type Role } from "@/lib/roles"
import { employeeAllowed, navFor } from "@/lib/nav"

const ROLES: Role[] = ["EXECUTIVE", "MANAGER", "AUTHORITY", "ADMIN", "EMPLOYEE"]

describe("role permissions (segregation of duties)", () => {
  it("only executives create requests; they can't approve", () => {
    expect(ROLES.filter((r) => can(r, "request:create"))).toEqual(["EXECUTIVE"])
    expect(can("EXECUTIVE", "request:approve")).toBe(false)
  })
  it("managers and the authority approve; level 2 is the authority only", () => {
    expect(ROLES.filter((r) => can(r, "request:approve"))).toEqual(["MANAGER", "AUTHORITY"])
    expect(rolesForLevel(1)).toEqual(["MANAGER", "AUTHORITY"])
    expect(rolesForLevel(2)).toEqual(["AUTHORITY"])
  })
  it("only admins change points rules or adjust points; executives record attendance", () => {
    expect(ROLES.filter((r) => can(r, "rewards:configure"))).toEqual(["ADMIN"])
    expect(ROLES.filter((r) => can(r, "rewards:operate"))).toEqual(["EXECUTIVE"])
  })
  it("employees only have their own portal", () => {
    expect(isStaff("EMPLOYEE")).toBe(false)
    for (const p of ["inventory:view", "rewards:view", "report:view", "audit:view"] as const) expect(can("EMPLOYEE", p)).toBe(false)
    expect(can("EMPLOYEE", "portal:self")).toBe(true)
  })
})

describe("navigation", () => {
  it("employees see only their portal pages", () => {
    const hrefs = navFor("EMPLOYEE").flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs.every((h) => h.startsWith("/me"))).toBe(true)
    expect(employeeAllowed("/me/goodies")).toBe(true)
    expect(employeeAllowed("/profile")).toBe(true)
    expect(employeeAllowed("/stock")).toBe(false)
    expect(employeeAllowed("/media")).toBe(false)
  })
  it("approvals appear only for approvers, administration only for admins and auditors", () => {
    const has = (r: Role, href: string) => navFor(r).some((g) => g.items.some((i) => i.href === href))
    expect(has("MANAGER", "/approvals")).toBe(true)
    expect(has("EXECUTIVE", "/approvals")).toBe(false)
    expect(has("ADMIN", "/admin/rewards")).toBe(true)
    expect(has("MANAGER", "/admin/rewards")).toBe(false)
    expect(has("MANAGER", "/admin/audit")).toBe(true)
  })
})
