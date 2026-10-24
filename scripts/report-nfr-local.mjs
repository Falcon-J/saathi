import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const escape = value => String(value ?? 'Not recorded').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
const row = (label, value) => `<tr><th scope="row">${escape(label)}</th><td>${escape(typeof value === 'object' && value !== null ? JSON.stringify(value) : value)}</td></tr>`

export function buildReport(result, samples = []) {
  const allowed = ['kind', 'action', 'category', 'at', 'startedAt', 'durationMs', 'status', 'success', 'actorSlot', 'workspaceSlot', 'eventSlot', 'duplicate', 'scheduledOffsetMs', 'scheduleLagMs']
  const timeline = samples.slice(0, 60000).filter(sample => Number.isFinite(Date.parse(sample.at))).map(sample => Object.fromEntries(allowed.filter(key => sample[key] !== undefined).map(key => [key, sample[key]]))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const failedTargets = Object.values(result.performanceTargets ?? {}).some(value => value === false)
  const verdict = result.passed === true && !failedTargets ? 'PASS' : 'FAIL'
  const acceptance = result.mode === 'acceptance' && result.performanceAssertionsApplied === true
  const title = `${verdict} · ${result.mode ?? 'Mode not recorded'}`
  const metrics = Object.entries(result.timings ?? {}).map(([phase, value]) => `<tr><th scope="row">${escape(phase)}</th>${['count', 'p50Ms', 'p95Ms', 'p99Ms'].map(key => `<td>${escape(value?.[key])}</td>`).join('')}</tr>`).join('')
  const gates = Object.entries(result.performanceTargets ?? {}).map(([gate, value]) => row(gate, value === true ? 'PASS' : value === false ? 'FAIL' : 'Not measured')).join('')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recorded NFR evidence</title>
<style>body{font:16px/1.5 system-ui,sans-serif;color:#17212b;background:#f5f7fa;max-width:1100px;margin:auto;padding:24px}h1,h2{line-height:1.2}section{background:white;border:1px solid #ced6df;border-radius:10px;padding:20px;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px;border-bottom:1px solid #dce2e9;text-align:left;overflow-wrap:anywhere}th{font-weight:600}caption{text-align:left;font-weight:600;margin:8px 0}.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}input[type=range]{flex:1;min-width:180px}button,select{font:inherit;padding:6px 12px}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #1264ba;outline-offset:3px}.notice{border-left:4px solid #1264ba;padding-left:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.scroll{overflow:auto}</style>
<h1>${escape(title)}</h1><p class="notice">Recorded evidence playback. This page makes no network requests and does not show live application metrics. ${acceptance ? 'Local acceptance envelope; hosted release readiness remains separate.' : 'This run does not establish NFR acceptance.'}</p>
<section><h2>Run and verdict</h2><table><tbody>${row('Run', result.runId)}${row('Mode', result.mode)}${row('Overall execution verdict', verdict)}${row('Scope', result.scope)}${row('Failure phase', result.phase)}${row('Failure', result.failure)}${row('Cleanup', result.cleanup)}${row('Elapsed milliseconds', result.elapsedMs ?? result.workload?.elapsedMs)}${row('Envelope', result.envelope)}${row('Intended writes per second', result.workload?.intendedWriteRatePerSecond)}${row('Achieved writes per second', result.workload?.achievedWriteRatePerSecond)}${row('Attempted writes per second', result.workload?.attemptedWriteRatePerSecond)}${row('Schedule lag', result.workload?.scheduleLag)}${row('Committed writes', result.mutations ?? result.successfulMutations)}${row('Deliveries', result.deliveries)}${row('Error count', Array.isArray(result.errors) ? result.errors.length : result.errors)}${row('Error rate', result.errorRate)}${row('Generator event loop delay', result.generatorEventLoopDelay)}</tbody></table></section>
<section><h2>Gates and limits</h2><table><tbody>${gates || row('Performance gates', 'Not recorded')}${row('Thresholds', result.performanceThresholds)}${row('Performance assertions applied', result.performanceAssertionsApplied)}${row('Revocation within 30 seconds', result.revocationWithin30s)}${row('Reconciliation within 5 seconds', result.reconciliationWithin5s)}${row('Delivery timing semantics', result.deliveryTiming)}${row('Timing collection', result.timingEvidence)}</tbody></table></section>
<section><h2>Recorded phase percentiles</h2><div class="scroll"><table><thead><tr><th scope="col">Phase</th><th scope="col">Samples</th><th scope="col">p50 ms</th><th scope="col">p95 ms</th><th scope="col">p99 ms</th></tr></thead><tbody>${metrics || '<tr><td colspan="5">No percentile samples recorded.</td></tr>'}</tbody></table></div></section>
<section><h2>Recorded timeline playback</h2>${timeline.length ? `<p>Only captured samples are shown. The table follows the last 20 records at the selected recorded time. Pauses and speed change playback only.</p><div class="controls"><button id="play" type="button">Play</button><label for="speed">Playback speed</label><select id="speed"><option value="1">1×</option><option value="10">10×</option><option value="100" selected>100×</option></select><label for="position">Recorded time</label><input id="position" type="range" min="0" max="1000" step="any" value="0"><output id="clock" for="position"></output></div><p id="counts" role="status"></p><div class="scroll"><table><thead><tr><th scope="col">Recorded timestamp</th><th scope="col">Sample</th><th scope="col">Duration ms</th><th scope="col">Outcome</th></tr></thead><tbody id="records"></tbody></table></div>` : '<p>No timestamped timeline was recorded for this run. Tables show the available evidence; playback is unavailable.</p>'}</section>
<section><h2>Source provenance</h2><p>Fingerprints identify recorded sources. They do not prove that a later working copy or deployment matches.</p><pre>${escape(JSON.stringify(result.fingerprint ?? {}, null, 2))}</pre></section>
${timeline.length ? `<script type="application/json" id="recorded-data">${json(timeline)}</script><script>
const data=JSON.parse(document.getElementById('recorded-data').textContent), times=data.map(item=>Date.parse(item.at));
const first=times[0], span=Math.max(1,times[times.length-1]-first), slider=document.getElementById('position'), button=document.getElementById('play');
let playing=false,previous=0;
function render(){const time=first+Number(slider.value)*span/1000;let low=0,high=times.length;while(low<high){const mid=(low+high)>>1;if(times[mid]<=time)low=mid+1;else high=mid;}document.getElementById('clock').textContent=new Date(time).toISOString();document.getElementById('counts').textContent=low+' of '+data.length+' recorded samples';const body=document.getElementById('records');body.replaceChildren();for(const item of data.slice(Math.max(0,low-20),low)){const tr=document.createElement('tr');for(const value of [item.at,[item.kind,item.action||item.category||''].join(' '),Number.isFinite(item.durationMs)?Math.round(item.durationMs):'—',item.duplicate?'duplicate delivery':item.success===false?'failed':item.status??'recorded']){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}body.append(tr);}}
function frame(now){if(!playing)return;slider.value=String(Math.min(1000,Number(slider.value)+(now-previous)*Number(document.getElementById('speed').value)*1000/span));previous=now;render();if(Number(slider.value)>=1000){playing=false;button.textContent='Play';}else requestAnimationFrame(frame);}
button.addEventListener('click',()=>{playing=!playing;button.textContent=playing?'Pause':'Play';if(playing){if(Number(slider.value)>=1000)slider.value='0';previous=performance.now();requestAnimationFrame(frame);}});slider.addEventListener('input',()=>{playing=false;button.textContent='Play';render();});render();
</script>` : ''}</html>`
}

export function reportDirectory(input) {
  const root = realpathSync(resolve('.local-test')), directory = realpathSync(resolve(input))
  if (dirname(directory) !== root || !/^nfr-[a-zA-Z0-9-]+$/.test(basename(directory))) throw new Error('Choose an exact .local-test/nfr-* run directory')
  for (const name of ['result.json', 'timings.jsonl', 'report.html']) if (existsSync(resolve(directory, name)) && lstatSync(resolve(directory, name)).isSymbolicLink()) throw new Error('Run evidence files must not be symbolic links')
  const result = JSON.parse(readFileSync(resolve(directory, 'result.json'), 'utf8'))
  const timingFile = resolve(directory, 'timings.jsonl')
  const samples = existsSync(timingFile) ? readFileSync(timingFile, 'utf8').split('\n').filter(Boolean).slice(0, 60000).map(line => JSON.parse(line)) : []
  const output = resolve(directory, 'report.html')
  writeFileSync(output, buildReport(result, samples))
  return output
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/report-nfr-local.mjs .local-test/nfr-<run>')
  console.log(reportDirectory(process.argv[2]))
}
