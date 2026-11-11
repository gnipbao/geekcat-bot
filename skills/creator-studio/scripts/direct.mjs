#!/usr/bin/env node
// 自动导演：按旁白时间轴（narration/scenes.json）起一版"像真人主播"的表演和镜头，之后人工微调。
//   1) mascot/script.json   IP 角色的表演：说话时 talk，句子之间 idle，按句子的语气加表情（提问、反转、否定、肯定、数字、结尾挥手）
//   2) presenter/track.json 版式轨道：口播 = 全屏 + 句首跳推（1.0 ↔ 1.12 交替硬切，重点句 1.22 快推）；教程 = 开场全屏 → 操作段小窗 → 结尾全屏
// 用法：node <skill>/scripts/direct.mjs <工程> [--force]（已有的文件默认不覆盖，--force 才覆盖并把旧的存成 .prev）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadProject } from './lib/project.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2), force = argv.includes('--force')
const ROOT = path.resolve(argv.find(a => !a.startsWith('--')) || '.')
let P
try { P = loadProject(ROOT) } catch (e) { console.error('✗ ' + e.message); process.exit(1) }
const { scenes, TOTAL, format, presenter } = P

// 语气 → 表演。presenter.json 的 "acting" 可以把语气换成别的动作名（别的 IP 动作名不一样）
const ACT = { talk: 'talk', idle: 'idle', greet: 'wave', bye: 'wave', question: 'curious', twist: 'surprised', no: 'shake', yes: 'nod', number: 'nod', warn: 'scared', win: 'happy', think: 'think', ...(presenter.acting || {}) }
const MOODS = [
  ['bye', /下期|再见|拜拜|关注|点赞|评论区|留言/],
  ['greet', /大家好|我是|哈喽|嗨|hello/i],
  ['question', /[？?]\s*$|吗[？?。！]*$|为什么|怎么回事|你知道|有没有/],
  ['twist', /没想到|竟然|居然|其实|但是|然而|不过|结果|直接|震惊|离谱|夸张/],
  ['warn', /坑|小心|注意|千万|风险|危险|翻车|踩雷/],
  ['no', /不是|不要|不用|别再|不对|不行|没用/],
  ['win', /搞定|成功|完成|太好|免费|神器|推荐|好用|省事/],
  ['think', /所以|总结|结论|关键是|核心|本质|说白了/],
  ['number', /\d|[一二两三四五六七八九十百千万亿]+(个|倍|万|亿|星|步|秒|分钟|小时|天|块|种|次)|百分之/],
  ['yes', /没错|确实|就是|对的|可以/],
]
const moodOf = text => (MOODS.find(([, re]) => re.test(text)) || ['talk'])[0]
const STRONG = new Set(['twist', 'number', 'warn', 'win'])
const cues = scenes.flatMap((s, si) => (s.cues || []).map(c => ({ ...c, si, mood: moodOf(c.text) })))
if (!cues.length) { console.error('✗ scenes.json 里没有句子（cues）'); process.exit(1) }

function save(file, data, what) {
  const f = path.join(ROOT, file)
  if (fs.existsSync(f) && !force) return { file, skipped: `已有 ${file}，没有覆盖（要重新生成加 --force）` }
  if (fs.existsSync(f)) fs.copyFileSync(f, f.replace(/\.json$/, '.prev.json'))
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n')
  return { file, ...what }
}
const out = {}

// 1) 表演
if (presenter.kind === 'mascot') {
  const tl = []; let last = -9, lastMood = null
  const add = (at, e) => { at = Math.max(0, +Math.max(at, last + 0.7).toFixed(2)); tl.push({ at, ...e }); last = at }
  add(0, { do: ACT.idle, ...(presenter.accessories ? { accessories: presenter.accessories } : { accessories: ['glasses'] }) })
  cues.forEach((c, i) => {
    const dur = c.e - c.t, prev = cues[i - 1]
    if (prev && c.t - prev.e > 1.1) add(prev.e + 0.25, { do: ACT.idle })               // 句子之间的空档：收回待机
    let mood = c.mood
    if (mood === 'greet' && i > 1) mood = 'talk'
    if (mood !== 'talk' && mood === lastMood) mood = 'talk'                             // 同一种表情不连着用
    if (mood === 'talk' || dur < 1.0) { add(c.t - 0.15, { do: ACT.talk }); lastMood = 'talk'; return }
    add(c.t - 0.15, { do: ACT[mood] }); lastMood = mood
    if (dur > 2.0) add(c.t + 1.2, { do: ACT.talk })                                     // 表情做完回到说话，嘴继续动
  })
  add(cues[cues.length - 1].e + 0.3, { do: cues[cues.length - 1].mood === 'bye' ? ACT.bye : ACT.idle })
  const script = { width: 1920, height: 1080, fps: 60, background: 'transparent', cat: { x: 0.5, y: 1.2, scale: 1.5, flip: false }, lipsync: '../narration/narration-full.mp3', timeline: tl, duration: TOTAL }
  out.script = save('mascot/script.json', script, { entries: tl.length, moods: Object.fromEntries(Object.entries(cues.reduce((m, c) => (m[c.mood] = (m[c.mood] || 0) + 1, m), {}))) })
  if (!out.script.skipped) {
    const ipFile = fs.existsSync(path.join(ROOT, 'presenter.json')) ? 'presenter.json' : 'ip.json'
    try { execFileSync('node', [path.join(HERE, 'ip.mjs'), 'validate', '--ip', path.join(ROOT, ipFile), '--script', path.join(ROOT, 'mascot/script.json')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] }) }
    catch (e) { out.script.warn = '角色剧本校验没过：' + String(e.stderr || e.message).trim().split('\n').pop() }
  }
}

// 2) 版式轨道
if (presenter.kind !== 'none') {
  const track = []
  const sceneStart = i => (i === 0 ? 0 : +scenes[i].start)
  if (format === 'talk') {
    track.push({ at: 0, mode: 'full' })
    let near = false, lastAt = 0
    cues.forEach((c, i) => {
      if (i === 0) return
      const at = +(c.t - 0.08).toFixed(2), dur = c.e - c.t
      if (at - lastAt < 2.2 || dur < 1.4) return                                        // 2–4 秒一个节拍；太短的句子不切
      if (STRONG.has(c.mood) && !near) { track.push({ at, zoom: 1.22 }); near = true }  // 重点句：快推到特写
      else { near = !near; track.push({ at, zoom: near ? 1.12 : 1, cut: true }) }       // 句首跳推：近 / 远交替硬切
      lastAt = at
    })
  } else if (format === 'tutorial') {
    const firstLong = scenes[0] && (scenes.length > 1 ? scenes[1].start : TOTAL) <= 25
    track.push({ at: 0, mode: firstLong ? 'full' : 'pip' })
    if (firstLong && scenes.length > 1) track.push({ at: +(sceneStart(1) - 0.1).toFixed(2), mode: 'pip', corner: 'br' })
    const lastScene = scenes[scenes.length - 1]
    if (scenes.length > 2 && lastScene.cues && lastScene.cues.some(c => moodOf(c.text) === 'bye')) track.push({ at: +(lastScene.start - 0.1).toFixed(2), mode: 'full' })
  } else {
    track.push({ at: 0, mode: 'full' })
    if (scenes.length > 1) track.push({ at: +(cues[Math.min(1, cues.length - 1)].e + 0.1).toFixed(2), mode: 'side' })
  }
  out.track = save('presenter/track.json', track, { entries: track.length, punchIns: track.filter(k => k.zoom).length })
}
console.log(JSON.stringify({ ok: true, format, presenter: presenter.kind, cues: cues.length, ...out }))
