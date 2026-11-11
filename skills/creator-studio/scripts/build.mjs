#!/usr/bin/env node
// 构建：video.json + narration/scenes.json + build/scenes/sNN.html（+ screen.json、presenter.json / ip.json、presenter/track.json）
//   → compositions/*.html + index.html（主版本：横版、烧字幕，B站 / X）
//   → variants/clean/（横版不烧字幕，YouTube 上传 captions.srt）、variants/vertical/（竖版 1080×1920，抖音 / 视频号 / Shorts）
// 用法：node <skill>/scripts/build.mjs [projectDir] [--variants clean,vertical|all|none]
//   不写 --variants 时按 video.json.platforms 决定：youtube → clean，douyin / shorts / channels → vertical
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadProject, probe, faceFor } from './lib/project.mjs'
import { fontFaceCSS } from './lib/fonts.mjs'
import { sceneHTML, captionsHTML, presenterHTML, mascotStage, chaptersHTML, screenHTML, backdropHTML, vheaderHTML, rootHTML } from './lib/layers.mjs'
import { collectSfx, ensureSfxKit } from './lib/sfx.mjs'
import { V_LAYOUT } from './lib/geometry.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const KIT = path.resolve(HERE, '../kit')
const argv = process.argv.slice(2)
const opt = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1] }
const ROOT = path.resolve(argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--variants') || '.')
const fail = m => { console.error('✗ ' + m); process.exit(1) }

let P
try { P = loadProject(ROOT) } catch (e) { fail(e.message) }
const { cfg, scenes, W, H, TOTAL, theme, presenter, track, screen, format } = P
const pad = id => String(id).padStart(2, '0')
const prelude = fs.readFileSync(path.join(KIT, 'prelude.js'), 'utf8')
const ledgerPath = path.join(ROOT, 'terminal/ledger.json')
const ledger = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : 'null'
const TRANS = cfg.transitions || {}
const GROUND = cfg.ground || {}
const sid = s => 's' + pad(s.id)
const trans = i => i === 0 ? 'none' : (TRANS[pad(scenes[i].id)] || (format === 'explainer' ? theme.json.transition || 'push' : 'fade'))   // 叠加层默认淡入淡出
// 讲解默认用主题的底色序列；教程 / 口播的场景默认透明，露出下面的录屏和人像
const defaultGround = format === 'explainer' ? undefined : 'none'
const slots = scenes.map((s, i) => {
  const A = i === 0 ? 0 : +(s.start - 0.5).toFixed(3)
  const E = i + 1 < scenes.length ? scenes[i + 1].start : TOTAL
  const next = i + 1 < scenes.length ? trans(i + 1) : 'none'
  const spec = GROUND[pad(s.id)] ?? defaultGround
  return { id: sid(s), A, D: +(E - A).toFixed(3), IN: trans(i), OUT: next === 'blur' ? 'none' : next, ground: theme.resolveGround(spec, i) }
})
const missing = slots.filter(sl => !fs.existsSync(path.join(ROOT, 'build/scenes', sl.id + '.html'))).map(sl => sl.id)
const capPath = path.join(ROOT, 'narration/captions.json')
const CAPTIONS = cfg.captions !== false && fs.existsSync(capPath)
const isVideoPresenter = ['camera', 'avatar'].includes(presenter.kind)
// IP 角色的两种出场方式：overlay（老样子，站在场景上面自由走位）/ stage（像真人主播：装在画框里，有演播背景，全屏 / 侧栏 / 小窗 / 跳推都跟真人一样）
// 没写 display 时：讲解 = overlay，教程 / 口播 = stage
const STAGE = presenter.kind === 'mascot' && (presenter.display ? presenter.display === 'stage' : format !== 'explainer')
const framed = isVideoPresenter || STAGE
// 角色的"机位"：一张 1920×1080 的画布，角色半身居中；face 是脸的位置（小窗 / 侧栏 / 推近都围着它）。presenter.json 的 camera 可以覆盖
const CAM = { w: 1920, h: 1080, cat: { x: 0.5, y: 1.2, scale: 1.5 }, face: { x: 0.44, y: 0.41, w: 0.3, h: 0.45 }, ...(presenter.camera || {}) }
// 音效：教程 / 口播默认开（按场景里的动效自动配），讲解默认关；video.json 的 "sfx": false / true / { "volume": 0.8 }
const SFX_ON = cfg.sfx === undefined ? format !== 'explainer' : !!cfg.sfx
const sfxVol = (cfg.sfx && cfg.sfx.volume) || 1

// 要构建哪些变体
const VARIANTS = ['master']
const vflag = opt('variants')
if (vflag === 'all') VARIANTS.push('clean', 'vertical')
else if (vflag && vflag !== 'none') VARIANTS.push(...vflag.split(',').map(s => s.trim()).filter(v => v && v !== 'master'))
else if (!vflag) {
  const pf = P.platforms
  if (pf.includes('youtube')) VARIANTS.push('clean')
  if (pf.some(p => ['douyin', 'shorts', 'channels', 'xiaohongshu'].includes(p))) VARIANTS.push('vertical')
}
for (const v of VARIANTS) if (!['master', 'clean', 'vertical'].includes(v)) fail(`未知变体 "${v}"，可用：clean、vertical、all、none`)

// 音效表：从场景源码里的动效调用（slam / popIn / flash …，时间写成 c(秒)）、换场、主讲版式切换里自动收集，再稀疏化
let sfxCues = []
if (SFX_ON) {
  ensureSfxKit(path.join(ROOT, 'assets/sfx'), path.join(HERE, 'sfx.sh'))
  const sources = slots.filter(sl => !missing.includes(sl.id)).map(sl => fs.readFileSync(path.join(ROOT, 'build/scenes', sl.id + '.html'), 'utf8'))
  sfxCues = collectSfx({ sources, slots, track: framed ? track : [], total: TOTAL }).map(c => ({ ...c, src: `assets/sfx/${c.file}`, volume: +(c.volume * sfxVol).toFixed(3) }))
}
const bgm = cfg.bgm ? (typeof cfg.bgm === 'string' ? { src: cfg.bgm } : cfg.bgm) : null
if (bgm && !fs.existsSync(path.join(ROOT, bgm.src))) fail(`video.json 的 bgm 找不到：${bgm.src}`)

// 变体根目录：index.html + compositions 重新生成，素材用硬链接（不占空间；HyperFrames / FrameVelo 只认 index.html 当入口）
const MEDIA_DIRS = ['assets', 'narration', 'footage', 'presenter']
function linkTree(src, dst) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    if (e.isDirectory()) { linkTree(s, d); continue }
    fs.rmSync(d, { force: true })
    try { fs.linkSync(s, d) } catch { fs.copyFileSync(s, d) }
  }
}
function writeFresh(f, content) { fs.rmSync(f, { force: true }); fs.writeFileSync(f, content) }   // 先删再写：不能写穿硬链接
// 角色剧本的口型音频还没有（没配音就先搭画面、仓库里的示例）：不对口型照样出角色，而不是整层生成失败
function dropMissingLipsync(script, file) {
  if (!script.lipsync || fs.existsSync(path.resolve(path.dirname(file), script.lipsync))) return
  console.error(`! 找不到口型音频 ${script.lipsync}，角色先不对口型（配音后重新 build）`); delete script.lipsync
}

