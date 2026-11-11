#!/usr/bin/env node
// 渲染：FrameVelo 优先（硬件编码，1080p 约快 2 倍、4K 约快 3.8 倍，画面与 HyperFrames 一致），不可用或失败时自动回退 npx hyperframes render。
// 用法：node <skill>/scripts/render.mjs [projectDir] [--platform bilibili,youtube,douyin,x | --variant master|clean|vertical|all]
//        [--fps 60] [--quality high|standard|draft] [--scale 2（4K）] [--preview 95,6] [--engine framevelo|hyperframes] [-o renders]
// 输出 renders/<slug>-<平台或变体>[-preview].mp4，并做成片检查：时长、有声、响度、抽首中尾三帧。最后一行是 JSON。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { loadProject } from './lib/project.mjs'

const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1] }
const flagVals = new Set(['--platform', '--variant', '--fps', '--quality', '--scale', '--preview', '--engine', '-o'].flatMap(f => { const i = argv.indexOf(f); return i < 0 ? [] : [argv[i + 1]] }))
const ROOT = path.resolve(argv.find(a => !a.startsWith('-') && !flagVals.has(a)) || '.')
const fail = m => { console.error('✗ ' + m); process.exit(1) }
if (!fs.existsSync(path.join(ROOT, 'video.json'))) fail(`${ROOT} 不是工程目录（没有 video.json）`)
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'video.json'), 'utf8'))
const slug = cfg.slug || path.basename(ROOT).replace(/^\d{8}-/, '')
const OUT = path.resolve(ROOT, opt('o', argv.includes('-o') ? argv[argv.indexOf('-o') + 1] : 'renders'))
fs.mkdirSync(OUT, { recursive: true })

// 平台 → 变体
const PLATFORM = { bilibili: 'master', x: 'master', youtube: 'clean', douyin: 'vertical', shorts: 'vertical', channels: 'vertical', xiaohongshu: 'vertical' }
const LIMIT = { x: 140 }   // X 非 Premium 账号单条视频上限 2 分 20 秒
let targets
if (opt('platform')) targets = opt('platform').split(',').map(p => { if (!PLATFORM[p]) fail(`未知平台 "${p}"，可用：${Object.keys(PLATFORM).join('、')}`); return { name: p, variant: PLATFORM[p] } })
else {
  const v = opt('variant', 'master')
  targets = (v === 'all' ? ['master', 'clean', 'vertical'] : v.split(',')).map(x => ({ name: x, variant: x }))
}
// 同一个变体只渲一次，再按平台名复制
const byVariant = new Map()
for (const t of targets) { if (!byVariant.has(t.variant)) byVariant.set(t.variant, []); byVariant.get(t.variant).push(t.name) }

const fps = +opt('fps', cfg.fps || 60), quality = opt('quality', 'high'), scale = +opt('scale', 1)
let TOTAL = null; try { TOTAL = loadProject(ROOT).TOTAL } catch {}
const preview = opt('preview') && opt('preview').split(',').map(Number)
// FRAMEVELO_BIN：换一个 FrameVelo 命令（比如直接跑源码仓库：FRAMEVELO_BIN="node --disable-warning=ExperimentalWarning /path/FrameVelo/src/cli.ts"）
const FV = (process.env.FRAMEVELO_BIN || 'framevelo').trim().split(/\s+/)
const haveFrameVelo = spawnSync(FV[0], [...FV.slice(1), '--version'], { encoding: 'utf8' }).status === 0
const engine = opt('engine', haveFrameVelo ? 'framevelo' : 'hyperframes')
const pinned = (() => { try { const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts || {}; return (Object.values(s).join(' ').match(/hyperframes@[\d.]+/) || [])[0] } catch { return null } })() || 'hyperframes@latest'

