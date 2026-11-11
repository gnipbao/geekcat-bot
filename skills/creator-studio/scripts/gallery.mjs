#!/usr/bin/env node
// 主题对比图：每套主题 × 讲解 / 录屏教程 / 口播 / 竖版，各出一帧静态样张 + 一张总览，挑主题、改主题时用。
// 用法：node <skill>/scripts/gallery.mjs [-o 目录] [--themes lab,night] [--screen 录屏.mp4|png] [--camera 摄像头.mp4|png] [--mascot 角色.png]
//   --screen / --camera 给视频就自动抽一帧；不给就用占位图。墨墨定格图默认用 ip.json 的 still 命令现做。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadTheme, THEMES, captionCSS } from './lib/theme.mjs'
import { fontFaceCSS } from './lib/fonts.mjs'
import { screenshot } from './lib/chrome.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url)), SKILL = path.resolve(HERE, '..')
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1] }
const OUT = path.resolve(opt('o', argv.includes('-o') ? argv[argv.indexOf('-o') + 1] : 'theme-gallery'))
const themes = (opt('themes') || THEMES.join(',')).split(',')
fs.mkdirSync(OUT, { recursive: true })
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-gallery-'))
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// 素材：视频抽一帧；不给就用占位
function still(src, at, name) {
  if (!src) return null
  const f = path.resolve(src)
  if (/\.(png|jpe?g|webp)$/i.test(f)) return f
  const png = path.join(TMP, name + '.png')
  execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', f, '-frames:v', '1', '-y', png])
  return png
}
const screenImg = still(opt('screen'), 20, 'screen'), cameraImg = still(opt('camera'), 6, 'camera')
let mascot = opt('mascot') ? path.resolve(opt('mascot')) : null
if (!mascot) {
  try {
    const pose = path.join(TMP, 'pose.json')
    fs.writeFileSync(pose, JSON.stringify({ width: 1200, height: 1200, fps: 30, background: 'transparent', cat: { x: 0.5, y: 0.99, scale: 1.2 }, timeline: [{ at: 0, do: 'talk', accessories: ['glasses'] }], duration: 5 }))
    const res = execFileSync('node', [path.join(HERE, 'ip.mjs'), 'still', '--ip', path.join(SKILL, 'templates/ip/geekcat.ip.json'), '--script', pose, '--at', '1.3', '--dir', TMP]).toString()
    mascot = JSON.parse(res.trim().split('\n').pop()).files[0]
  } catch { mascot = null }
}
const img = (f, style, ph) => f ? `<img src="file://${f}" style="${style}">` : `<div style="${style}; display:flex; align-items:center; justify-content:center; background:repeating-linear-gradient(45deg,#2a2d33 0 18px,#24272c 18px 36px); color:#9aa0a8; font:600 40px/1 'JetBrains Mono',monospace;">${ph}</div>`

const rot = (th, d) => `transform:rotate(${d * (th.json.tilt ?? 1)}deg);`   // 倾斜跟主题走
const capSample = (spoken, active, rest) => `<div id="cap-card" style="display:inline-block">${[...spoken].map(c => `<span class="s">${esc(c)}</span>`).join('')}<span class="a">${esc(active)}</span>${[...rest].map(c => `<span>${esc(c)}</span>`).join('')}</div>`
const caption = (t, bottom = 34, size = 48, left = 120, width = 1400) => `<div style="position:absolute; left:${left}px; width:${width}px; bottom:${bottom}px; display:flex; justify-content:center; z-index:60;">${t}</div>`
const pipFrame = (th, x, y, s, round) => `<div style="position:absolute; left:${x}px; top:${y}px; width:${s}px; height:${s}px; box-sizing:border-box; overflow:hidden; border-style:solid; ${th.json.presenter.frame} border-width:${th.json.presenter.bw}px; border-radius:${round};">${img(cameraImg, 'width:100%; height:100%; object-fit:cover; object-position:50% 28%; display:block', '摄像头')}</div>`

