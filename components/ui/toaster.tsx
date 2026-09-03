'use client'

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const Icon = props.variant === 'success'
          ? CheckCircle2
          : props.variant === 'warning'
            ? AlertTriangle
            : props.variant === 'destructive'
              ? XCircle
              : Info

        return (
          <Toast key={id} {...props}>
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
