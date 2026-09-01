import assert from 'node:assert/strict'
import test from 'node:test'

import { notificationTypeToToastVariant } from './notification-variant.ts'

test('maps each notification outcome to its semantic toast variant', () => {
  assert.deepEqual(
    (['success', 'info', 'warning', 'error'] as const).map(notificationTypeToToastVariant),
    ['success', 'info', 'warning', 'destructive'],
  )
})
