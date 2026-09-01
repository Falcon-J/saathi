export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export function notificationTypeToToastVariant(type: NotificationType) {
  switch (type) {
    case 'success':
    case 'info':
    case 'warning':
      return type
    case 'error':
      return 'destructive'
  }
}
