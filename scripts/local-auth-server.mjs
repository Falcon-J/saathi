/** Production acceptance exercises the prepared artifact; development is opt-in. */
export function authAcceptanceServer({ platform, node, production }) {
  if (production) return { command: node, nodeEnv: 'production', args: ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3101'] }
  return platform === 'win32'
    ? { command: 'cmd.exe', nodeEnv: 'development', args: ['/d', '/s', '/c', 'npm.cmd run dev -- --webpack --hostname 127.0.0.1 --port 3101'] }
    : { command: 'npm', nodeEnv: 'development', args: ['run', 'dev', '--', '--webpack', '--hostname', '127.0.0.1', '--port', '3101'] }
}
