import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTaskUpdate, toTaskEditorDraft } from './task-draft.ts'
import { localDateTimeToIso, toLocalTime } from './task-time.ts'

const task = {
  title: 'Review release notes',
  description: 'Confirm the error states.',
  priority: 'medium' as const,
  dueDate: '2026-09-15',
  dueAt: '2026-09-15T14:30:00.000Z',
  estimatedMinutes: 45,
  status: 'in-progress' as const,
  assigneeEmail: 'aisha@example.com',
}

test('returns only changed editable fields and preserves explicit clears', () => {
  assert.deepEqual(
    buildTaskUpdate(task, {
      ...toTaskEditorDraft(task),
      description: '',
      priority: 'high',
      assigneeEmail: '',
    }),
    { description: '', priority: 'high', assigneeEmail: '' },
  )
})

test('returns no update when the editor draft matches the task', () => {
  assert.deepEqual(buildTaskUpdate(task, toTaskEditorDraft(task)), {})
})

test('builds time changes and clears an estimate', () => {
  const draft = toTaskEditorDraft(task)
  assert.equal(draft.dueTime, toLocalTime(task.dueAt))
  const expectedDueAt = localDateTimeToIso('2026-09-15', '16:00')
  assert.deepEqual(buildTaskUpdate(task, { ...draft, dueTime: "16:00", estimatedMinutes: "" }), {
    dueDate: "2026-09-15",
    dueAt: expectedDueAt,
    estimatedMinutes: undefined,
  })
})
