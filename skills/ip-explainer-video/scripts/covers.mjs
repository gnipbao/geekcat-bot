#!/usr/bin/env node
// 五比例封面：cover.json → covers/cover-{16x9,16x10,4x3,3x4,9x16}.png + covers/youtube-1280x720.png
// 两种版式："style": "blockframe"（默认，视频同款海报 + IP 角色定格图）· "swiss"（瑞士极简频道版式，可用品牌照片代替角色）
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
const OUTS = [...RATIOS.map(([n, W, H]) => [`cover-${n}`, W, H]), ['youtube-1280x720', 1280, 720]]   // YouTube 缩略图：1280×720，≤ 2MB
const STYLE = c.style || 'blockframe'
if (!['blockframe', 'swiss'].includes(STYLE)) { console.error(`✗ 未知 style "${STYLE}"，可用：blockframe、swiss`); process.exit(1) }
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

// 1) IP 角色定格图（透明 PNG）：通过 ip.json 的 still 命令生成，任何 IP 都一样
let ipPng = null
const brand = c.brand || {}
const photo = brand.photo ? path.resolve(ROOT, brand.photo) : null
if (photo && !fs.existsSync(photo)) { console.error(`✗ 找不到 brand.photo：${photo}`); process.exit(1) }
if (c.ip && !(STYLE === 'swiss' && photo)) {
  const tmp = path.join(OUT, 'ip', 'cover-pose.json')
  fs.writeFileSync(tmp, JSON.stringify({ width: 1200, height: 1200, fps: 30, background: 'transparent', cat: { x: 0.5, y: 0.99, scale: c.ip.scale || 1.22, flip: !!c.ip.flip },
    timeline: [{ at: 0, do: c.ip.do || 'happy', scene: c.ip.scene || null, accessories: c.ip.accessories || [], ...(c.ip.text ? { text: c.ip.text } : {}) }], duration: 5 }))
  const res = execSync(`node "${path.join(SKILL, 'scripts/ip.mjs')}" still --ip "${path.join(ROOT, 'ip.json')}" --script "${tmp}" --at ${c.ip.at ?? 1.2} --dir "${path.join(OUT, 'ip')}"`, { cwd: ROOT }).toString()
  ipPng = JSON.parse(res.trim().split('\n').pop()).files[0]
}

