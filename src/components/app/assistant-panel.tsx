"use client"

import Link from "next/link"
import { Component, Fragment, useEffect, useRef, useState } from "react"
import { ArrowUpIcon, RotateCcwIcon, SparklesIcon } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { reportClientError } from "./error-report"

type Msg = { role: "user" | "assistant"; text: string; links?: { label: string; href: string }[]; notice?: string }

/** Keeps a problem inside the assistant from taking down the whole page, and reports it. */
class PanelBoundary extends Component<{ children: React.ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportClientError(error, "assistant-panel", info.componentStack?.split("\n").slice(0, 8).join("\n"))
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col gap-3 p-4 text-sm">
        <p className="font-medium">Mav hit a problem showing that answer.</p>
        <pre className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{this.state.error.message}</pre>
        <button type="button" className="w-fit rounded-md border px-3 py-1.5" onClick={() => (this.setState({ error: null }), this.props.onReset())}>
          Start again
        </button>
      </div>
    )
  }
}

/** If an answer can't be formatted, show it as plain text instead of breaking the page. */
class SafeText extends Component<{ text: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p className="text-sm whitespace-pre-wrap">{this.props.text}</p> : this.props.children
  }
}

/** Renders the assistant's small markdown subset: paragraphs, "- " and "1." lists, **bold** and [label](/path). */
function Rich({ text }: { text: string }) {
  const inline = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)]*\))/g).map((part, i) => {
      const b = part.match(/^\*\*(.+)\*\*$/)
      if (b) return <strong key={`${k}${i}`} className="font-semibold">{b[1]}</strong>
      const l = part.match(/^\[([^\]]+)\]\((\/[^)]*)\)$/)
      if (l) return <Link key={`${k}${i}`} href={l[2]} className="font-medium text-primary underline underline-offset-2">{l[1]}</Link>
      return <Fragment key={`${k}${i}`}>{part}</Fragment>
    })
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const L = list.ordered ? "ol" : "ul"
    blocks.push(
      <L key={blocks.length} className={cn("my-1 flex flex-col gap-1 pl-4", list.ordered ? "list-decimal" : "list-disc")}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `${blocks.length}-${i}-`)}</li>)}
      </L>,
    )
    list = null
  }
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd()
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      const ordered = !!ol
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((ul ?? ol)![1])
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line, `${blocks.length}-`)}</p>)
  }
  flush()
  return <div className="flex flex-col gap-1.5 text-sm leading-relaxed">{blocks}</div>
}

export function MavAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2350a8] to-[#5b8fd9] text-white shadow-sm", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5">
        <rect x="4" y="9" width="16" height="11" rx="2" fill="currentColor" opacity=".95" />
        <rect x="3" y="6.5" width="18" height="4" rx="1.2" fill="#ffd27a" />
        <rect x="11" y="6.5" width="2" height="13.5" fill="#ffd27a" />
        <circle cx="8.5" cy="14.5" r="1.2" fill="#0f1e3d" />
        <circle cx="15.5" cy="14.5" r="1.2" fill="#0f1e3d" />
      </svg>
    </span>
  )
}

export function AssistantPanel({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [mode, setMode] = useState<string>("")
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener("assistant:open", onOpen)
    return () => window.removeEventListener("assistant:open", onOpen)
  }, [])
  useEffect(() => {
    if (!open || suggestions.length) return
    fetch("/api/assistant").then((r) => r.json()).then((d) => (setSuggestions(d.suggestions ?? []), setMode(d.mode ?? ""))).catch(() => {})
  }, [open, suggestions.length])
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not return anything but a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [msgs, busy])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    const next: Msg[] = [...msgs, { role: "user", text: question }]
    setMsgs(next)
    setText("")
    setBusy(true)
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })) }) })
      const d = await r.json().catch(() => ({}))
      const text = typeof d?.text === "string" && d.text.trim() ? d.text : "I couldn't get an answer. Try again."
      const links = Array.isArray(d?.links) ? d.links.filter((l: { href?: unknown; label?: unknown }) => typeof l?.href === "string" && l.href.startsWith("/") && typeof l?.label === "string") : []
      setMsgs([...next, r.ok ? { role: "assistant", text, links, notice: typeof d?.notice === "string" ? d.notice : undefined } : { role: "assistant", text: d?.error?.message ?? "Something went wrong. Try again." }])
    } catch (e) {
      reportClientError(e, "assistant-ask")
      setMsgs([...next, { role: "assistant", text: "I couldn't reach the server. Check your connection and try again." }])
    } finally {
      setBusy(false)
      requestAnimationFrame(() => input.current?.focus())
    }
  }

  const first = name.split(" ")[0]
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center gap-3 border-b px-4 py-3">
          <MavAvatar />
          <div className="flex min-w-0 flex-col">
            <SheetTitle className="text-base">Ask Mav</SheetTitle>
            <SheetDescription className="text-xs">Answers come from live data, limited to what your role can see.</SheetDescription>
          </div>
          {msgs.length > 0 && (
            <button type="button" onClick={() => setMsgs([])} className="mr-8 ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Start a new conversation">
              <RotateCcwIcon className="size-4" />
            </button>
          )}
        </SheetHeader>

        <PanelBoundary onReset={() => setMsgs([])}>
        <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {msgs.length === 0 && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border bg-gradient-to-br from-accent to-card p-4">
                <p className="text-base font-semibold">Hi {first}, I&apos;m Mav.</p>
                <p className="mt-1 text-sm text-muted-foreground">Ask me about stock, requests, events, points or rewards. I only use the information your role is allowed to see.</p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Try asking</p>
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-lg border bg-card px-3 py-2 text-left text-sm hover:border-primary/40 hover:bg-accent/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-10 self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.text}</div>
              ) : (
                <div key={i} className="flex gap-2.5">
                  <MavAvatar className="size-7" />
                  <div className="flex min-w-0 flex-col gap-2 rounded-2xl rounded-tl-md border bg-card px-3.5 py-2.5">
                    {m.notice && <p className="rounded-md bg-pending-soft px-2 py-1 text-xs text-pending">{m.notice}</p>}
                    <SafeText text={m.text}>
                      <Rich text={m.text} />
                    </SafeText>
                    {!!m.links?.length && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.links.map((l) => (
                          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/70">
                            {l.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <MavAvatar className="size-7" />
                <Spinner /> Looking that up…
              </div>
            )}
          </div>
          <div ref={end} />
        </div>

        <form
          className="border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            ask(text)
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border bg-card p-1.5 focus-within:ring-3 focus-within:ring-ring/40">
            <label htmlFor="assistant-input" className="sr-only">Your question</label>
            <textarea
              id="assistant-input"
              ref={input}
              rows={1}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  ask(text)
                }
              }}
              placeholder="Ask a question…"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
              <ArrowUpIcon className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
            <SparklesIcon className="size-3" />
            {mode && mode !== "built-in" ? `Powered by ${mode}. Answers can be wrong; check important numbers.` : "Built-in answers from live data."}
          </p>
        </form>
        </div>
        </PanelBoundary>
      </SheetContent>
    </Sheet>
  )
}
