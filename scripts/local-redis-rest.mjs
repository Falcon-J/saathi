// Test transport only: forwards REST commands to a real loopback Redis server.
// This is not an Upstash emulator or a production Redis gateway.
import net from 'node:net'
import http from 'node:http'

export async function startLocalRedisRest({ token, redisPort = 56379, port = 0 }) {
  const socket = net.createConnection({ host: '127.0.0.1', port: redisPort })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  let buffered = Buffer.alloc(0)
  const pending = []
  function parse(offset = 0) {
    const end = buffered.indexOf('\r\n', offset)
    if (end < 0) return null
    const kind = String.fromCharCode(buffered[offset]), line = buffered.toString('utf8', offset + 1, end)
    let next = end + 2
    if (kind === '+' || kind === '-') return { value: kind === '-' ? new Error(line) : line, next }
    if (kind === ':') return { value: Number(line), next }
    if (kind === '$') {
      const length = Number(line)
      if (length === -1) return { value: null, next }
      if (buffered.length < next + length + 2) return null
      return { value: buffered.toString('utf8', next, next + length), next: next + length + 2 }
    }
    if (kind === '*') {
      const count = Number(line), value = []
      if (count === -1) return { value: null, next }
      for (let i = 0; i < count; i++) { const item = parse(next); if (!item) return null; value.push(item.value); next = item.next }
      return { value, next }
    }
    throw new Error('Unexpected Redis protocol response')
  }
  socket.on('data', chunk => {
    buffered = Buffer.concat([buffered, chunk])
    while (pending.length) {
      const item = parse()
      if (!item) break
      buffered = buffered.subarray(item.next)
      const call = pending.shift()
      if (item.value instanceof Error) call.reject(item.value); else call.resolve(item.value)
    }
  })
  socket.on('error', error => { while (pending.length) pending.shift().reject(error) })
  socket.on('close', () => { while (pending.length) pending.shift().reject(new Error('Redis connection closed')) })
  function command(args) {
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject })
      const buffers = [Buffer.from(`*${args.length}\r\n`)]
      for (const arg of args) { const body = Buffer.from(String(arg)); buffers.push(Buffer.from(`$${body.length}\r\n`), body, Buffer.from('\r\n')) }
      socket.write(Buffer.concat(buffers))
    })
  }
  const encode = value => typeof value === 'string' && value !== 'OK'
    ? Buffer.from(value).toString('base64') : Array.isArray(value) ? value.map(encode) : value
  let offline = false, requests = 0
  const server = http.createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return }
    if (offline) { response.writeHead(503).end('Unavailable'); return }
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const input = JSON.parse(Buffer.concat(chunks).toString())
      const run = async args => { requests++; try { const value = await command(args); return { result: request.headers['upstash-encoding'] === 'base64' ? encode(value) : value } } catch (error) { return { error: error.message } } }
      const result = request.url === '/pipeline' ? await Promise.all(input.map(run)) : await run(input)
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(result))
    } catch { response.writeHead(400).end() }
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    command, outage(value) { offline = value }, get requests() { return requests },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); socket.destroy() },
  }
}