function renderFrameVelo(root, out) {
  const args = ['render', root, '-o', out, '--fps', String(fps), '--quality', quality, '--json', '-q']
  if (preview) args.push('--start', String(preview[0]), '--duration', String(preview[1]))
  if (scale > 1) args.push('--scale', String(scale))
  const r = spawnSync(FV[0], [...FV.slice(1), ...args], { encoding: 'utf8', maxBuffer: 64 << 20 })
  let j = null; try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))) } catch {}
  if (r.status !== 0 || !fs.existsSync(out)) return { ok: false, error: (j && j.error) || (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ') }
  return { ok: true, wallMs: j && j.wallMs, warnings: (j && j.warnings) || [] }
}
function renderHyperFrames(root, out, vertical) {
  if (preview) console.error('! HyperFrames 不支持只渲一段，这次渲整片')
  const q = { high: 'high', standard: 'standard', draft: 'draft' }[quality] || 'high'
  const r = spawnSync('npx', ['--yes', pinned, 'render', '--fps', String(fps), '--quality', q, '--resolution', (vertical ? 'portrait' : 'landscape') + (scale > 1 ? '-4k' : ''), '--video-frame-format', 'png', '-o', out], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 << 20 })
  if (r.status !== 0 || !fs.existsSync(out)) return { ok: false, error: (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ') }
  return { ok: true }
}

// 成片检查：时长、有声、响度（LUFS）、首中尾三帧
function check(file, expect) {
  const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]).toString())
  const v = pr.streams.find(s => s.codec_type === 'video'), hasAudio = pr.streams.some(s => s.codec_type === 'audio')
  const dur = +pr.format.duration
  let lufs = null
  if (hasAudio) {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
    const m = (r.stderr || '').match(/I:\s*(-?[\d.]+) LUFS/g); if (m) lufs = +m[m.length - 1].match(/-?[\d.]+/)[0]
  }
  const dir = file.replace(/\.mp4$/, '.check'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir)
  const frames = [0.1, 0.5, 0.9].map((p, i) => { const f = path.join(dir, `${i + 1}-${(dur * p).toFixed(1)}s.png`); spawnSync('ffmpeg', ['-v', 'error', '-ss', String(dur * p), '-i', file, '-frames:v', '1', '-y', f]); return f })
  const warn = []
  if (expect && Math.abs(dur - expect) > 0.25) warn.push(`时长 ${dur.toFixed(2)}s，预期 ${expect.toFixed(2)}s`)
  if (!hasAudio) warn.push('没有音轨')
  if (lufs != null && (lufs < -20 || lufs > -11)) warn.push(`响度 ${lufs} LUFS，建议 -16 左右`)
  return { duration: +dur.toFixed(3), size: `${v.width}x${v.height}`, audio: hasAudio, lufs, frames, warn }
}

const results = []
for (const [variant, names] of byVariant) {
  const root = variant === 'master' ? ROOT : path.join(ROOT, 'variants', variant)
  if (!fs.existsSync(path.join(root, 'index.html'))) fail(`还没构建 ${variant} 变体：先跑 node <skill>/scripts/build.mjs ${ROOT} --variants ${variant}`)
  const out = path.join(OUT, `${slug}-${names[0]}${preview ? '-preview' : ''}.mp4`)
  const t0 = Date.now()
  let used = engine, r = engine === 'framevelo' ? renderFrameVelo(root, out) : renderHyperFrames(root, out, variant === 'vertical')
  if (!r.ok && engine === 'framevelo') {
    // 常见原因：全局 @hyperframes/producer 升到了 FrameVelo 不支持的版本（FrameVelo 0.6 只支持 0.8.186–0.8.x）
    const hint = /distributed\.plan|is not a function|peer/i.test(r.error || '') ? '；多半是全局 @hyperframes/producer 版本和 FrameVelo 不匹配（framevelo doctor 看版本；全局 framevelo 和 @hyperframes/producer、engine 要按 FrameVelo 的 peerDependencies 配套安装，或用 FRAMEVELO_BIN 指向能用的那份）' : ''
    if (preview) fail(`FrameVelo 失败（${r.error}）${hint}。只渲一段只有 FrameVelo 支持；要渲整片加 --engine hyperframes`)
    console.error(`! FrameVelo 失败（${r.error}）${hint}，改用 ${pinned} 渲染整片`); used = 'hyperframes'; r = renderHyperFrames(root, out, variant === 'vertical')
  }
  if (!r.ok) fail(`${variant} 渲染失败：${r.error}`)
  const expect = preview ? preview[1] : TOTAL
  const c = check(out, expect)
  const files = [out]
  for (const extra of names.slice(1)) { const f = path.join(OUT, `${slug}-${extra}${preview ? '-preview' : ''}.mp4`); fs.copyFileSync(out, f); files.push(f) }
  for (const n of names) if (LIMIT[n] && c.duration > LIMIT[n]) c.warn.push(`${n} 非会员上限 ${LIMIT[n]} 秒，这条 ${Math.round(c.duration)} 秒`)
  if (names.includes('youtube') && fs.existsSync(path.join(ROOT, 'narration/captions.srt'))) { const f = path.join(OUT, `${slug}-youtube.srt`); fs.copyFileSync(path.join(ROOT, 'narration/captions.srt'), f); files.push(f) }
  for (const w of c.warn) console.error(`! ${variant}：${w}`)
  results.push({ variant, platforms: names, engine: used, seconds: +((Date.now() - t0) / 1000).toFixed(1), files, ...c })
}
console.log(JSON.stringify({ ok: true, fps, quality, preview: preview || null, results }))
