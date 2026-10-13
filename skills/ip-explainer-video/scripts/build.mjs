#!/usr/bin/env node
// 生成 compositions/sNN.html 和 index.html
// 输入：narration/scenes.json（tts.py 生成）· video.json（工程配置）· build/scenes/sNN.html（场景源：标记 + "<!--JS-->" + 时间轴代码）
// 用法：node <skill>/scripts/build.mjs [projectDir]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../kit')
const ROOT = path.resolve(process.argv[2] || '.')
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8')
const cfg = JSON.parse(read('video.json'))
const scenes = JSON.parse(read('narration/scenes.json'))
const W = cfg.width || 1920, H = cfg.height || 1080
const TOTAL = +(cfg.total || (scenes[scenes.length - 1].end + (cfg.tail ?? 0.6))).toFixed(3)
const CYCLE = ['#FFDC8B', '#F7CB46', '#C0F7FE', '#FE90E8', '#99E885', '#FFFDF5'] // BlockFrame 五色 + 米白，逐场轮换
const TRANS = cfg.transitions || {}       // { "05": "vpush", "08": "blur" }，默认 push
const GROUND = cfg.ground || {}
const shared = fs.readFileSync(path.join(KIT, 'shared.css'), 'utf8')
const prelude = fs.readFileSync(path.join(KIT, 'prelude.js'), 'utf8')
const FONTS = base => [
  ['Noto Sans SC', 'NotoSansSC-Regular.otf', 400], ['Noto Sans SC', 'NotoSansSC-Bold.otf', 700], ['Noto Sans SC', 'NotoSansSC-Black.otf', 900],
  ['Space Grotesk', 'SpaceGrotesk-Variable.ttf', '300 700']
].filter(([, f]) => fs.existsSync(path.join(ROOT, 'assets/fonts', f)))
  .map(([f, file, w]) => `@font-face { font-family: "${f}"; src: url("${base}assets/fonts/${file}"); font-weight: ${w}; font-style: normal; }`).join('\n')

const sid = s => 's' + String(s.id).padStart(2, '0')
const trans = i => i === 0 ? 'none' : (TRANS[String(scenes[i].id).padStart(2, '0')] || 'push')
const slots = scenes.map((s, i) => {
  const A = i === 0 ? 0 : +(s.start - 0.5).toFixed(3)
  const E = i + 1 < scenes.length ? scenes[i + 1].start : TOTAL
  const next = i + 1 < scenes.length ? trans(i + 1) : 'none'
  return { id: sid(s), A, D: +(E - A).toFixed(3), IN: trans(i), OUT: next === 'blur' ? 'none' : next, bg: GROUND[String(s.id).padStart(2, '0')] || CYCLE[i % CYCLE.length] }
})

const ledgerPath = path.join(ROOT, 'terminal/ledger.json')
const ledger = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : 'null'
fs.mkdirSync(path.join(ROOT, 'compositions'), { recursive: true })
const missing = []
for (const sl of slots) {
  const src = path.join(ROOT, 'build/scenes', sl.id + '.html')
  if (!fs.existsSync(src)) { missing.push(sl.id); continue }
  const [markup, js] = fs.readFileSync(src, 'utf8').split('<!--JS-->')
  const pre = prelude.replace('__ID__', sl.id).replace('__D__', sl.D).replace('__A__', sl.A).replace('__IN__', sl.IN).replace('__OUT__', sl.OUT)
  fs.writeFileSync(path.join(ROOT, 'compositions', sl.id + '.html'), `<!doctype html>
<html>
  <head><meta charset="UTF-8" /><title>${sl.id}</title></head>
  <body>
    <template>
      <style>
${FONTS('../')}
${shared.replaceAll('SCOPE', '#' + sl.id)}
#${sl.id} .ground { background: ${sl.bg}; }
      </style>
      <div id="${sl.id}" data-composition-id="${sl.id}" data-width="${W}" data-height="${H}" data-duration="${sl.D}">
${markup.trim().replaceAll('class="ghost"', 'class="ghost" data-layout-ignore aria-hidden="true"')}
      </div>
      <script>
        (function () {
${pre}
${(js || '').trim().replace('__LEDGER__', ledger)}
          window.__timelines["${sl.id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`)
}

const hosts = slots.filter(sl => !missing.includes(sl.id)).map((sl, k) =>
  `      <div id="el-${sl.id}" data-composition-id="${sl.id}" data-composition-src="compositions/${sl.id}.html" data-start="${sl.A}" data-duration="${sl.D}" data-track-index="${1 + (k % 2)}" data-width="${W}" data-height="${H}"></div>`).join('\n')
const ip = cfg.ip || { id: 'mascot', src: 'compositions/mascot.html' }
const ipHost = fs.existsSync(path.join(ROOT, ip.src))
  ? `      <div id="el-${ip.id}" data-composition-id="${ip.id}" data-composition-src="${ip.src}" data-start="0" data-duration="${TOTAL}" data-track-index="20" data-width="${W}" data-height="${H}"></div>` : ''
fs.writeFileSync(path.join(ROOT, 'index.html'), `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${cfg.title || 'IP explainer'}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${FONTS('')}
      body { margin: 0; background: #FFFDF5; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #FFFDF5; }
      [data-composition-id="root"] > div[data-composition-src] { position: absolute; inset: 0; }
      #el-${ip.id} { z-index: 50; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="root" data-start="0" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
${hosts}
${ipHost}
      <audio id="narration" src="${cfg.narration || 'narration/narration-full.mp3'}" data-start="0" data-duration="${TOTAL}" data-track-index="10" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines["root"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`)
console.log(JSON.stringify({ ok: true, total: TOTAL, built: slots.length - missing.length, missing, ip: ipHost ? ip.id : null, slots: slots.map(s => ({ id: s.id, start: s.A, dur: s.D, in: s.IN, bg: s.bg })) }))
