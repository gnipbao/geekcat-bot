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

// 底部字幕：narration/captions.json（captions.py 生成）存在且 video.json 没写 "captions": false 时启用
const capPath = path.join(ROOT, 'narration/captions.json')
const CAPTIONS = cfg.captions !== false && fs.existsSync(capPath)
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
#${sl.id} .ground { background: ${sl.bg}; }${CAPTIONS ? `\n#${sl.id} .counter { display: none; }` : ''}
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
if (CAPTIONS) {
  const cap = cfg.captionStyle || {}
  const zone = { left: cap.left ?? 120, width: cap.width ?? 1400, bottom: cap.bottom ?? 34, size: cap.size ?? 48 }
  const data = JSON.stringify(JSON.parse(fs.readFileSync(capPath, 'utf8')))   // 压缩成一行
  fs.writeFileSync(path.join(ROOT, 'compositions/captions.html'), `<!doctype html>
<html>
  <head><meta charset="UTF-8" /><title>captions</title></head>
  <body>
    <template>
      <style>
${FONTS('../')}
        #captions { position: absolute; inset: 0; pointer-events: none; }
        #cap-zone { position: absolute; left: ${zone.left}px; width: ${zone.width}px; bottom: ${zone.bottom}px; display: flex; justify-content: center; }
        #cap-card { display: none; padding: 10px 30px 14px; background: #fff; border: 4px solid #000; box-shadow: 8px 8px 0 #000; font-family: "Noto Sans SC", "Inter", sans-serif; font-weight: 900; font-size: ${zone.size}px; line-height: 1.25; letter-spacing: 0.01em; white-space: nowrap; transform-origin: 50% 100%; }
        #cap-card span { color: rgba(0,0,0,.38); }
        #cap-card span.s { color: #000; }
        #cap-card span.a { color: #000; background: #F7CB46; box-shadow: 0 0 0 3px #F7CB46; }
      </style>
      <div id="captions" data-composition-id="captions" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        <div id="cap-zone" data-layout-allow-overlap data-layout-allow-occlusion><div id="cap-card"></div></div>
      </div>
      <script>
        (function () {
          // 每帧按时间决定：显示哪一屏、哪些字已念过、哪个字正在念（黄色色块）。纯函数，seek-safe
          var C = ${data.trim()};
          var card = document.getElementById('cap-card'), last = '';
          var esc = function (c) { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c; };
          function draw(t) {
            var seg = null;
            for (var i = 0; i < C.length; i++) { if (C[i].t - 0.04 <= t && t < C[i].hold) { seg = C[i]; break; } if (C[i].t > t) break; }
            if (!seg) { if (last !== '') { card.style.display = 'none'; last = ''; } return; }
            var active = -1;
            if (t < seg.e + 0.05) for (var k = 0; k < seg.chars.length; k++) if (seg.chars[k][1] !== null && seg.chars[k][1] <= t) active = k;
            var spokenUpTo = t >= seg.e ? seg.chars.length : active;
            var p = Math.min(1, (t - seg.t + 0.04) / 0.14), sc = 0.9 + 0.1 * (1 - Math.pow(1 - p, 3));
            var key = seg.t + '|' + active + '|' + spokenUpTo + '|' + sc.toFixed(3);
            if (key === last) return;
            last = key;
            card.style.display = 'block';
            card.style.transform = 'scale(' + sc.toFixed(3) + ')';
            card.innerHTML = seg.chars.map(function (ch, k) {
              var cls = k === active && t < seg.e ? 'a' : (k <= spokenUpTo ? 's' : '');
              return '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(ch[0]) + '</span>';
            }).join('');
          }
          var proxy = { t: 0 };
          var tl = gsap.timeline({ paused: true });
          tl.fromTo(proxy, { t: 0 }, { t: ${TOTAL}, duration: ${TOTAL}, ease: 'none', onUpdate: function () { draw(proxy.t); } }, 0);
          draw(0);
          window.__timelines["captions"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`)
}
const ip = cfg.ip || { id: 'mascot', src: 'compositions/mascot.html' }
const ipHost = fs.existsSync(path.join(ROOT, ip.src))
  ? `      <div id="el-${ip.id}" data-composition-id="${ip.id}" data-composition-src="${ip.src}" data-start="0" data-duration="${TOTAL}" data-track-index="20" data-width="${W}" data-height="${H}"></div>` : ''
const capHost = CAPTIONS ? `      <div id="el-captions" data-track-kind="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${TOTAL}" data-track-index="30" data-width="${W}" data-height="${H}"></div>` : ''
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
      #el-captions { z-index: 60; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="root" data-start="0" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
${hosts}
${ipHost}
${capHost}
      <audio id="narration" src="${cfg.narration || 'narration/narration-full.mp3'}" data-start="0" data-duration="${TOTAL}" data-track-index="10" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines["root"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`)
console.log(JSON.stringify({ ok: true, total: TOTAL, built: slots.length - missing.length, missing, ip: ipHost ? ip.id : null, captions: CAPTIONS, slots: slots.map(s => ({ id: s.id, start: s.A, dur: s.D, in: s.IN, bg: s.bg })) }))
