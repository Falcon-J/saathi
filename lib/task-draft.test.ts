import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTaskUpdate } from './task-draft.ts'

const task = {
  title: 'Review release notes',
  description: 'Confirm the error states.',
  priority: 'medium' as const,
  dueDate: '2026-09-15',
  status: 'in-progress' as const,
  assigneeEmail: 'aisha@example.com',
}

test('returns only changed editable fields and preserves explicit clears', () => {
  assert.deepEqual(
    buildTaskUpdate(task, {
      ...task,
      description: '',
      priority: 'high',
      assigneeEmail: '',
    }),
    { description: '', priority: 'high', assigneeEmail: '' },
  )
})

test('returns no update when the editor draft matches the task', () => {
  assert.deepEqual(buildTaskUpdate(task, task), {})
})