// 四种样张（1920×1080，竖版 1080×1920）。只用主题原子 + 语义变量，换主题不改标记
function explainer(th) {
  return `<div class="ground"></div><div class="dots"></div>
  <div class="ghost" style="right:-40px; bottom:-40px; font-size:300px;">AGENT</div>
  <div class="stripe" style="right:170px; top:54px; width:190px; height:56px; ${rot(th, -6)}"></div>
  <div class="pill" style="left:60px; top:50px;"><b>03</b>· 它是什么</div>
  <div style="position:absolute; left:80px; top:150px; width:1150px;">
    <h2 class="h-md" style="font-family:var(--font-cjk-display); font-size:54px;">专为 AI 智能体打造的</h2>
    <h2 class="h-md" style="font-family:var(--font-cjk-display); font-size:78px; margin-top:8px;"><span class="hl">逆向工程 MCP 服务器</span></h2>
  </div>
  <div class="card" style="left:80px; top:430px; width:360px; height:250px; padding:26px 30px; ${rot(th, -1.5)}">
    <div class="label">GitHub Stars</div>
    <div style="font-family:var(--font-display); font-weight:900; font-size:78px; letter-spacing:-.03em; margin-top:18px;">146,188</div>
    <div class="body muted" style="font-size:26px;">半年涨到十四万</div></div>
  <div class="card" style="left:480px; top:448px; width:380px; height:250px; padding:26px 30px; background:var(--blue); ${rot(th, 1.2)}">
    <div class="label">能分析</div>
    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:18px;">${['macOS App', 'Electron', 'Android APK', 'WebAssembly', '固件'].map(t => `<span class="tag" style="background:var(--surface); font-size:20px;">${t}</span>`).join('')}</div></div>
  <div class="card code" style="left:900px; top:430px; width:430px; height:250px; padding:24px 28px; font-size:24px; line-height:1.7; border-color:var(--border);">
    <div style="opacity:.6">$ npx rea-agents setup</div><div>✓ MCP server ready</div><div style="color:var(--mark)">→ 3 tools registered</div></div>
  <div style="position:absolute; left:80px; top:770px; display:flex; gap:18px;"><span class="step"><b>1</b>装 Node 22</span><span class="step"><b>2</b>一行命令</span><span class="step"><b>3</b>重启智能体</span></div>
  ${mascot ? `<img src="file://${mascot}" style="position:absolute; right:30px; bottom:0; height:600px;${th.json.mascotFilter ? ` filter:${th.json.mascotFilter};` : ''}">` : ''}
  ${caption(capSample('它是给 AI 智能体用的', '逆', '向工程服务器'))}`
}
function tutorial(th) {
  return `<div class="ground"></div><div class="dots"></div>
  <div class="window" style="left:79px; top:56px; width:1415px; height:848px;">
    <div class="window-bar"><i></i><i></i><i></i><span>Location Scout — 上海外滩 (31.24, 121.48)</span></div>
    <div style="position:absolute; left:0; right:0; top:52px; bottom:0; overflow:hidden; background:#000;">${img(screenImg, 'width:100%; height:100%; object-fit:cover; display:block', '录屏')}</div>
    <div class="speed" style="position:absolute; right:18px; top:70px;">⏩ 4×</div>
  </div>
  <div class="spot" style="left:130px; top:190px; width:560px; height:120px;"></div>
  <div class="callout" style="left:130px; top:190px; width:560px; height:120px;"><div class="callout-label">① 输入坐标</div></div>
  <div class="keys" style="position:absolute; left:110px; top:770px;"><span class="keycap">⌘</span>+<span class="keycap">K</span><span class="note" style="margin-left:18px; font-size:40px;">打开命令面板</span></div>
  ${pipFrame(th, 1574, 734, 292, th.json.presenter.pipRadius === '50%' ? '50%' : th.json.presenter.pipRadius)}
  ${caption(capSample('先在这里输入', '外', '滩的坐标'))}`
}
function talk(th) {
  return `<div style="position:absolute; inset:0; background:#000;">${img(cameraImg, 'width:100%; height:100%; object-fit:cover; object-position:50% 32%; display:block', '摄像头（全屏口播）')}</div>
  <div class="lower-third"><div class="lt-name">猫哥</div><div class="lt-role">前腾讯 / 百度程序员 · AI 实战</div></div>
  <div class="kw" style="position:absolute; right:110px; top:150px; ${rot(th, -3)}">一行命令装好</div>
  <div class="note" style="position:absolute; right:150px; top:265px; color:var(--mark); text-shadow:0 2px 8px rgba(0,0,0,.6);">↑ 真的就一行</div>
  ${caption(capSample('今天这个工具', '真', '的一行命令就装好'))}`
}
function vertical(th) {
  const st = { x: 40, y: 330, w: 1000, h: 562.5 }, bw = th.json.presenter.bw
  return `<div class="ground"></div><div class="dots"></div>
  <div class="pill" style="left:60px; top:78px;">知识猫AI实验室 · 开源实测</div>
  <div style="position:absolute; left:60px; top:150px; width:960px; font-family:var(--font-cjk-display); font-weight:900; font-size:62px; line-height:1.12;">REA · 逆向一切</div>
  <div class="label" style="position:absolute; left:60px; top:262px; font-size:26px; color:var(--muted);">03 · 它是什么</div>
  <div class="card" style="left:${st.x - bw}px; top:${st.y - bw}px; width:${st.w + 2 * bw}px; height:${st.h + 2 * bw}px; background:#000;"></div>
  <div class="frame" style="position:absolute; left:${st.x}px; top:${st.y}px; width:1920px; height:1080px; transform:scale(${st.w / 1920}); transform-origin:0 0; overflow:hidden;">${explainer(th).replace(/<div style="position:absolute; left:120px; width:1400px;[\s\S]*$/, '')}</div>
  <div style="position:absolute; left:60px; top:940px; width:960px; height:540px; box-sizing:border-box; overflow:hidden; border-style:solid; ${th.json.presenter.frame} border-width:${bw}px; border-radius:${th.json.presenter.radius};">${img(cameraImg, 'width:100%; height:100%; object-fit:cover; object-position:50% 30%; display:block', '主讲（摄像头 / 墨墨 / 数字人）')}</div>
  ${caption(capSample('它是给 AI', '智', '能体用的'), 450, 58, 60, 960)}
  <div class="label" style="position:absolute; left:60px; bottom:240px; font-size:22px; color:var(--muted);">↓ 平台标题 / 按钮区，不放内容</div>`
}

