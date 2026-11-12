// 工程配置：video.json + narration/scenes.json + presenter.json（或旧的 ip.json）+ presenter/track.json + screen.json
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadTheme } from './theme.mjs'

export const FORMATS = ['explainer', 'tutorial', 'talk']
export const MODES = ['full', 'side', 'pip', 'off']
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'))

export function loadProject(root) {
  const p = f => path.join(root, f)
  if (!fs.existsSync(p('video.json'))) throw new Error(`${root} 里没有 video.json`)
  if (!fs.existsSync(p('narration/scenes.json'))) throw new Error('缺 narration/scenes.json：稿子先行跑 tts.py，素材先行跑 ingest.py')
  const cfg = readJSON(p('video.json'))
  const scenes = readJSON(p('narration/scenes.json'))
  const W = cfg.width || 1920, H = cfg.height || 1080
  const last = scenes[scenes.length - 1]
  const end = last.end ?? (last.cues && last.cues.length ? last.cues[last.cues.length - 1].e : last.start)
  const screen0 = fs.existsSync(p('screen.json')), footageFirst = (cfg.format || (screen0 ? 'tutorial' : 'explainer')) !== 'explainer'
  const TOTAL = +(cfg.total || (end + (cfg.tail ?? (footageFirst ? 0 : 0.6)))).toFixed(3)   // 素材先行：成片就到素材结尾
  const screen = fs.existsSync(p('screen.json')) ? readJSON(p('screen.json')) : null
  const format = cfg.format || (screen ? 'tutorial' : 'explainer')
  if (!FORMATS.includes(format)) throw new Error(`未知 format "${format}"，可用：${FORMATS.join('、')}`)
  const theme = loadTheme(cfg.theme || 'pop')                 // 旧工程没写 theme → pop（原 BlockFrame）
  const presenter = loadPresenter(root)
  const track = loadTrack(root, format, presenter, TOTAL, H > W && theme.json.portrait && theme.json.portrait.presenter)
  return { root, cfg, scenes, W, H, TOTAL, format, theme, presenter, track, screen, platforms: cfg.platforms || [] }
}

// 主讲：presenter.json 优先；只有 ip.json 的旧工程 = mascot；都没有 = none
export function loadPresenter(root) {
  const pj = path.join(root, 'presenter.json'), ij = path.join(root, 'ip.json')
  if (fs.existsSync(pj)) {
    const pr = readJSON(pj)
    if (pr.kind === 'mascot' && !pr.commands && fs.existsSync(ij)) Object.assign(pr, readJSON(ij), { kind: 'mascot' })
    return pr
  }
  if (fs.existsSync(ij)) return { kind: 'mascot', ...readJSON(ij) }
  return { kind: 'none' }
}

// 版式轨道：[{at, mode, corner?, size?}]，按时间排序。没写时按形式给默认值
export function loadTrack(root, format, presenter, TOTAL, portraitDefault) {
  const f = path.join(root, 'presenter/track.json')
  let track = fs.existsSync(f) ? readJSON(f) : null
  // 没写 track.json：竖版原生工程用主题给的小窗位置（theme.json.portrait.presenter），其余按形式
  if (!track && portraitDefault && portraitDefault.rect) track = [{ at: 0, mode: 'pip', rect: portraitDefault.rect, shape: portraitDefault.shape || 'circle' }]
  if (!track) track = [{ at: 0, mode: { tutorial: 'pip', talk: 'full', explainer: 'side' }[format] }]
  track = track.map(k => ({ ...k, at: +k.at })).sort((a, b) => a.at - b.at)
  let cur = track[0].mode
  for (const k of track) { if (k.mode == null) k.mode = cur; cur = k.mode }      // 只写 zoom / shift 的条目沿用上一条的版式
  for (const k of track) if (!MODES.includes(k.mode)) throw new Error(`presenter/track.json：未知 mode "${k.mode}"（at ${k.at}），可用：${MODES.join('、')}`)
  if (track[0].at > 0) track.unshift({ ...track[0], at: 0 })
  return track.filter(k => k.at < TOTAL)
}
export const modeAt = (track, t) => { let m = track[0]; for (const k of track) if (k.at <= t + 1e-6) m = k; return m }

export function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', file]).toString()
  const j = JSON.parse(out), s = j.streams && j.streams[0] || {}
  const rot = Math.abs(((s.side_data_list || []).find(d => d.rotation != null) || {}).rotation || 0)
  const [w, h] = rot === 90 || rot === 270 ? [s.height, s.width] : [s.width, s.height]
  return { width: w, height: h, duration: +(j.format && j.format.duration || 0) }
}

// 人脸框（0–1，左上原点）：ingest.py 写在 footage/<名字>.face.json；没有就按"人在画面中间偏上"估
export function faceFor(root, src, override) {
  if (override) return override
  const f = path.join(root, src.replace(/\.[^.]+$/, '') + '.face.json')
  if (fs.existsSync(f)) { const j = readJSON(f); if (j.found) return { x: j.x, y: j.y, w: j.w, h: j.h } }
  return { x: 0.5, y: 0.38, w: 0.3, h: 0.3 }
}
