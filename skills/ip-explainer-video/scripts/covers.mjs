#!/usr/bin/env node
// 五比例封面：cover.json → covers/cover-{16x9,16x10,4x3,3x4,9x16}.png（BlockFrame 海报 + IP 角色定格图）
// 用法：node <skill>/scripts/covers.mjs [projectDir]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(process.argv[2] || '.')
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cover.json'), 'utf8'))
const OUT = path.join(ROOT, 'covers'); fs.mkdirSync(path.join(OUT, 'ip'), { recursive: true })
const RATIOS = [['16x9', 1920, 1080], ['16x10', 1920, 1200], ['4x3', 1600, 1200], ['3x4', 1200, 1600], ['9x16', 1080, 1920]]
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

// 1) IP 角色定格图（透明 PNG）：通过 ip.json 的 still 命令生成，任何 IP 都一样
let ipPng = null
if (c.ip) {
  const tmp = path.join(OUT, 'ip', 'cover-pose.json')
  fs.writeFileSync(tmp, JSON.stringify({ width: 1200, height: 1200, fps: 30, background: 'transparent', cat: { x: 0.5, y: 0.99, scale: c.ip.scale || 1.22, flip: !!c.ip.flip },
    timeline: [{ at: 0, do: c.ip.do || 'happy', scene: c.ip.scene || null, accessories: c.ip.accessories || [], ...(c.ip.text ? { text: c.ip.text } : {}) }], duration: 5 }))
  const res = execSync(`node "${path.join(SKILL, 'scripts/ip.mjs')}" still --ip "${path.join(ROOT, 'ip.json')}" --script "${tmp}" --at ${c.ip.at ?? 1.2} --dir "${path.join(OUT, 'ip')}"`, { cwd: ROOT }).toString()
  ipPng = JSON.parse(res.trim().split('\n').pop()).files[0]
}

