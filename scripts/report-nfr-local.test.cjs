const assert = require('node:assert/strict')
const test = require('node:test')

test('recorded report escapes untrusted evidence, preserves failures and never invents a missing timeline', async () => {
  const { buildReport } = await import('./report-nfr-local.mjs')
  const untrusted = '</script><img src=x onerror=alert(1)>'
  const result = { passed: false, mode: 'diagnostic', failure: untrusted, fingerprint: { revision: untrusted }, performanceTargets: { read: true }, timings: { read: { count: 1, p50Ms: 10, p95Ms: 10, p99Ms: 10 } } }
  const baseline = buildReport(result)
  assert.match(baseline, /FAIL · diagnostic/)
  assert.match(baseline, /No timestamped timeline was recorded/)
  assert.match(baseline, /does not establish NFR acceptance/)
  assert.match(buildReport({ passed: true, mode: 'diagnostic', performanceTargets: { read: false } }), /FAIL · diagnostic/)
  assert.equal(baseline.includes(untrusted), false)
  assert.equal(baseline.includes('id="play"'), false)
  const recorded = buildReport(result, [{ at: '2026-10-23T00:00:00Z', kind: untrusted, durationMs: 10, cookie: 'private-cookie' }])
  assert.equal(recorded.includes(untrusted), false)
  assert.equal(recorded.includes('private-cookie'), false)
  assert.match(recorded, /Recorded timeline playback/)
  assert.match(recorded, /id="play"/)
})
