import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUser } from "@/lib/server/session"
import { prisma } from "@/lib/db"
import { SSO_ERROR_TEXT, ssoConfig } from "@/lib/server/sso"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Brand } from "@/components/app/brand"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

const DEMO = [
  { email: "executive@mavericks.demo", role: "Executive", does: "records distributions" },
  { email: "manager@mavericks.demo", role: "Manager", does: "approves level 1" },
  { email: "authority@mavericks.demo", role: "Management Authority", does: "approves level 2" },
  { email: "admin@mavericks.demo", role: "Administrator", does: "users and rules" },
]

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; sso_error?: string; local?: string }> }) {
  if (await getUser()) redirect("/")
  const { next, sso_error, local } = await searchParams
  const demo = process.env.DEMO_MODE === "true"
  const sso = ssoConfig()
  // A brand-new database has no accounts; say so instead of letting every sign-in fail silently.
  const noAccounts = (await prisma.user.count().catch(() => 1)) === 0
  // SSO-only: the password form is hidden except the administrator fallback (?local=1).
  const showPassword = !sso || !sso.ssoOnly || local === "1"
  const ssoHref = `/api/auth/sso/start?next=${encodeURIComponent(next ?? "/")}`
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
            <p className="text-sm text-muted-foreground">
              {sso ? `Use your ${sso.providerName} work account.` : "Use the email your administrator set up for you."}
            </p>
          </div>
          {noAccounts && (
            <Alert aria-live="polite">
              <AlertDescription>
                <p className="font-medium text-foreground">No accounts exist yet.</p>
                <p>
                  For the demo accounts, set <code>SEED_DEMO_DATA</code> to <code>true</code> in the hosting settings and redeploy. For a production start, sign in with{" "}
                  <code>BOOTSTRAP_ADMIN_EMAIL</code> and <code>BOOTSTRAP_ADMIN_PASSWORD</code>.
                </p>
              </AlertDescription>
            </Alert>
          )}
          {sso_error && (
            <Alert variant="destructive" aria-live="polite">
              <AlertDescription>{SSO_ERROR_TEXT[sso_error] ?? "Company sign-in didn't work. Try again."}</AlertDescription>
            </Alert>
          )}
          {sso && (
            <Button asChild size="lg" variant={showPassword ? "outline" : "default"} className="h-10">
              <a href={ssoHref}>
                <MicrosoftMark />
                Sign in with {sso.providerName}
              </a>
            </Button>
          )}
          {sso && showPassword && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              {sso.ssoOnly ? "Administrator sign-in" : "or with a password"}
              <Separator className="flex-1" />
            </div>
          )}
          {showPassword && <LoginForm next={next ?? "/"} demo={demo && !sso?.ssoOnly ? DEMO : []} />}
          {!showPassword && (
            <a href="/login?local=1" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
              Administrator sign-in without {sso?.providerName}
            </a>
          )}
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

/** Four-square mark used on "Sign in with Microsoft"; a neutral key shape for other providers. */
function MicrosoftMark() {
  const name = (process.env.SSO_PROVIDER_NAME || "Microsoft").toLowerCase()
  if (!name.includes("microsoft")) {
    return (
      <svg viewBox="0 0 16 16" aria-hidden data-icon="inline-start" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="5.5" cy="8" r="3" />
        <path d="M8.5 8H15M12.5 8v2.5M14.5 8v1.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden data-icon="inline-start" className="size-4">
      <rect x="0" y="0" width="7.5" height="7.5" fill="#f25022" />
      <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7fba00" />
      <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00a4ef" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#ffb900" />
    </svg>
  )
}