// 2) 每个比例一张 HTML 海报
// 字体：先找工程 assets/fonts，再找 init-project.sh 的本机缓存
const fontDirs = [path.join(ROOT, 'assets/fonts'), process.env.IP_EXPLAINER_FONT_CACHE || path.join(os.homedir(), '.cache/ip-explainer-video/fonts')]
const face = (fam, file, w) => { const d = fontDirs.find(d => fs.existsSync(path.join(d, file))); return d ? `@font-face{font-family:"${fam}";src:url("file://${path.join(d, file)}");font-weight:${w}}` : '' }
const C = { black: '#000', white: '#fff', pink: '#FE90E8', blue: '#C0F7FE', green: '#99E885', yellow: '#F7CB46', cream: '#FFDC8B' }
const chipColors = c.chipColors || [C.pink, C.yellow, C.blue]
function blockframe(W, H) {
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

// 瑞士极简：大号英文名 + 一句中文钩子（*…* 标红）+ 细线 + 一行数据；照片（或角色）贴底边站在右侧 / 下方
const em = s => [...String(s)].reduce((w, ch) => w + (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 1 : /[A-Z0-9]/.test(ch) ? 0.66 : /\s/.test(ch) ? 0.28 : 0.55), 0) || 1
const mark = s => esc(s).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')
const plain = s => String(s).replace(/\*/g, '')
function swiss(W, H) {
  const B = { ground: brand.ground || '#F2F0EC', ink: brand.ink || '#141414', soft: brand.soft || '#6B6B68', accent: brand.accent || '#E30613' }
  const portrait = H > W, u = Math.min(W, H) / 100, pad = 8 * u
  const fig = photo || ipPng, aspect = photo ? (brand.photoAspect || 0.735) : 1
  const [t1, ...hooks] = c.title
  const label = [brand.label, c.eyebrow].filter(Boolean).join(' · ')
  const fit = (s, w, cap) => Math.min(cap, w / em(s))
  let figH, availW
  if (portrait) {
    availW = W - 2 * pad
  } else {
    figH = H * 0.96
    availW = W - figH * aspect - pad - 2 * u
  }
  const capT = portrait ? 0.2 * H : 0.405 * H, capH = portrait ? 0.075 * H : 0.128 * H, capS = portrait ? 0.028 * H : 0.047 * H
  const fT = fit(t1, availW, capT), fH = Math.min(...hooks.map(h => fit(plain(h), availW, capH)), capH), fS = c.subtitle ? fit(c.subtitle, availW, capS) : 0
  const fE = Math.max(16, (portrait ? 0.016 : 0.028) * H)
  const textH = pad + fE * 1.4 + 0.036 * H + fT * 0.86 + hooks.length * (fH * 1.05 + 0.025 * H) + 0.04 * H + (fS ? fS * 1.5 + 0.03 * H : 0)
  if (portrait) figH = Math.max(0.36 * H, Math.min(0.62 * H, H - textH))
  const figW = figH * aspect
  const dots = Array.from({ length: 9 }, (_, i) => `<circle cx="${(i % 3) * 3.6 * u + 0.55 * u}" cy="${Math.floor(i / 3) * 3.6 * u + 0.55 * u}" r="${0.55 * u}" fill="${i === 8 ? B.accent : B.ink}" opacity="${i === 8 ? 1 : 0.8}"/>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${face('Noto Sans SC', 'NotoSansSC-Black.otf', 900)}${face('Noto Sans SC', 'NotoSansSC-Bold.otf', 700)}${face('Inter Tight', 'InterTight-Variable.ttf', '100 900')}${face('JetBrains Mono', 'JetBrainsMono-Variable.ttf', '100 800')}${face('Space Grotesk', 'SpaceGrotesk-Variable.ttf', '300 700')}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{background:${B.ground};color:${B.ink};font-family:"Inter Tight","Space Grotesk","Noto Sans SC",sans-serif;position:relative}
.text{position:absolute;left:${pad}px;top:${(portrait ? pad : 0.078 * H)}px;width:${availW}px}
.eyebrow{font-family:"JetBrains Mono","Noto Sans SC",monospace;font-weight:600;letter-spacing:.08em;font-size:${fE}px;display:flex;align-items:center;gap:${fE * 0.6}px;white-space:nowrap}
.sq{display:inline-block;background:${B.accent};width:${fE * 0.7}px;height:${fE * 0.7}px;flex:none}
.t1{font-family:"Inter Tight","Space Grotesk","Noto Sans SC",sans-serif;font-weight:900;font-size:${fT}px;line-height:.86;letter-spacing:-.045em;margin-top:${0.036 * H}px;white-space:nowrap}
.hook{font-family:"Noto Sans SC",sans-serif;font-weight:900;font-size:${fH}px;line-height:1.05;margin-top:${0.025 * H}px;white-space:nowrap}
.hl{color:${B.accent}}
.rule{display:flex;align-items:center;margin-top:${0.04 * H}px;width:${Math.min(availW, portrait ? availW : 0.82 * availW)}px}
.rule i{display:block;background:${B.accent};width:${0.05 * Math.min(W, H)}px;height:${0.0125 * Math.min(W, H)}px}.rule b{display:block;flex:1;height:${Math.max(2, 0.0028 * H)}px;background:${B.ink}}
.sub{font-family:"Noto Sans SC",sans-serif;font-weight:700;font-size:${fS}px;margin-top:${0.028 * H}px;white-space:nowrap}
.fig{position:absolute;right:0;bottom:0;height:${figH}px;width:${figW}px}
.photo{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 5%),linear-gradient(to bottom,transparent 0,#000 4%);-webkit-mask-composite:source-in;mask-composite:intersect}
</style></head><body>
<svg style="position:absolute;right:${pad - 0.5 * u}px;top:${5.5 * u}px" width="${8.3 * u}" height="${8.3 * u}">${dots}</svg>
${fig ? `<img class="fig${photo ? ' photo' : ''}" src="file://${fig}">` : ''}
<div class="text">${label ? `<div class="eyebrow"><span class="sq"></span>${esc(label)}</div>` : ''}<div class="t1">${esc(t1)}</div>
${hooks.map(h => `<div class="hook">${mark(h)}</div>`).join('')}<div class="rule"><i></i><b></b></div>${c.subtitle ? `<div class="sub">${esc(c.subtitle)}</div>` : ''}</div>
</body></html>`
}
const html = STYLE === 'swiss' ? swiss : blockframe

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
for (const [name, W, H] of OUTS) {
  const htmlPath = path.join(OUT, `${name}.html`), png = path.join(OUT, `${name}.png`)
  fs.writeFileSync(htmlPath, html(W, H))
  fs.rmSync(png, { force: true })
  const shell = /headless-shell/.test(chrome)
  try {
    execFileSync(chrome, [...(shell ? [] : ['--headless=new']), '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=2000', `--window-size=${W},${H}`, `--screenshot=${png}`, `file://${htmlPath}`], { stdio: 'ignore', timeout: 45000 })
  } catch (e) { if (!fs.existsSync(png)) throw e }   // 截图已写出就算成功（个别 Chrome 截完不退出）
  files.push(png)
}
const yt = path.join(OUT, 'youtube-1280x720.png'), warn = fs.statSync(yt).size > 2 * 1024 * 1024 ? 'youtube-1280x720.png 超过 2MB，YouTube 会拒收：转成 JPG 再上传' : null
if (warn) console.error('! ' + warn)
console.log(JSON.stringify({ ok: true, style: STYLE, files, ip: ipPng, photo, ...(warn ? { warn } : {}) }))
