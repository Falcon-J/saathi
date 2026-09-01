import assert from 'node:assert/strict'
import test from 'node:test'

import { getMutationError, getThrownErrorMessage } from './mutation-result.ts'

test('returns a server action error without treating successful values as failures', () => {
  assert.equal(getMutationError({ error: 'You cannot edit this task.' }), 'You cannot edit this task.')
  assert.equal(getMutationError({ id: 'task-1' }), undefined)
  assert.equal(getMutationError(undefined), undefined)
})

test('preserves actionable thrown mutation errors', () => {
  assert.equal(
    getThrownErrorMessage(new Error('Task changed by another teammate'), 'Unable to update task.'),
    'Task changed by another teammate',
  )
  assert.equal(getThrownErrorMessage(undefined, 'Unable to update task.'), 'Unable to update task.')
})
