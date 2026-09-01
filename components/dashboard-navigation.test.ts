import assert from 'node:assert/strict'
import test from 'node:test'

import { selectActiveDashboardSection } from '../lib/dashboard-navigation.ts'

test('selects the most visible valid dashboard section without losing the current section', () => {
  assert.equal(
    selectActiveDashboardSection(
      [
        { id: 'workspace-header', isIntersecting: true, ratio: 0.35 },
        { id: 'project-board', isIntersecting: true, ratio: 0.7 },
      ],
      'workspace-header',
    ),
    'project-board',
  )

  assert.equal(
    selectActiveDashboardSection(
      [{ id: 'unrelated', isIntersecting: true, ratio: 1 }],
      'project-board',
    ),
    'project-board',
  )
})