function buildVariant(v) {
  const dir = v === 'master' ? ROOT : path.join(ROOT, 'variants', v)
  const vertical = v === 'vertical'
  const VW = vertical ? 1080 : W, VH = vertical ? 1920 : H
  if (v !== 'master') {
    fs.mkdirSync(dir, { recursive: true })
    for (const d of MEDIA_DIRS) linkTree(path.join(ROOT, d), path.join(dir, d))
    for (const f of ['hyperframes.json', 'meta.json', 'package.json']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f))
  }
  const comp = path.join(dir, 'compositions'); fs.mkdirSync(comp, { recursive: true })
  const caps = CAPTIONS && v !== 'clean'
  const cs = cfg.captionStyle || {}, capLook = cs.look || (format === 'talk' ? 'bare' : 'card')
  let stageLayer = null
  const fontsSub = fontFaceCSS({ root: ROOT, base: '../' }), fontsRoot = fontFaceCSS({ root: ROOT, base: '' })
  const hosts = []

  // 底板（竖版是标题条 + 底板）
  if (vertical) {
    const cover = fs.existsSync(path.join(ROOT, 'cover.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'cover.json'), 'utf8')) : {}
    const title = (cfg.vertical && cfg.vertical.title) || (Array.isArray(cover.title) ? cover.title.map(t => String(t).replace(/\*/g, '')).join(' · ') : (cfg.title || '').split(' — ')[0])
    const label = (cfg.vertical && cfg.vertical.label) || [cover.brand && cover.brand.label, cover.eyebrow].filter(Boolean).join(' · ')
    writeFresh(path.join(comp, 'vheader.html'), vheaderHTML({ W: VW, H: VH, TOTAL, theme, fontsCSS: fontsSub, label, title, scenes, stage: V_LAYOUT.stage }))
    hosts.push({ id: 'vheader', src: 'compositions/vheader.html', start: 0, dur: TOTAL, track: 0, z: 0 })
  } else {
    writeFresh(path.join(comp, 'backdrop.html'), backdropHTML({ W, H, TOTAL, theme, fontsCSS: fontsSub }))
    hosts.push({ id: 'backdrop', src: 'compositions/backdrop.html', start: 0, dur: TOTAL, track: 0, z: 0 })
  }

  // 录屏（教程）：横版里跟着主讲版式让位；竖版里放在舞台上
  if (screen) {
    const src = path.join(ROOT, screen.src || '')
    if (!screen.src || !fs.existsSync(src)) fail(`screen.json 的 src 找不到：${screen.src}`)
    const m = probe(src)
    const cut = path.join(ROOT, 'footage/cutlist.json')
    const speed = screen.speed || (fs.existsSync(cut) ? JSON.parse(fs.readFileSync(cut, 'utf8')).segments.filter(s => s.speed > 1.01).map(s => ({ at: s.out[0], dur: +(s.out[1] - s.out[0]).toFixed(3), x: Math.round(s.speed) })) : [])
    writeFresh(path.join(comp, 'screen.html'), screenHTML({ W, H, TOTAL, theme, fontsCSS: fontsSub, screen, SW: m.width, SH: m.height, track, videoPresenter: framed && !vertical, captions: caps && !vertical && capLook === 'card', speed }))
    hosts.push({ id: 'screen', src: 'compositions/screen.html', start: 0, dur: TOTAL, track: 3, z: 5, staged: vertical })
  }

  // 场景
  for (const [k, sl] of slots.entries()) {
    if (missing.includes(sl.id)) continue
    const [markup, js] = fs.readFileSync(path.join(ROOT, 'build/scenes', sl.id + '.html'), 'utf8').split('<!--JS-->')
    writeFresh(path.join(comp, sl.id + '.html'), sceneHTML({ sl, theme, fontsCSS: fontsSub, markup, js, prelude, ledger, hideCounter: caps, W, H }))
    hosts.push({ id: sl.id, src: `compositions/${sl.id}.html`, start: sl.A, dur: sl.D, track: 1 + (k % 2), z: 10, staged: vertical })
  }

  // 主讲
  if (isVideoPresenter) {
    const src = presenter.src
    if (!src || !fs.existsSync(path.join(ROOT, src))) fail(`presenter.json 的 src 找不到：${src}（摄像头素材先跑 ingest.py）`)
    const m = probe(path.join(ROOT, src))
    writeFresh(path.join(comp, 'presenter.html'), presenterHTML({ W: VW, H: VH, TOTAL, theme, src, SW: m.width, SH: m.height, face: faceFor(ROOT, src, presenter.face), track, layout: vertical ? 'vertical' : 'landscape' }))
    // 讲解（场景不透明、给主讲留了位置）主讲在场景上面；教程 / 口播的场景是透明叠加层，要压在人像上面
    hosts.push({ id: 'presenter', src: 'compositions/presenter.html', start: 0, dur: TOTAL, track: 20, z: format === 'explainer' ? 50 : 8 })
  } else if (STAGE) {
    const id = (cfg.ip && cfg.ip.id) || presenter.id || 'mascot'
    const sp = path.join(ROOT, 'mascot/script.json')
    if (!fs.existsSync(sp)) fail('舞台模式的角色需要 mascot/script.json：node <skill>/scripts/direct.mjs <工程> 可以按旁白自动生成表演')
    const sc = JSON.parse(fs.readFileSync(sp, 'utf8'))
    Object.assign(sc, { width: CAM.w, height: CAM.h, duration: TOTAL, cat: { ...(sc.cat || {}), ...CAM.cat, flip: false } })
    sc.timeline = (sc.timeline || []).map(({ cat, ...e }) => e)          // 位置归版式轨道管，剧本里只留表演
    const ss = path.join(dir, 'mascot/stage.json'); fs.mkdirSync(path.dirname(ss), { recursive: true }); dropMissingLipsync(sc, ss); writeFresh(ss, JSON.stringify(sc))
    const ipFile = fs.existsSync(path.join(ROOT, 'presenter.json')) ? 'presenter.json' : 'ip.json'
    try { execFileSync('node', [path.join(HERE, 'ip.mjs'), 'layer', '--ip', path.join(ROOT, ipFile), '--script', ss, '--out', path.join(comp, id + '.html')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }) }
    catch { fail(`${presenter.name || id} 的图层生成失败（先跑 node <skill>/scripts/ip.mjs validate --script mascot/script.json 看报错）`) }
    stageLayer = mascotStage({ W: VW, H: VH, theme, id, src: `compositions/${id}.html`, start: 0, dur: TOTAL, SW: CAM.w, SH: CAM.h, face: CAM.face, track, layout: vertical ? 'vertical' : 'landscape', z: format === 'explainer' ? 50 : 8 })
  } else if (presenter.kind === 'mascot') {
    const id = (cfg.ip && cfg.ip.id) || presenter.id || 'mascot'
    const layer = path.join(ROOT, (cfg.ip && cfg.ip.src) || `compositions/${id}.html`)
    if (vertical) {
      // 竖版：同一份角色剧本，站位固定在主讲区（动作、口型不变）
      const sp = path.join(ROOT, 'mascot/script.json')
      if (fs.existsSync(sp)) {
        const s = JSON.parse(fs.readFileSync(sp, 'utf8')), M = V_LAYOUT.mascot
        Object.assign(s, { width: VW, height: VH, cat: { ...(s.cat || {}), x: M.x, y: M.y, scale: M.scale, flip: false } })
        s.timeline = (s.timeline || []).map(({ cat, ...e }) => e)
        const vs = path.join(dir, 'mascot/script.json'); fs.mkdirSync(path.dirname(vs), { recursive: true }); dropMissingLipsync(s, vs); writeFresh(vs, JSON.stringify(s))
        const ipFile = fs.existsSync(path.join(ROOT, 'presenter.json')) ? 'presenter.json' : 'ip.json'
        try {
          execFileSync('node', [path.join(HERE, 'ip.mjs'), 'layer', '--ip', path.join(ROOT, ipFile), '--script', vs, '--out', path.join(comp, id + '.html')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
          hosts.push({ id, src: `compositions/${id}.html`, start: 0, dur: TOTAL, track: 20, z: 50 })
        } catch { console.error(`! 竖版角色图层生成失败，竖版先不放 ${presenter.name || id}`) }
      }
    } else if (fs.existsSync(layer)) {
      if (v !== 'master') fs.copyFileSync(layer, path.join(comp, path.basename(layer)))
      hosts.push({ id, src: path.relative(ROOT, layer), start: 0, dur: TOTAL, track: 20, z: 50 })
    }
  }

  // 字幕：竖版用更短的行（每屏 ≤ 12 字），放在主讲区下沿，避开平台底部的标题 / 按钮
  if (caps) {
    let data = JSON.parse(fs.readFileSync(capPath, 'utf8'))
    if (vertical) {
      const out = path.join(dir, 'narration/captions-vertical.json')
      fs.rmSync(out, { force: true })
      execFileSync('python3', [path.join(HERE, 'captions.py'), ROOT, '--max', '12', '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] })
      data = JSON.parse(fs.readFileSync(out, 'utf8'))
    }
    const bare = capLook === 'bare'
    const zone = vertical ? V_LAYOUT.captions : { left: cs.left ?? (bare ? 160 : 120), width: cs.width ?? (bare ? 1600 : 1400), bottom: cs.bottom ?? (bare ? 64 : 34), size: cs.size ?? (bare ? 60 : 48) }
    writeFresh(path.join(comp, 'captions.html'), captionsHTML({ W: VW, H: VH, TOTAL, theme, fontsCSS: fontsSub, zone, data, look: capLook }))
    hosts.push({ id: 'captions', src: 'compositions/captions.html', start: 0, dur: TOTAL, track: 30, z: 60, attrs: ' data-track-kind="captions" data-layout-allow-overlap data-layout-allow-occlusion' })
  }

  // 章节胶囊（口播默认开；竖版的标题条里已经有章节）
  if ((cfg.chapters ?? format === 'talk') && !vertical) {
    writeFresh(path.join(comp, 'chapters.html'), chaptersHTML({ W, H, TOTAL, theme, fontsCSS: fontsSub, scenes }))
    hosts.push({ id: 'chapters', src: 'compositions/chapters.html', start: 0, dur: TOTAL, track: 31, z: 55 })
  }
  const audios = [...sfxCues.map((c, i) => ({ id: 'sfx-' + i, src: c.src, at: c.at, volume: c.volume, dur: Math.min(c.dur, +(TOTAL - c.at).toFixed(3)), track: 11 + (i % 3) })),
    ...(bgm ? [{ id: 'bgm', src: bgm.src, at: 0, dur: TOTAL, volume: bgm.volume ?? 0.12, track: 9 }] : [])]

  // 深色主题里黑猫会融进底色：给角色图层加一圈描边光（theme.json.mascotFilter）
  const mascotHost = presenter.kind === 'mascot' && hosts.find(h => h.z === 50)
  const extraCSS = mascotHost && theme.json.mascotFilter ? `      #el-${mascotHost.id} { filter: ${theme.json.mascotFilter}; }` : ''
  writeFresh(path.join(dir, 'index.html'), rootHTML({ W: VW, H: VH, TOTAL, title: cfg.title || 'creator-studio', fontsCSS: fontsRoot, hosts, narration: cfg.narration || 'narration/narration-full.mp3', stage: V_LAYOUT.stage, extraCSS: [extraCSS, stageLayer && stageLayer.css].filter(Boolean).join('\n'), extraHTML: stageLayer ? stageLayer.html : '', rootScript: stageLayer ? stageLayer.script : '', audios }))
  return { variant: v, dir: path.relative(ROOT, dir) || '.', size: `${VW}x${VH}`, captions: caps, layers: [...hosts.map(h => h.id).filter(id => !/^s\d+$/.test(id)), ...(stageLayer ? ['mascot-stage'] : [])], sfx: audios.length }
}

const built = VARIANTS.map(buildVariant)
console.log(JSON.stringify({ ok: true, total: TOTAL, format, theme: theme.name, presenter: presenter.kind, built: slots.length - missing.length, missing, captions: CAPTIONS, variants: built,
  slots: slots.map(s => ({ id: s.id, start: s.A, dur: s.D, in: s.IN, ground: s.ground.none ? 'none' : s.ground.invert ? 'invert' : s.ground.color })) }))