// 2) 每个比例一张 HTML 海报
const fontDir = path.join(ROOT, 'assets/fonts')
const face = (fam, file, w) => fs.existsSync(path.join(fontDir, file)) ? `@font-face{font-family:"${fam}";src:url("file://${path.join(fontDir, file)}");font-weight:${w}}` : ''
const C = { black: '#000', white: '#fff', pink: '#FE90E8', blue: '#C0F7FE', green: '#99E885', yellow: '#F7CB46', cream: '#FFDC8B' }
const chipColors = c.chipColors || [C.pink, C.yellow, C.blue]
function html(name, W, H) {
  const portrait = H > W, u0 = Math.min(W, H) / 100
  // 横版越接近方形，字越小；竖版里猫用剩下的高度
  const f = portrait ? Math.min(1, (H / W) / 1.78) : Math.min(1, (W / H) / 1.78), u = u0 * f
  const catPortrait = Math.max(40 * u0, Math.min(86 * u0, H - 74 * u))
  const [t1, ...rest] = c.title
  const badge = c.badge ? `<div class="star badge">${esc(c.badge)}</div>` : ''
  const title = `<div class="t1wrap"><div class="chip t1" style="background:${chipColors[0]};transform:rotate(-3deg)">${esc(t1)}</div>${badge}</div>` +
    rest.map((t, i) => `<div class="chip t2" style="background:${chipColors[(i + 1) % chipColors.length]};transform:rotate(${i % 2 ? -2 : 2}deg)">${esc(t)}</div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${face('Noto Sans SC', 'NotoSansSC-Black.otf', 900)}${face('Noto Sans SC', 'NotoSansSC-Bold.otf', 700)}${face('Space Grotesk', 'SpaceGrotesk-Variable.ttf', '300 700')}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{background:${c.ground || C.cream};font-family:Inter,"Noto Sans SC",sans-serif;position:relative}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(0,0,0,.28) ${0.18 * u}px,transparent ${0.2 * u}px);background-size:${3 * u}px ${3 * u}px;opacity:.6}
.ghost{position:absolute;font-weight:900;color:rgba(0,0,0,.08);font-size:${(portrait ? 34 : 40) * u}px;line-height:.8;letter-spacing:-.04em;white-space:nowrap;${portrait ? `left:-${4 * u}px;bottom:${2 * u}px` : `left:-${3 * u}px;bottom:-${4 * u}px`}}
.stripe{position:absolute;border:${0.35 * u}px solid #000;background:repeating-linear-gradient(45deg,#000 0 ${1.1 * u}px,${C.pink} ${1.1 * u}px ${2.4 * u}px)}
.star{position:absolute;border:${0.35 * u}px solid #000;clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:${portrait ? 2 * u : 3 * u}px;flex-direction:${portrait ? 'column' : 'row'};padding:${5 * u}px;box-sizing:border-box}
.text{display:flex;flex-direction:column;align-items:center;gap:${2.6 * u}px;text-align:center}
.pill{display:inline-block;padding:${0.9 * u}px ${2.4 * u}px;border:${0.35 * u}px solid #000;border-radius:999px;box-shadow:${0.45 * u}px ${0.45 * u}px 0 #000;background:#fff;font-family:"Space Grotesk","Noto Sans SC",sans-serif;font-weight:700;font-size:${3 * u}px;letter-spacing:.08em}
.chip{display:inline-block;border:${0.45 * u}px solid #000;box-shadow:${0.9 * u}px ${0.9 * u}px 0 #000;font-weight:900;white-space:nowrap}
.t1{font-size:${(portrait ? 26 : 25) * u}px;line-height:1;padding:${0.4 * u}px ${3.2 * u}px ${1.6 * u}px;letter-spacing:-.04em}
.t2{font-family:"Noto Sans SC",Inter,sans-serif;font-size:${(portrait ? 10.5 : 10) * u}px;padding:${0.8 * u}px ${2.6 * u}px}
.sub{font-family:"Noto Sans SC",sans-serif;font-weight:900;font-size:${4.6 * u}px;background:#000;color:#fff;padding:${1 * u}px ${2.4 * u}px;box-shadow:${0.7 * u}px ${0.7 * u}px 0 ${C.yellow}}
.ip{${portrait ? `width:${catPortrait}px` : `height:${82 * H / 100}px`};aspect-ratio:1;object-fit:contain;flex:none;margin-${portrait ? 'top' : 'left'}:-${2 * u}px}
.t1wrap{position:relative}
.badge{position:absolute;right:-${10 * u}px;top:-${7 * u}px;width:${17 * u}px;height:${17 * u}px;transform:rotate(12deg);display:flex;align-items:center;justify-content:center;font-family:"Noto Sans SC",sans-serif;font-weight:900;font-size:${4.2 * u}px;background:${C.green}}
</style></head><body>
<div class="dots"></div><div class="ghost">${esc(c.ghost || t1)}</div>
<div class="stripe" style="left:${5 * u}px;top:${5 * u}px;width:${20 * u}px;height:${6 * u}px;transform:rotate(-6deg)"></div>
<div class="stripe" style="right:${5 * u}px;bottom:${5 * u}px;width:${16 * u}px;height:${5 * u}px;transform:rotate(8deg);background:repeating-linear-gradient(45deg,#000 0 ${1.1 * u}px,${C.blue} ${1.1 * u}px ${2.4 * u}px)"></div>
<div class="star" style="right:${portrait ? 8 * u : 6 * u}px;top:${portrait ? 6 * u : 7 * u}px;width:${11 * u}px;height:${11 * u}px;background:${C.yellow}"></div>
<div class="stage"><div class="text">${c.eyebrow ? `<div class="pill">${esc(c.eyebrow)}</div>` : ''}${title}${c.subtitle ? `<div class="chip sub">${esc(c.subtitle)}</div>` : ''}</div>
${ipPng ? `<img class="ip" src="file://${ipPng}">` : ''}</div>
</body></html>`
}

// 3) Chrome 无头截图
// 优先 HyperFrames / puppeteer 自带的 chrome-headless-shell（专为截图，不会卡在首次运行），其次系统 Chrome
function findShell() {
  const base = path.join(os.homedir(), '.cache/puppeteer/chrome-headless-shell')
  if (!fs.existsSync(base)) return null
  for (const v of fs.readdirSync(base).sort().reverse()) {
    const dir = path.join(base, v)
    for (const sub of fs.readdirSync(dir)) {
      for (const exe of ['chrome-headless-shell', 'chrome-headless-shell.exe']) { const f = path.join(dir, sub, exe); if (fs.existsSync(f)) return f }
    }
  }
  return null
}
const chrome = process.env.CHROME || findShell() || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p))
if (!chrome) { console.error('✗ 找不到 Chrome；设置环境变量 CHROME=/path/to/chrome'); process.exit(1) }
const files = []
for (const [name, W, H] of RATIOS) {
  const htmlPath = path.join(OUT, `cover-${name}.html`), png = path.join(OUT, `cover-${name}.png`)
  fs.writeFileSync(htmlPath, html(name, W, H))
  fs.rmSync(png, { force: true })
  const shell = /headless-shell/.test(chrome)
  try {
    execFileSync(chrome, [...(shell ? [] : ['--headless=new']), '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=2000', `--window-size=${W},${H}`, `--screenshot=${png}`, `file://${htmlPath}`], { stdio: 'ignore', timeout: 45000 })
  } catch (e) { if (!fs.existsSync(png)) throw e }   // 截图已写出就算成功（个别 Chrome 截完不退出）
  files.push(png)
}
console.log(JSON.stringify({ ok: true, files, ip: ipPng }))
