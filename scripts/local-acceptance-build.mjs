import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const proofPath = '.next/saathi-local-acceptance.json'
const digest = value => createHash('sha256').update(value).digest('hex')
function stamp({ apiOrigin, appOrigin, publicKey }, read) {
  return { version: 1, apiOrigin: new URL(apiOrigin).origin, appOrigin: new URL(appOrigin).origin,
    publicKeySha256: digest(publicKey), buildId: String(read('.next/BUILD_ID')).trim(),
    clientManifestSha256: digest(read('.next/build-manifest.json')),
    actionManifestSha256: digest(read('.next/server/server-reference-manifest.json')) }
}

export function recordLocalAcceptanceBuild(configuration, { read = readFileSync, write = writeFileSync } = {}) {
  write(proofPath, JSON.stringify(stamp(configuration, read), null, 2))
}

/** Runtime overrides cannot replace public values baked into an unrelated production build. */
export function assertLocalAcceptanceBuild(configuration, { read = readFileSync } = {}) {
  try {
    const saved = JSON.parse(String(read(proofPath)))
    const expected = stamp(configuration, read)
    if (Object.keys(saved).length !== Object.keys(expected).length || !Object.keys(expected).every(key => saved[key] === expected[key])) throw new Error('mismatch')
  } catch {
    throw new Error('Prepare the local production build with node scripts/prepare-nfr-local.mjs before Auth acceptance')
  }
}
