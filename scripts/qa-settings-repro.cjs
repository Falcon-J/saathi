// Acceptance regression for the repaired settings draft/version invariant.
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const result = spawnSync(process.execPath, ['--test', 'components/workspace-settings.test.cjs'], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true,
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
