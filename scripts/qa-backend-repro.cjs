// Regression runner: exit 0 means the QA-03/04 repaired behavior passes.
// Uses actual modules with controlled Redis/SQL fixtures; no network or hosted writes.
require('../lib/rate-limit-behavior.test.cjs')
require('../app/actions/invitation-admission.test.cjs')
