# Hosted shipping ledger

Production base: 24e8314117792f8d15d29958268a7f8cf5eae4fa. Local verified snapshot: bf486ab47c9dc618985cc2c127a70dad246edcd0.

Ruling: Preserve production history, deep links, scoped server search, dense/mobile readiness groups, contextual creation and editor lifecycle; integrate local camera/selection, durable browser workspace creation, outbox handoff, Redis decoding/coalescing and legacy read improvements. Original checkout and design assets remain unchanged.

Verification in progress. Core 679 passed, two optional skips; platform 340 passed. TypeScript passed. Lint has no errors and one pre-existing task-comments warning after memoizing the integrated graph task list. Camera regression exercised red then green for responsive reframing.

Hosted disposable fixture run: d1b92764-aa7d-48bd-b24b-47bc574a2400. Real browser token and unrelated public-client OAuth token rejected with 401. Non-owner member read succeeded before removal and returned forbidden after removal. Recheck against final release deployment required.

Both isolated integrated database suites passed. SQL fixture database saathi_release_d1b92764 is separate from the preserved QA Auth database. Dependency lockfiles match after line-ending normalization (SHA-256 4baf3684fc384186df99c1be74889eafaa993a36d5298cdc178f27d4f5cfdb2a); complete verified root dependencies are being copied into the release checkout after slow fresh tarball downloads. No external dependency junction will be used for the final build.

Final review found and fixed resource focus, geometry fitting after manual navigation, and saved-view restoration during asynchronous URL resolution. Final regression/build checks remain pending.

The map remains interactive while an initial deep link resolves. Saved-camera application/persistence waits for the authorized initial location, preserving manual navigation cancellation. Explicit current-workspace/loading dependencies replace reliance on an unstable empty task array. The actual hosted owner UI removal was confirmed by the member count changing to one and an existing MCP token returning forbidden.
