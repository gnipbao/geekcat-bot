#!/usr/bin/env node
// 封面：cover.json → covers/cover-{16x9,16x10,4x3,3x4,9x16}.png + covers/youtube-1280x720.png（超过 2MB 自动另存 JPG）
// 版式跟着 video.json 的主题走，cover.json 的 "style" 可以覆盖：
//   pop → blockframe 海报（色块标题 + 角色）· lab → swiss 瑞士极简 · night → 深色终端 · paper → 手账 · aurora → 极光 · bento → 便当格 · volt → 电光
// 人物图：brand.photo 品牌照片 > "figure": "camera"（从摄像头素材抽一帧，按人脸裁）> IP 角色定格图（ip.json / presenter.json 是 mascot 时）
// 平台对应：B站 cover-16x10 · YouTube youtube-1280x720 · 抖音 cover-9x16 + cover-3x4 · X cover-16x9
// 用法：node <skill>/scripts/covers.mjs [projectDir]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { fontFaceCSS } from './lib/fonts.mjs'
import { screenshot } from './lib/chrome.mjs'
import { loadPresenter, probe, faceFor } from './lib/project.mjs'
import { loadTheme } from './lib/theme.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(process.argv[2] || '.')
const fail = m => { console.error('✗ ' + m); process.exit(1) }
if (!fs.existsSync(path.join(ROOT, 'cover.json'))) fail(`${ROOT} 里没有 cover.json`)
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cover.json'), 'utf8'))
const vcfg = fs.existsSync(path.join(ROOT, 'video.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'video.json'), 'utf8')) : {}
const ALIAS = { pop: 'blockframe', blockframe: 'blockframe', lab: 'swiss', swiss: 'swiss', night: 'night', paper: 'paper', aurora: 'aurora', bento: 'bento', volt: 'volt' }
const STYLE = ALIAS[c.style || vcfg.theme || 'pop']
if (!STYLE) fail(`未知 style "${c.style}"，可用：pop（blockframe）、lab（swiss）、night、paper、aurora、bento、volt`)
const OUT = path.join(ROOT, 'covers'); fs.mkdirSync(path.join(OUT, 'ip'), { recursive: true })
const RATIOS = [['16x9', 1920, 1080], ['16x10', 1920, 1200], ['4x3', 1600, 1200], ['3x4', 1200, 1600], ['9x16', 1080, 1920]]
const OUTS = [...RATIOS.map(([n, W, H]) => [`cover-${n}`, W, H]), ['youtube-1280x720', 1280, 720]]
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const em = s => [...String(s)].reduce((w, ch) => w + (/[⺀-鿿豈-﫿＀-￯]/.test(ch) ? 1 : /[A-Z0-9]/.test(ch) ? 0.66 : /\s/.test(ch) ? 0.28 : 0.55), 0) || 1
const mark = s => esc(s).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')
const plain = s => String(s).replace(/\*/g, '')
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// 1) 人物图
const brand = c.brand || {}
const presenter = loadPresenter(ROOT)
let fig = null, figKind = null                 // photo：自带背景的照片；cutout：透明底的角色
if (brand.photo) {
  fig = path.resolve(ROOT, brand.photo); figKind = 'photo'
  if (!fs.existsSync(fig)) fail(`找不到 brand.photo：${fig}`)
} else if (c.figure === 'camera') {
  const src = presenter.src && path.join(ROOT, presenter.src)
  if (!src || !fs.existsSync(src)) fail('"figure": "camera" 需要 presenter.json 里的摄像头素材（先跑 ingest.py）')
  const m = probe(src), f = faceFor(ROOT, presenter.src, presenter.face), A = brand.photoAspect || 0.75
  let h = Math.min(m.height, Math.max(f.h * m.height * 3.4, m.height * 0.55)), w = h * A
  if (w > m.width) { w = m.width; h = w / A }
  const x0 = clamp(f.x * m.width - w / 2, 0, m.width - w), y0 = clamp(f.y * m.height - h * 0.36, 0, m.height - h)
  fig = path.join(OUT, 'ip', 'camera.png'); figKind = 'photo'
  execFileSync('ffmpeg', ['-v', 'error', '-ss', String(c.figureAt ?? 3), '-i', src, '-frames:v', '1', '-vf', `crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x0)}:${Math.round(y0)},scale=900:-2`, '-y', fig])
} else if (presenter.kind === 'mascot' && c.ip !== false) {
  const ip = c.ip || {}
  const tmp = path.join(OUT, 'ip', 'cover-pose.json')
  fs.writeFileSync(tmp, JSON.stringify({ width: 1200, height: 1200, fps: 30, background: 'transparent', cat: { x: 0.5, y: 0.99, scale: ip.scale || 1.22, flip: !!ip.flip },
    timeline: [{ at: 0, do: ip.do || 'happy', scene: ip.scene || null, accessories: ip.accessories || [], ...(ip.text ? { text: ip.text } : {}) }], duration: 5 }))
  const ipFile = fs.existsSync(path.join(ROOT, 'presenter.json')) ? 'presenter.json' : 'ip.json'
  const res = execFileSync('node', [path.join(HERE, 'ip.mjs'), 'still', '--ip', path.join(ROOT, ipFile), '--script', tmp, '--at', String(ip.at ?? 1.2), '--dir', path.join(OUT, 'ip')], { cwd: ROOT }).toString()
  fig = JSON.parse(res.trim().split('\n').pop()).files[0]; figKind = 'cutout'
}
const fonts = fontFaceCSS({ root: ROOT })
const head = (W, H, css) => `<!doctype html><html><head><meta charset="utf-8"><style>\n${fonts}\nhtml,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}\n${css}\n</style></head><body>`

// 2a) pop：BlockFrame 海报（色块标题 + 角色，居中构图）
const C = { pink: '#FE90E8', blue: '#C0F7FE', green: '#99E885', yellow: '#F7CB46', cream: '#FFDC8B' }
const chipColors = c.chipColors || [C.pink, C.yellow, C.blue]
function blockframe(W, H) {
  const portrait = H > W, u0 = Math.min(W, H) / 100
  const f = portrait ? Math.min(1, (H / W) / 1.78) : Math.min(1, (W / H) / 1.78), u = u0 * f
  const catPortrait = Math.max(40 * u0, Math.min(86 * u0, H - 74 * u))
  const [t1, ...rest] = c.title
  const t1Scale = Math.min(1, 3.2 / em(t1))
  const badge = c.badge ? `<div class="star badge">${esc(c.badge)}</div>` : ''
  const title = `<div class="t1wrap"><div class="chip t1" style="background:${chipColors[0]};transform:rotate(-3deg)">${esc(plain(t1))}</div>${badge}</div>` +
    rest.map((t, i) => `<div class="chip t2" style="background:${chipColors[(i + 1) % chipColors.length]};transform:rotate(${i % 2 ? -2 : 2}deg)">${esc(plain(t))}</div>`).join('')
  const figure = !fig ? '' : figKind === 'cutout' ? `<img class="ip" src="file://${fig}">`
    : `<img class="ip photo" src="file://${fig}" style="aspect-ratio:${brand.photoAspect || 0.75};object-fit:cover;border:${0.45 * u}px solid #000;box-shadow:${0.9 * u}px ${0.9 * u}px 0 #000;${portrait ? `width:${catPortrait * 0.75}px` : `height:${70 * H / 100}px`};transform:rotate(2deg)">`
  return head(W, H, `body{background:${c.ground || C.cream};font-family:Inter,"Noto Sans SC",sans-serif;position:relative}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(0,0,0,.28) ${0.18 * u}px,transparent ${0.2 * u}px);background-size:${3 * u}px ${3 * u}px;opacity:.6}
.ghost{position:absolute;font-weight:900;color:rgba(0,0,0,.08);font-size:${(portrait ? 34 : 40) * u}px;line-height:.8;letter-spacing:-.04em;white-space:nowrap;${portrait ? `left:-${4 * u}px;bottom:${2 * u}px` : `left:-${3 * u}px;bottom:-${4 * u}px`}}
.stripe{position:absolute;border:${0.35 * u}px solid #000;background:repeating-linear-gradient(45deg,#000 0 ${1.1 * u}px,${C.pink} ${1.1 * u}px ${2.4 * u}px)}
.star{position:absolute;border:${0.35 * u}px solid #000;clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:${portrait ? 2 * u : 3 * u}px;flex-direction:${portrait ? 'column' : 'row'};padding:${5 * u}px;box-sizing:border-box}
.text{display:flex;flex-direction:column;align-items:center;gap:${2.6 * u}px;text-align:center}
.pill{display:inline-block;padding:${0.9 * u}px ${2.4 * u}px;border:${0.35 * u}px solid #000;border-radius:999px;box-shadow:${0.45 * u}px ${0.45 * u}px 0 #000;background:#fff;font-family:"Space Grotesk","Noto Sans SC",sans-serif;font-weight:700;font-size:${3 * u}px;letter-spacing:.08em}
.chip{display:inline-block;border:${0.45 * u}px solid #000;box-shadow:${0.9 * u}px ${0.9 * u}px 0 #000;font-weight:900;white-space:nowrap}
.t1{font-size:${(portrait ? 26 : 25) * u * t1Scale}px;line-height:1;padding:${0.4 * u}px ${3.2 * u * t1Scale}px ${1.6 * u}px;letter-spacing:-.04em}
.t2{font-family:"Noto Sans SC",Inter,sans-serif;font-size:${(portrait ? 10.5 : 10) * u}px;padding:${0.8 * u}px ${2.6 * u}px}
.sub{font-family:"Noto Sans SC",sans-serif;font-weight:900;font-size:${4.6 * u}px;background:#000;color:#fff;padding:${1 * u}px ${2.4 * u}px;box-shadow:${0.7 * u}px ${0.7 * u}px 0 ${C.yellow}}
.ip{${portrait ? `width:${catPortrait}px` : `height:${82 * H / 100}px`};aspect-ratio:1;object-fit:contain;flex:none;margin-${portrait ? 'top' : 'left'}:-${2 * u}px}
.t1wrap{position:relative}
.badge{position:absolute;right:-${10 * u}px;top:-${7 * u}px;width:${17 * u}px;height:${17 * u}px;transform:rotate(12deg);display:flex;align-items:center;justify-content:center;font-family:"Noto Sans SC",sans-serif;font-weight:900;font-size:${4.2 * u}px;background:${C.green}}`) + `
<div class="dots"></div><div class="ghost">${esc(c.ghost || plain(t1))}</div>
<div class="stripe" style="left:${5 * u}px;top:${5 * u}px;width:${20 * u}px;height:${6 * u}px;transform:rotate(-6deg)"></div>
<div class="stripe" style="right:${5 * u}px;bottom:${5 * u}px;width:${16 * u}px;height:${5 * u}px;transform:rotate(8deg);background:repeating-linear-gradient(45deg,#000 0 ${1.1 * u}px,${C.blue} ${1.1 * u}px ${2.4 * u}px)"></div>
<div class="star" style="right:${portrait ? 8 * u : 6 * u}px;top:${portrait ? 6 * u : 7 * u}px;width:${11 * u}px;height:${11 * u}px;background:${C.yellow}"></div>
<div class="stage"><div class="text">${c.eyebrow ? `<div class="pill">${esc(c.eyebrow)}</div>` : ''}${title}${c.subtitle ? `<div class="chip sub">${esc(c.subtitle)}</div>` : ''}</div>
${figure}</div>
</body></html>`
}

// 2b) 编辑版式（lab / night / paper）：大号英文名 + 中文钩子（*…* 强调）+ 分隔线 + 一行数据；人物站在右侧（竖版在下方）
const LOOKS = {
  swiss: { ground: brand.ground || '#F2F0EC', ink: '#141414', soft: '#6B6B68', accent: brand.accent || '#E30613', texture: '',
    t1Font: '"Inter Tight","Space Grotesk","Noto Sans SC",sans-serif', t1Track: '-.045em', eyebrowFont: '"JetBrains Mono","Noto Sans SC",monospace',
    hl: a => `color:${a}`, marker: 'square', rule: 'bar', photo: 'feather', decor: 'dots' },
  night: { ground: '#0E0F11', ink: '#EDEBE6', soft: '#8E929B', accent: '#F7CB46', ok: '#3DDC84',
    texture: 'background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:SIZEpx SIZEpx',
    t1Font: '"JetBrains Mono","Noto Sans SC",monospace', t1Track: '-.06em', t1Em: s => [...s].reduce((w, ch) => w + (/[\u2e80-\u9fff]/.test(ch) ? 1 : 0.55), 0) + 0.55, eyebrowFont: '"JetBrains Mono","Noto Sans SC",monospace',
    hl: a => `background:${a};color:#0E0F11;padding:0 .1em;box-decoration-break:clone`, marker: 'dot', rule: 'bar', photo: 'card', decor: 'cursor',
    cutoutFilter: loadTheme('night').json.mascotFilter },
  paper: { ground: '#FBF8F1', ink: '#222222', soft: '#6E6A63', accent: '#E8590C', mark: '#FFE066',
    texture: 'background-image:radial-gradient(rgba(0,0,0,.22) 1.4px,transparent 1.6px);background-size:SIZEpx SIZEpx',
    t1Font: '"Inter Tight","Noto Sans SC",sans-serif', t1Track: '-.04em', eyebrowFont: '"Caveat","Long Cang","Noto Sans SC",cursive',
    hl: () => 'background:linear-gradient(transparent 50%,#FFE066 50%,#FFE066 92%,transparent 92%);padding:0 .06em', marker: 'none', rule: 'squiggle', photo: 'polaroid', decor: 'tape' },
  aurora: { ground: '#07080B', ink: '#EEF0F6', soft: '#8D92A6', accent: '#8B7CFF', grad: 'linear-gradient(92deg,#A78BFF 0%,#6CA8FF 50%,#5CE1E6 100%)',
    bg: u => `<div style="position:absolute;inset:0;background:radial-gradient(52% 50% at 84% -4%,rgba(124,92,255,.42),transparent 72%),radial-gradient(44% 42% at -2% 104%,rgba(40,170,255,.26),transparent 72%)"></div><div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:${6 * u}px ${6 * u}px;-webkit-mask-image:radial-gradient(ellipse 78% 68% at 50% 32%,#000 8%,transparent 78%)"></div>`,
    t1Font: '"Geist","Inter Tight","Noto Sans SC",sans-serif', t1Track: '-.05em', t1Weight: 800, eyebrowFont: '"JetBrains Mono","Noto Sans SC",monospace', eyebrowColor: '#8D92A6',
    hl: () => 'background:linear-gradient(92deg,#A78BFF 0%,#6CA8FF 50%,#5CE1E6 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent', marker: 'grad', rule: 'bar', ruleInk: 'rgba(255,255,255,.16)',
    subColor: '#B4B8C8', photo: 'card', cardCSS: u => `border:1px solid rgba(255,255,255,.18);border-radius:${3 * u}px;box-shadow:0 ${3 * u}px ${8 * u}px rgba(0,0,0,.6),0 0 0 1px rgba(139,124,255,.3),0 0 ${8 * u}px rgba(108,168,255,.25)`, decor: 'none',
    cutoutFilter: loadTheme('aurora').json.mascotFilter },
  bento: { ground: '#F5F5F7', ink: '#1D1D1F', soft: '#6E6E73', accent: '#0071E3', grad: 'linear-gradient(92deg,#0A84FF 0%,#7D5CFF 52%,#FF4F9A 100%)',
    bg: () => `<div style="position:absolute;inset:0;background:radial-gradient(58% 52% at 90% -12%,rgba(10,132,255,.16),transparent 70%),radial-gradient(50% 46% at -4% 112%,rgba(255,79,154,.13),transparent 70%)"></div>`,
    t1Font: '"Geist","Inter Tight","Noto Sans SC",sans-serif', t1Track: '-.05em', t1Weight: 800, eyebrowFont: '"Geist","Noto Sans SC",sans-serif', eyebrowColor: '#6E6E73', eyebrowTrack: '.01em',
    hl: () => 'background:linear-gradient(92deg,#0A84FF 0%,#7D5CFF 52%,#FF4F9A 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent', marker: 'grad', rule: 'none',
    subColor: '#6E6E73', photo: 'card', cardCSS: u => `border-radius:${5 * u}px;box-shadow:0 ${0.3 * u}px ${0.6 * u}px rgba(0,0,0,.06),0 ${3 * u}px ${8 * u}px rgba(0,0,0,.16)`, decor: 'none' },
  volt: { ground: '#0A0A0A', ink: '#F4F4F0', soft: '#8A8A84', accent: '#C8FF2E',
    bg: u => `<div style="position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.12) ${0.1 * u}px,transparent ${0.13 * u}px);background-size:${2.6 * u}px ${2.6 * u}px"></div>`,
    t1Font: '"Smiley Sans","Inter Tight","Noto Sans SC",sans-serif', t1Track: '0', t1Weight: 400, hookFont: '"Smiley Sans","Noto Sans SC",sans-serif', hookWeight: 400,
    eyebrowFont: '"JetBrains Mono","Noto Sans SC",monospace', hl: a => `background:${a};color:#0A0A0A;padding:0 .14em;border-radius:.06em;box-decoration-break:clone`, marker: 'slash', rule: 'bar', ruleInk: '#303030',
    subFont: '"JetBrains Mono","Noto Sans SC",monospace', subColor: '#8A8A84', subPrefix: true, photo: 'card', cardCSS: u => `border:${0.25 * u}px solid #C8FF2E;border-radius:${0.6 * u}px`, decor: 'barcode',
    cutoutFilter: loadTheme('volt').json.mascotFilter },
}
function editorial(W, H, L) {
  const portrait = H > W, u = Math.min(W, H) / 100, pad = 8 * u
  const aspect = figKind === 'photo' ? (brand.photoAspect || (c.figure === 'camera' ? 0.75 : 0.735)) : 1
  const framed = figKind === 'photo' && L.photo !== 'feather'
  const [t1, ...hooks] = c.title
  const label = [brand.label, c.eyebrow].filter(Boolean).join(' · ')
  const fit = (s, w, cap) => Math.min(cap, w / em(s))
  let figH, availW
  if (portrait) availW = W - 2 * pad
  else { figH = H * (framed ? 0.78 : 0.96); availW = W - (fig ? figH * aspect + (framed ? pad : 0) : 0) - pad - 2 * u }
  const capT = portrait ? 0.2 * H : 0.405 * H, capH = portrait ? 0.075 * H : 0.128 * H, capS = portrait ? 0.028 * H : 0.047 * H
  const fT = Math.min(capT, availW / (L.t1Em ? L.t1Em(plain(t1)) : em(plain(t1)))),   // 等宽字更宽，另外量
       fH = hooks.length ? Math.min(...hooks.map(h => fit(plain(h), availW, capH)), capH) : 0, fS = c.subtitle ? fit(c.subtitle, availW * 0.95, capS) : 0
  const fE = Math.max(16, (portrait ? 0.016 : 0.028) * H) * (L.marker === 'none' ? 1.35 : 1)
  const textH = pad + fE * 1.4 + 0.036 * H + fT * 0.86 + hooks.length * (fH * 1.05 + 0.025 * H) + 0.04 * H + (fS ? fS * 1.5 + 0.03 * H : 0)
  if (portrait) figH = Math.max(0.36 * H, Math.min(framed ? 0.5 * H : 0.62 * H, H - textH - (framed ? pad : 0)))
  const figW = figH * aspect
  const ruleW = Math.min(availW, portrait ? availW : 0.82 * availW)
  const dots = Array.from({ length: 9 }, (_, i) => `<circle cx="${(i % 3) * 3.6 * u + 0.55 * u}" cy="${Math.floor(i / 3) * 3.6 * u + 0.55 * u}" r="${0.55 * u}" fill="${i === 8 ? L.accent : L.ink}" opacity="${i === 8 ? 1 : 0.8}"/>`).join('')
  const decor = { dots: `<svg style="position:absolute;right:${pad - 0.5 * u}px;top:${5.5 * u}px" width="${8.3 * u}" height="${8.3 * u}">${dots}</svg>`,
    cursor: '', barcode: `<div style="position:absolute;right:${pad}px;top:${5.5 * u}px;width:${17 * u}px;height:${5 * u}px;background:repeating-linear-gradient(90deg,${L.accent} 0 ${0.3 * u}px,transparent ${0.3 * u}px ${0.7 * u}px,${L.accent} ${0.7 * u}px ${0.8 * u}px,transparent ${0.8 * u}px ${1.4 * u}px,${L.accent} ${1.4 * u}px ${1.9 * u}px,transparent ${1.9 * u}px ${2.3 * u}px)"></div>`, tape: `<div style="position:absolute;right:${6 * u}px;top:${3 * u}px;width:${16 * u}px;height:${4.2 * u}px;transform:rotate(8deg);background:repeating-linear-gradient(90deg,rgba(255,214,90,.9) 0 ${1.4 * u}px,rgba(255,236,170,.9) ${1.4 * u}px ${2.8 * u}px)"></div>` }[L.decor] || ''
  const markerHTML = { square: `<span style="display:inline-block;background:${L.accent};width:${fE * 0.7}px;height:${fE * 0.7}px;flex:none"></span>`,
    dot: `<span style="display:inline-block;background:${L.ok};width:${fE * 0.6}px;height:${fE * 0.6}px;border-radius:50%;box-shadow:0 0 ${fE * 0.5}px ${L.ok};flex:none"></span>`,
    grad: `<span style="display:inline-block;background:${L.grad};width:${fE * 0.6}px;height:${fE * 0.6}px;border-radius:50%;flex:none"></span>`,
    slash: `<span style="color:${L.accent};font-weight:800">//</span>`, none: '' }[L.marker]
  const rule = L.rule === 'squiggle'
    ? `<svg class="rule" width="${ruleW}" height="${2.2 * u}" viewBox="0 0 ${ruleW} ${2.2 * u}"><path d="${Array.from({ length: Math.ceil(ruleW / (4 * u)) + 1 }, (_, i) => `${i ? 'Q' : 'M'}${i ? `${(i - 0.5) * 4 * u} ${i % 2 ? 0.2 * u : 2 * u} ` : ''}${i * 4 * u} ${1.1 * u}`).join(' ')}" fill="none" stroke="${L.accent}" stroke-width="${0.35 * u}" stroke-linecap="round"/></svg>`
    : L.rule === 'none' ? '' : `<div class="rule"><i></i><b></b></div>`
  let figHTML = ''
  if (fig) {
    const pos = portrait ? `left:${(W - figW) / 2}px;bottom:${framed ? pad : 0}px` : `right:${framed ? pad : 0}px;bottom:${framed ? (H - figH) / 2 : 0}px`
    if (!framed) figHTML = `<img src="file://${fig}" style="position:absolute;${portrait ? `right:0;bottom:0` : 'right:0;bottom:0'};height:${figH}px;width:${figW}px;object-fit:${figKind === 'cutout' ? 'contain' : 'cover'};${figKind === 'photo' ? '-webkit-mask-image:linear-gradient(to right,transparent 0,#000 5%),linear-gradient(to bottom,transparent 0,#000 4%);-webkit-mask-composite:source-in;mask-composite:intersect;' : ''}${L.cutoutFilter && figKind === 'cutout' ? `filter:${L.cutoutFilter};` : ''}">`
    else if (L.photo === 'card') figHTML = `<img src="file://${fig}" style="position:absolute;${pos};height:${figH}px;width:${figW}px;object-fit:cover;box-sizing:border-box;${L.cardCSS ? L.cardCSS(u) : `border:2px solid #383C44;border-radius:${2.4 * u}px;box-shadow:0 ${2 * u}px ${6 * u}px rgba(0,0,0,.6),0 0 0 ${0.6 * u}px rgba(247,203,70,.12)`}">`
    else figHTML = `<div style="position:absolute;${pos};height:${figH}px;width:${figW}px;padding:${1.4 * u}px ${1.4 * u}px ${5 * u}px;background:#fff;box-sizing:border-box;transform:rotate(-2.5deg);box-shadow:${0.5 * u}px ${0.8 * u}px 0 #222;border:2px solid #222"><img src="file://${fig}" style="width:100%;height:100%;object-fit:cover;display:block"><div style="position:absolute;left:30%;top:-${1.6 * u}px;width:40%;height:${3.6 * u}px;transform:rotate(3deg);background:rgba(255,224,102,.85)"></div></div>`
  }
  const tex = L.bg ? L.bg(u) : L.texture ? `<div style="position:absolute;inset:0;${L.texture.replaceAll('SIZE', String(Math.round(L.marker === 'dot' ? 6 * u : 4 * u)))}"></div>` : ''
  return head(W, H, `body{background:${L.ground};color:${L.ink};font-family:${L.t1Font};position:relative}
.text{position:absolute;left:${pad}px;top:${(portrait ? pad : 0.078 * H)}px;width:${availW}px}
.eyebrow{font-family:${L.eyebrowFont};font-weight:${L.marker === 'none' ? 700 : 600};letter-spacing:${L.eyebrowTrack ?? (L.marker === 'none' ? 0 : '.08em')};font-size:${fE}px;display:flex;align-items:center;gap:${fE * 0.6}px;white-space:nowrap;color:${L.eyebrowColor || (L.marker === 'none' ? L.accent : L.ink)}}
.t1{font-family:${L.t1Font};font-weight:${L.t1Weight || 900};font-size:${fT}px;line-height:.86;letter-spacing:${L.t1Track};margin-top:${0.036 * H}px;white-space:nowrap}
.t1 .cur{display:inline-block;width:.42em;height:.72em;background:${L.accent};margin-left:.08em;vertical-align:baseline}
.hook{font-family:${L.hookFont || '"Noto Sans SC",sans-serif'};font-weight:${L.hookWeight || 900};font-size:${fH}px;line-height:1.08;margin-top:${0.025 * H}px;white-space:nowrap}
.hl{${L.hl(L.accent)}}
.rule{display:flex;align-items:center;margin-top:${0.04 * H}px;width:${ruleW}px}
.rule i{display:block;background:${L.grad || L.accent};width:${0.05 * Math.min(W, H)}px;height:${0.0125 * Math.min(W, H)}px}.rule b{display:block;flex:1;height:${Math.max(2, 0.0028 * H)}px;background:${L.ruleInk || (L.marker === 'dot' ? '#383C44' : L.ink)}}
.sub{font-family:${L.subFont || (L.marker === 'dot' ? '"JetBrains Mono","Noto Sans SC",monospace' : '"Noto Sans SC",sans-serif')};font-weight:700;font-size:${fS}px;margin-top:${(L.rule === 'none' ? 0.045 : 0.028) * H}px;white-space:nowrap;color:${L.subColor || (L.marker === 'dot' ? L.soft : L.ink)}}
.sub b{color:${L.accent};margin-right:.4em}`) + `
${tex}${decor}${figHTML}
<div class="text">${label ? `<div class="eyebrow">${markerHTML}${esc(label)}</div>` : ''}<div class="t1">${esc(plain(t1))}${L.decor === 'cursor' ? '<span class="cur"></span>' : ''}</div>
${hooks.map(h => `<div class="hook">${mark(h)}</div>`).join('')}${rule}${c.subtitle ? `<div class="sub">${(L.subPrefix ?? L.marker === 'dot') ? '<b>›</b>' : ''}${esc(c.subtitle)}</div>` : ''}</div>
</body></html>`
}

// 3) 截图
const html = (W, H) => STYLE === 'blockframe' ? blockframe(W, H) : editorial(W, H, LOOKS[STYLE])
const files = []
for (const [name, W, H] of OUTS) {
  const htmlPath = path.join(OUT, `${name}.html`), png = path.join(OUT, `${name}.png`)
  fs.writeFileSync(htmlPath, html(W, H))
  files.push(screenshot(htmlPath, png, W, H))
}
// YouTube 缩略图不能超过 2MB：超了就另存一张 JPG
const yt = path.join(OUT, 'youtube-1280x720.png')
let ytUpload = yt
if (fs.statSync(yt).size > 2 * 1024 * 1024) {
  ytUpload = path.join(OUT, 'youtube-1280x720.jpg')
  execFileSync('ffmpeg', ['-v', 'error', '-i', yt, '-q:v', '3', '-y', ytUpload]); files.push(ytUpload)
}
console.log(JSON.stringify({ ok: true, style: STYLE, figure: figKind ? { kind: figKind, file: fig } : null, files, youtube: ytUpload,
  platforms: { bilibili: 'cover-16x10.png', youtube: path.basename(ytUpload), douyin: ['cover-9x16.png', 'cover-3x4.png'], x: 'cover-16x9.png' } }))
