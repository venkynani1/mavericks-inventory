import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUser } from "@/lib/server/session"
import { Brand } from "@/components/app/brand"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

const DEMO = [
  { email: "executive@mavericks.demo", role: "Executive", does: "records distributions" },
  { email: "manager@mavericks.demo", role: "Manager", does: "approves level 1" },
  { email: "authority@mavericks.demo", role: "Management Authority", does: "approves level 2" },
  { email: "admin@mavericks.demo", role: "Administrator", does: "users and rules" },
]

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getUser()) redirect("/")
  const { next } = await searchParams
  const demo = process.env.DEMO_MODE === "true"
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Brand inverted />
        <ShelfIllustration />
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-[1.1] font-semibold">Every T-shirt, kit and smart watch, accounted for.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Record handovers in bulk or one at a time. Nothing leaves the shelf until a manager approves it, and every movement stays on the ledger.
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <Brand className="lg:hidden" />
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use the email your administrator set up for you.</p>
          </div>
          <LoginForm next={next ?? "/"} demo={demo ? DEMO : []} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Access is limited to authorised Hexaware staff. Every sign-in and change is recorded in the audit log.
          </p>
        </div>
      </section>
    </main>
  )
}

/** Shelving unit drawn in boxes: the three tiers echo stock in hand, in review and handed out. */
function ShelfIllustration() {
  const rows = [
    [3, 2, 4, 1, 3],
    [2, 4, 1, 3, 2, 2],
    [4, 1, 3, 2, 3],
  ]
  return (
    <div aria-hidden className="relative my-10 flex flex-col gap-5">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-0">
          <div className="flex items-end gap-2 px-3">
            {r.map((h, j) => (
              <div
                key={j}
                className="rounded-[3px] border border-white/15"
                style={{
                  width: 34 + ((i + j) % 3) * 14,
                  height: 18 + h * 12,
                  background: i === 1 && j === 2 ? "#e4ad4c" : i === 0 && j % 2 === 0 ? "#5b8fd9" : "rgba(255,255,255,0.08)",
                }}
              />
            ))}
          </div>
          <div className="h-1.5 rounded-full bg-white/20" />
        </div>
      ))}
    </div>
  )
}
