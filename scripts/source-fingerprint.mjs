import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export function hashSourceFiles(paths, read = readFileSync) {
  const hash = createHash('sha256')
  for (const path of [...new Set(paths)].sort()) {
    hash.update(JSON.stringify(path) + '\n')
    try { hash.update(createHash('sha256').update(read(path)).digest()) }
    catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('deleted') }
  }
  return hash.digest('hex')
}

/** Includes new platform files that an ordinary git diff cannot identify. */
export function sourceFingerprint() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true }).split('\0')
    .filter(path => /^(app|components|features|hooks|lib|scripts|drizzle|supabase|tests|public|\.github)\//.test(path)
      || /^(package(?:-lock)?\.json|tsconfig\.json|next\.config\.mjs|drizzle\.config\.ts|docker-compose\.local\.yml|proxy\.ts|playwright\.config\.ts|eslint\.config\.mjs|postcss\.config\.mjs|\.nvmrc|\.env\.example|[^/]+\.test\.(?:ts|cjs|mjs))$/.test(path))
  return { sourceTreeSha256: hashSourceFiles(files), sourceFileCount: files.length }
}
