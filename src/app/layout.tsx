import type { Metadata, Viewport } from "next"
import { Bricolage_Grotesque, Public_Sans } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { ErrorListener } from "@/components/app/error-listener"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

// Same pairing as the other Maverick tools (Event Control Hub): Bricolage for headings, Public Sans for everything else.
const heading = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" })
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" })

export const metadata: Metadata = {
  title: { default: "Mavericks Inventory", template: "%s · Mavericks Inventory" },
  description: "Approval-driven stock management for Mavericks goodies, kits and event merchandise.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1626" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${heading.variable} ${body.variable}`} suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="top-right" richColors closeButton />
          <ErrorListener />
        </ThemeProvider>
      </body>
    </html>
  )
}
