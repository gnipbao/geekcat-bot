// 自动音效：从场景源码里的动效调用、换场、主讲版式切换里收集"画面事件"，按优先级稀疏化，映射到 sfx.sh 合成的音效包。
// 规则来自高留存口播剪辑的经验：音效起音对齐画面事件首帧；同一拍只留一个；连续 3 秒最多 2 个；比人声低 8–14 dB。
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

// 动效 → [音效名, 变体数, 优先级, 音量]
const MAP = {
  slam: ['hit', 2, 3, 0.34], flash: ['swish', 1, 3, 0.26], popIn: ['pop', 3, 2, 0.26], strike: ['swish', 1, 2, 0.22], shake: ['tick', 2, 2, 0.24],
  count: ['tick', 2, 1, 0.2], type: ['type', 1, 1, 0.16], enter: ['whoosh', 2, 1, 0.14], wipe: ['whoosh', 2, 1, 0.14],
}
const DUR = { pop: 0.22, tick: 0.1, hit: 0.3, whoosh: 0.55, swish: 0.3, type: 0.6, ding: 1.0, click: 0.14 }   // 每类音效的时长（sfx.sh 里定的），写进 data-duration，轨道才不会互相重叠
const CALL = /\b(slam|flash|popIn|strike|shake|count|type|enter|wipe)\(\s*(?:(?:'[^']*'|"[^"]*"|`[^`]*`)\s*,\s*)?c\(\s*([\d.]+)\s*\)\s*(?:([+-])\s*([\d.]+))?/g

export function collectSfx({ sources, slots, track = [], total }) {
  const ev = []
  for (const src of sources) {
    const js = src.split('<!--JS-->')[1] || ''
    for (const m of js.matchAll(CALL)) {
      const t = +m[2] + (m[3] ? (m[3] === '-' ? -1 : 1) * +m[4] : 0), [name, n, prio, vol] = MAP[m[1]]
      ev.push({ at: t, name, n, prio, vol })
    }
  }
  slots.forEach((sl, i) => { if (i > 0 && sl.IN !== 'none') ev.push({ at: sl.A + (sl.IN === 'flash' ? 0 : 0.05), name: sl.IN === 'flash' ? 'swish' : 'whoosh', n: sl.IN === 'flash' ? 1 : 2, prio: 2, vol: 0.2 }) })
  track.forEach((k, i) => { if (i > 0 && k.mode !== track[i - 1].mode) ev.push({ at: k.at, name: 'whoosh', n: 2, prio: 1, vol: 0.14 }) })
  // 稀疏化：高优先级先占位；和已选的间隔 < 0.7 秒的丢掉；任意 3 秒窗口最多 2 个
  const kept = []
  for (const e of ev.filter(e => e.at >= 0 && e.at < total - 0.1).sort((a, b) => b.prio - a.prio || a.at - b.at)) {
    if (kept.some(k => Math.abs(k.at - e.at) < 0.7)) continue
    if (kept.filter(k => Math.abs(k.at - e.at) < 1.5).length >= 2) continue
    kept.push(e)
  }
  kept.sort((a, b) => a.at - b.at)
  const turn = {}
  return kept.map(e => { turn[e.name] = (turn[e.name] || 0) % e.n + 1; return { at: +e.at.toFixed(3), file: `${e.name}_${turn[e.name]}.wav`, volume: e.vol, dur: e.name === 'whoosh' && turn[e.name] === 1 ? 0.45 : DUR[e.name] } })
}

/** 音效包不在就用 ffmpeg 现合成一套（无采样、无版权） */
export function ensureSfxKit(dir, script) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.wav'))) return
  execFileSync('bash', [script, dir], { stdio: ['ignore', 'ignore', 'inherit'] })
}
