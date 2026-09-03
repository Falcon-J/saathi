import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getDashboardNavigationTarget,
  normalizeDashboardActiveSection,
  selectActiveDashboardSection,
} from '../lib/dashboard-navigation.ts'

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

test('routes work, team, and realtime navigation to the board view', () => {
  assert.deepEqual(getDashboardNavigationTarget('project-board'), {
    sectionId: 'project-board',
    view: 'board',
  })
  assert.deepEqual(getDashboardNavigationTarget('team-panel'), {
    sectionId: 'team-panel',
    view: 'board',
  })
  assert.deepEqual(getDashboardNavigationTarget('realtime-panel'), {
    sectionId: 'realtime-panel',
    view: 'board',
  })
})

test('resets hidden secondary navigation to the workspace header', () => {
  assert.equal(normalizeDashboardActiveSection('team-panel', false), 'workspace-header')
  assert.equal(normalizeDashboardActiveSection('realtime-panel', false), 'workspace-header')
  assert.equal(normalizeDashboardActiveSection('project-board', false), 'project-board')
})
