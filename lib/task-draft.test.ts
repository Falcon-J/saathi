import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTaskUpdate, toTaskEditorDraft } from './task-draft.ts'
import { localDateTimeToIso, toLocalTime } from './task-time.ts'
import { normalizeTaskUpdates } from './task-contract.ts'

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
    dueDate: undefined,
    dueAt: expectedDueAt,
    estimatedMinutes: undefined,
  })
})

test('editor deadline transitions satisfy the command contract and clear the previous shape', () => {
  const dateOnly = { title: 'Date only', priority: 'medium' as const, dueDate: '2026-10-05' }
  const timed = buildTaskUpdate(dateOnly, { ...toTaskEditorDraft(dateOnly), dueTime: '17:30' })
  assert.equal(normalizeTaskUpdates(timed).error, undefined)
  assert.ok(Object.hasOwn(timed, 'dueDate'))
  assert.equal(timed.dueDate, undefined)
  assert.ok(timed.dueAt)
  const date = buildTaskUpdate({ ...dateOnly, dueDate: undefined, dueAt: timed.dueAt }, { ...toTaskEditorDraft(dateOnly), dueTime: '' })
  assert.equal(normalizeTaskUpdates(date).error, undefined)
  assert.equal(date.dueDate, '2026-10-05')
  assert.ok(Object.hasOwn(date, 'dueAt'))
  assert.equal(date.dueAt, undefined)
})
