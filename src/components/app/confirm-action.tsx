"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type Result = { ok: true; message?: string } | { ok: false; error: string }

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  action,
  redirectTo,
}: {
  trigger: React.ReactNode
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  action: () => Promise<Result>
  redirectTo?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                start(async () => {
                  const r = await action()
                  if (!r.ok) {
                    toast.error(r.error)
                    return
                  }
                  toast.success(r.message ?? "Done")
                  setOpen(false)
                  if (redirectTo) router.push(redirectTo)
                  router.refresh()
                })
              }}
            >
              {pending && <Spinner data-icon="inline-start" />}
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
