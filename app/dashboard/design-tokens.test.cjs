const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const globalsCss = readFileSync(path.join(__dirname, "..", "globals.css"), "utf8")
const taskFilterSource = readFileSync(path.join(__dirname, "..", "..", "components", "task-filter.tsx"), "utf8")

test("dashboard exposes semantic Saathi design tokens", () => {
  const expectedTokens = {
    "--saathi-surface-page": "#f7f7f4",
    "--saathi-surface-default": "#ffffff",
    "--saathi-surface-navigation": "#ffffff",
    "--saathi-border-subtle": "#e7e9f2",
    "--saathi-border-default": "#e1e5ef",
    "--saathi-brand": "#0f766e",
    "--saathi-info": "#0f766e",
    "--saathi-success": "#34c759",
    "--saathi-warning": "#ff9f0a",
    "--saathi-danger": "#ff3b30",
    "--saathi-radius-label": "0.25rem",
    "--saathi-radius-control": "0.375rem",
    "--saathi-radius-card": "0.5rem",
    "--saathi-radius-container": "0.75rem",
    "--saathi-type-page-title": "1.5rem",
    "--saathi-type-label": "0.75rem",
    "--saathi-brand-deep": "#202426",
    "--saathi-brand-soft": "#ddf4ee",
    "--saathi-surface-wash": "#f1f8f5",
    "--saathi-width-rail": "15rem",
    "--saathi-control-height": "2.75rem",
  }

  for (const [token, value] of Object.entries(expectedTokens)) {
    const escapedValue = value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")
    assert.match(globalsCss, new RegExp(`${token}:\\s*${escapedValue}`))
  }
})

test("shared Saathi tokens provide the approved light system", () => {
  const rootBlock = globalsCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]

  assert.ok(rootBlock, "expected a :root token block")

  const expectedTokens = {
    "--background": "#f7f7f4",
    "--foreground": "#202426",
    "--primary": "#0f766e",
    "--saathi-success": "#34c759",
    "--saathi-danger": "#ff3b30",
  }

  for (const [token, value] of Object.entries(expectedTokens)) {
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(rootBlock, new RegExp(`${token}:\\s*${escapedValue}`))
  }
})

test("task filters consume semantic light-theme tokens", () => {
  assert.match(taskFilterSource, /border-border/)
  assert.match(taskFilterSource, /bg-card/)
  assert.match(taskFilterSource, /bg-secondary/)
  assert.doesNotMatch(taskFilterSource, /border-white\/10|bg-input\/70/)
})

test('primary button text retains AA contrast on a white surface while hovered', () => {
  const button = readFileSync(path.join(__dirname, '..', '..', 'components', 'ui', 'button.tsx'), 'utf8')
  const variant = button.match(/default: '([^']+)'/)[1]
  const alpha = Number(variant.match(/hover:bg-primary\/(\d+)/)?.[1] ?? 100) / 100
  const root = globalsCss.match(/:root\s*\{([\s\S]*?)\n\}/)[1]
  const rgb = token => root.match(new RegExp(`${token}:\\s*#([0-9a-f]{6})`))[1].match(/../g).map(hex => parseInt(hex, 16))
  const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
  const foreground = luminance(rgb('--primary-foreground'))
  const background = luminance(rgb('--primary').map(value => Math.round(alpha * value + (1 - alpha) * 255)))
  const ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
  assert.ok(ratio >= 4.5, `Hovered primary button contrast ${ratio.toFixed(2)} must meet 4.5:1`)
})

test('destructive buttons use a semantic foreground with AA contrast in the shared palette',()=>{
const button=readFileSync(path.join(__dirname,'..','..','components','ui','button.tsx'),'utf8');const variant=button.match(/destructive:\s*'([^']+)'/)[1];assert.match(variant,/text-destructive-foreground/);assert.doesNotMatch(variant,/dark:bg-destructive\/60/);
const lum=hex=>hex.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
const bg=globalsCss.match(/--destructive:\s*#([0-9a-f]{6})/)[1];for(const match of globalsCss.matchAll(/--destructive-foreground:\s*#([0-9a-f]{6})/g)){const ratio=(Math.max(lum(bg),lum(match[1]))+.05)/(Math.min(lum(bg),lum(match[1]))+.05);assert.ok(ratio>=4.5,'Destructive action contrast must meet 4.5:1')}
})
