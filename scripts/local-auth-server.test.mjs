import assert from 'node:assert/strict'
import test from 'node:test'
import { authAcceptanceServer } from './local-auth-server.mjs'
test('release auth acceptance uses the prepared production app on both platforms',()=>{for(const platform of ['win32','linux']){const spec=authAcceptanceServer({platform,node:'/runtime/node',production:true}); assert.equal(spec.command,'/runtime/node'); assert.deepEqual(spec.args,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101']); assert.equal(spec.nodeEnv,'production')}})
test('development auth mode remains explicit and uses webpack without shell-built values',()=>{const spec=authAcceptanceServer({platform:'win32',node:'node',production:false});assert.equal(spec.command,'cmd.exe');assert.equal(spec.nodeEnv,'development');assert.deepEqual(spec.args,['/d','/s','/c','npm.cmd run dev -- --webpack --hostname 127.0.0.1 --port 3101'])})
