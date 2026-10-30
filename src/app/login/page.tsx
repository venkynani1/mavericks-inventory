import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUser } from "@/lib/server/session"
import { prisma } from "@/lib/db"
import { SSO_ERROR_TEXT, ssoConfig } from "@/lib/server/sso"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Brand } from "@/components/app/brand"
import { BoxesIcon, ShieldCheckIcon, TrophyIcon } from "lucide-react"
import { MavHello } from "@/components/app/mav-hello"
import { DemoLogins, LoginForm, type DemoAccount } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

const DEMO: DemoAccount[] = [
  { email: "executive@mavericks.demo", name: "Kavin Raj", role: "Executive", does: "stock, distributions, events", icon: "exec" },
  { email: "manager@mavericks.demo", name: "Rahul Iyer", role: "Manager", does: "approves requests", icon: "manager" },
  { email: "authority@mavericks.demo", name: "Meera Krishnan", role: "Management Authority", does: "final approval", icon: "authority" },
  { email: "admin@mavericks.demo", name: "Sanjana Rao", role: "Administrator", does: "users, rules, audit", icon: "admin" },
  { email: "employee@mavericks.demo", name: "Priyanka Sharma", role: "Employee", does: "own points and goodies", icon: "employee" },
]
const DEMO_PASSWORD = () => process.env.DEMO_PASSWORD || "Mavericks@2026"

/** Demo sign-in shows when DEMO_MODE=true, or when the demo accounts exist and DEMO_MODE isn't "false". */
async function demoAccounts() {
  if (process.env.DEMO_MODE === "false") return []
  const found = await prisma.user.findMany({ where: { email: { in: DEMO.map((d) => d.email) }, active: true }, select: { email: true } }).catch(() => [])
  const have = new Set(found.map((f) => f.email))
  return DEMO.filter((d) => have.has(d.email))
}

const HIGHLIGHTS = [
  { icon: BoxesIcon, title: "Inventory you can trust", text: "On hand, reserved and free to promise, with every movement on the ledger." },
  { icon: ShieldCheckIcon, title: "Maker and checker", text: "Nothing leaves the shelf until a manager approves it." },
  { icon: TrophyIcon, title: "Points that turn into goodies", text: "Attend events, earn points, get a goodie at every milestone." },
]

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; sso_error?: string; local?: string }> }) {
  if (await getUser()) redirect("/")
  const { next, sso_error, local } = await searchParams
  const sso = ssoConfig()
  const [noAccounts, demo] = await Promise.all([prisma.user.count().then((n) => n === 0).catch(() => false), sso?.ssoOnly ? Promise.resolve([]) : demoAccounts()])
  // SSO-only: the password form is hidden except the administrator fallback (?local=1).
  const showPassword = !sso || !sso.ssoOnly || local === "1"
  const ssoHref = `/api/auth/sso/start?next=${encodeURIComponent(next ?? "/")}`
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="relative hidden overflow-hidden bg-shell text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_24rem_at_85%_0%,rgba(91,143,217,.35),transparent),radial-gradient(30rem_20rem_at_0%_100%,rgba(241,183,59,.18),transparent)]" />
        <Brand inverted className="relative" />
        <div className="relative flex flex-col gap-8">
          <MavHello tone="dark" size="lg" message="Hi there! I'm Mav." sub="Welcome to Mavericks Inventory. Pick a demo role and I'll show you around." />
          <ul className="grid max-w-xl gap-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#9cbcf2] ring-1 ring-white/10"><h.icon className="size-4" /></span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{h.title}</span>
                  <span className="text-sm text-white/65">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/45">Hexaware Technologies, Mavericks programme</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto flex w-full max-w-md flex-col gap-7">
          <Brand className="lg:hidden" />
          {demo.length > 0 && <MavHello size="sm" className="-my-2 lg:hidden" message="Hi! I'm Mav." sub="Pick a role and look around." />}
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

          {demo.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold">Explore the demo</h1>
                <p className="text-sm text-muted-foreground">Choose a role to sign in instantly. Each one sees a different part of the app.</p>
              </div>
              <DemoLogins next={next ?? "/"} demo={demo} password={DEMO_PASSWORD()} />
            </div>
          )}

          {demo.length > 0 && showPassword && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              or sign in with your account
              <Separator className="flex-1" />
            </div>
          )}
          {demo.length === 0 && (
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold">Sign in</h1>
              <p className="text-sm text-muted-foreground">{sso ? `Use your ${sso.providerName} work account.` : "Use the email your administrator set up for you."}</p>
            </div>
          )}
          {sso && (
            <Button asChild size="lg" variant={showPassword ? "outline" : "default"} className="h-10">
              <a href={ssoHref}>
                <MicrosoftMark />
                Sign in with {sso.providerName}
              </a>
            </Button>
          )}
          {sso && showPassword && demo.length === 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              {sso.ssoOnly ? "Administrator sign-in" : "or with a password"}
              <Separator className="flex-1" />
            </div>
          )}
          {showPassword && (demo.length > 0 ? (
            <details className="group rounded-xl border bg-card px-4 py-3 open:pb-5">
              <summary className="cursor-pointer text-sm font-medium outline-none select-none">Sign in with email and password</summary>
              <div className="mt-4"><LoginForm next={next ?? "/"} /></div>
            </details>
          ) : (
            <LoginForm next={next ?? "/"} />
          ))}
          {!showPassword && (
            <a href="/login?local=1" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline">
              Administrator sign-in without {sso?.providerName}
            </a>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {demo.length > 0 ? "This is a demonstration with sample data. " : ""}Access is limited to authorised Hexaware staff. Every sign-in and change is recorded in the audit log.
          </p>
        </div>
      </section>
    </main>
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