const FRAMES = [['explainer', 1920, 1080, explainer], ['tutorial', 1920, 1080, tutorial], ['talk', 1920, 1080, talk], ['vertical', 1080, 1920, vertical]]
const fonts = fontFaceCSS({})
const out = []
for (const name of themes) {
  const th = loadTheme(name)
  for (const [kind, W, H, fn] of FRAMES) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
${th.css('.frame')}
.frame{width:${W}px;height:${H}px}
${captionCSS(th, kind === 'vertical' ? 58 : 48)}
#cap-card{transform:none}
</style></head><body><div class="frame">${fn(th)}</div></body></html>`
    const f = path.join(TMP, `${name}-${kind}.html`)
    fs.writeFileSync(f, html)
    out.push(screenshot(f, path.join(OUT, `${name}-${kind}.png`), W, H))
  }
}
// 总览：每行一套主题（讲解 / 教程 / 口播 / 竖版）
const rowH = 300, cell = (f, w) => `<img src="file://${f}" style="height:${rowH}px; width:${w}px; display:block; border-radius:6px;">`
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
body{margin:0;background:#1b1b1d;color:#eee;font:600 30px "Noto Sans SC",sans-serif;padding:30px}
.row{display:flex;align-items:center;gap:18px;margin-bottom:26px}.name{width:170px;flex:none}.name small{display:block;font:400 18px "Noto Sans SC";color:#9a9a9a;margin-top:6px}
</style></head><body>${themes.map(n => { const j = loadTheme(n).json; return `<div class="row"><div class="name">${n}<small>${esc(j.label)}</small></div>${FRAMES.map(([k, W, H]) => cell(path.join(OUT, `${n}-${k}.png`), Math.round(rowH * W / H))).join('')}</div>` }).join('')}</body></html>`
const sf = path.join(TMP, 'sheet.html'), SW = 30 * 2 + 170 + 18 * 4 + Math.round(rowH * 16 / 9) * 3 + Math.round(rowH * 9 / 16), SH = 30 * 2 + themes.length * (rowH + 26)
fs.writeFileSync(sf, sheet)
const overview = screenshot(sf, path.join(OUT, 'themes.png'), SW, SH)
fs.rmSync(TMP, { recursive: true, force: true })
console.log(JSON.stringify({ ok: true, themes, overview, files: out, mascot: !!mascot, screen: !!screenImg, camera: !!cameraImg }))
