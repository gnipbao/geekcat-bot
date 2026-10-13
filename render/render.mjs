#!/usr/bin/env node
/* 知识猫 GeekCat 渲染 CLI
 *
 *   node render.mjs list                                       动作 / 场景 / 配饰目录（JSON，给 agent 查）
 *   node render.mjs draft <字幕.srt> [-o 剧本.json]             按字幕自动生成剧本草稿
 *   node render.mjs validate <剧本.json>                       只校验剧本，不渲染
 *   node render.mjs still <剧本.json> --at 1.5,4 -o shots/     渲染几张关键帧 PNG（agent 自检用）
 *   node render.mjs render <剧本.json> -o out.mov               渲染整段（多核并行）
 *   node render.mjs live [--port 5199]                         直播 / OBS 模式：本地网页 + HTTP 遥控
 *   node render.mjs schema                                     剧本的 JSON Schema（动作 / 场景 / 配饰枚举从引擎生成）
 *   node render.mjs composite --video main.mp4 --overlay cat.mov [--start 0] -o final.mp4   叠到主视频上
 *   node render.mjs auto --video main.mp4 --srt subs.srt [--corner] -o final.mp4           一条命令出成片
 *   node render.mjs hyperframes <剧本.json> -o compositions/mascot.html [--id mascot]      生成 HyperFrames 子合成（原生图层）
 *
 * 输出格式由扩展名决定：.mov = ProRes 4444 带透明 · .webm = VP9 带透明 · .mp4 = H.264（不透明）
 *                     .gif · 目录或 *.png = PNG 序列
 * render 选项：--fps N  --from S  --to S  --threads N  --with-audio  --font-dir DIR
 * draft 选项：--corner（右下角探头模式）  --side left|right  --accessories glasses,cap  --audio voice.wav
 */
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const require = createRequire(import.meta.url)
const GC = require('../prototype/cat-engine.js')
const SV = require('../prototype/cat-svg.js')
const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ---------------------------------------------------------- 共用 */
function loadScript(file, fpsOverride) {
  let s
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new Error(`读不了剧本 ${file}：${e.message}`) }
  if (!Array.isArray(s.timeline)) throw new Error('剧本需要 "timeline" 数组')
  const schedule = GC.buildSchedule(s.timeline, { scene: s.scene, accessories: s.accessories })
  const last = Math.max(0, ...s.timeline.map(e => e.at || 0))
  const cat = s.cat || {}
  return {
    s, schedule, base: path.dirname(path.resolve(file)),
    width: s.width || 1920, height: s.height || 1080, fps: +(fpsOverride || s.fps || 60),
    duration: s.duration || last + 3,
    view: { width: s.width || 1920, height: s.height || 1080, background: s.background || 'transparent' },
    viewAt: SV.viewTrack({ x: cat.x, y: cat.y, scale: cat.scale, flip: !!cat.flip }, s.timeline)
  }
}

// resvg 每次 new 都会重新扫描字体，扫系统字体目录一次要几百毫秒。
// 所以只给它几个确定的 CJK 字体文件，并且没有文字的帧完全不加载字体。
// 仓库自带 Noto Sans SC（OFL 开源协议），保证 macOS / Linux / Windows / 云端沙箱渲染结果一致；系统字体只作后备。
const BUNDLED_FONTS = fs.existsSync(path.join(HERE, 'fonts')) ? fs.readdirSync(path.join(HERE, 'fonts')).filter(f => /\.(ttf|otf|ttc)$/i.test(f)).map(f => path.join(HERE, 'fonts', f)) : []
const FONT_CANDIDATES = [
  ...BUNDLED_FONTS,
  '/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/Songti.ttc', '/System/Library/Fonts/STHeiti Medium.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',
  'C:\\Windows\\Fonts\\msyh.ttc', 'C:\\Windows\\Fonts\\simsun.ttc'
]
function makeRasterizer(fontDir) {
  const fontFiles = FONT_CANDIDATES.filter(f => fs.existsSync(f))
  if (fontDir) for (const f of fs.readdirSync(fontDir)) if (/\.(ttf|otf|ttc)$/i.test(f)) fontFiles.push(path.join(fontDir, f))
  const withText = { loadSystemFonts: false, fontFiles, defaultFontFamily: BUNDLED_FONTS.length ? 'Noto Sans SC' : 'Hiragino Sans GB' }
  const noText = { loadSystemFonts: false }
  return svg => new Resvg(svg, { font: svg.includes('<text') ? withText : noText, fitTo: { mode: 'original' } }).render().asPng()
}

// ffmpeg：优先环境变量 FFMPEG，其次系统 PATH，最后 npm 的 ffmpeg-static（可选依赖）
let FFMPEG_BIN = null
function ffmpegBin() {
  if (FFMPEG_BIN) return FFMPEG_BIN
  const tries = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean)
  for (const b of tries) if (spawnSync(b, ['-version'], { stdio: 'ignore' }).status === 0) return (FFMPEG_BIN = b)
  try { const b = require('ffmpeg-static'); if (b && fs.existsSync(b)) return (FFMPEG_BIN = b) } catch (_) {}
  throw new Error('找不到 ffmpeg：请安装（brew install ffmpeg / apt install ffmpeg），或设置环境变量 FFMPEG=/path/to/ffmpeg，或 npm install ffmpeg-static')
}

// 口型同步：ffmpeg 解码成单声道浮点 → 每帧 RMS → 归一化 + 起落平滑。返回每帧的张嘴量数组
function lipsyncEnvelope(file, fps) {
  const r = spawnSync(ffmpegBin(), ['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`解码音频失败 ${file}：${r.stderr}`)
  const pcm = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4)
  const hop = 16000 / fps, rms = []
  for (let i = 0; i * hop < pcm.length; i++) {
    let acc = 0; const a = Math.floor(i * hop), b = Math.min(pcm.length, Math.floor((i + 1) * hop))
    for (let j = a; j < b; j++) acc += pcm[j] * pcm[j]
    rms.push(Math.sqrt(acc / Math.max(1, b - a)))
  }
  const sorted = [...rms].sort((x, y) => x - y), ref = sorted[Math.floor(sorted.length * 0.95)] || 1
  const env = []; let v = 0
  for (const x of rms) {
    const target = Math.pow(Math.min(1, Math.max(0, (x / ref - 0.1) / 0.75)), 0.8)
    v += (target - v) * (target > v ? 0.6 : 0.3); env.push(Math.round(v * 1000) / 1000)
  }
  return env
}
const mouthFrom = (env, fps) => env ? (t => env[Math.max(0, Math.min(env.length - 1, Math.floor(t * fps)))] || 0) : null

/* ---------------------------------------------------------- 渲染 worker */
if (!isMainThread) {
  const { file, fps, env, fontDir, view } = workerData
  const job = loadScript(file, fps)
  Object.assign(job.view, view)
  const raster = makeRasterizer(fontDir), mouthAt = mouthFrom(env, job.fps)
  parentPort.on('message', ({ i, t }) => {
    // resvg 返回的 Buffer 指向外部内存，不能直接转移，先拷到普通 ArrayBuffer
    const png = new Uint8Array(raster(SV.frameSVG(GC.frameAt(job.schedule, t, { mouthAt }), Object.assign({}, job.view, job.viewAt(t)))))
    parentPort.postMessage({ i, png }, [png.buffer])
  })
}

/* ---------------------------------------------------------- 主线程 */
async function main() {
  const argv = process.argv.slice(2), cmd = argv[0]
  const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i < 0 ? dflt : argv[i + 1] }
  const flag = name => argv.includes('--' + name)
  const outArg = (() => { const i = argv.indexOf('-o'); return i < 0 ? null : argv[i + 1] })()
  const die = msg => { console.error('✗ ' + msg); process.exit(1) }

  try {
    if (cmd === 'list') console.log(JSON.stringify(catalog(), null, 2))
    else if (cmd === 'validate') { const j = loadScript(need(argv[1])); console.log(JSON.stringify({ ok: true, blocks: j.schedule.length, duration: j.duration, fps: j.fps, size: [j.width, j.height] })) }
    else if (cmd === 'still') still(need(argv[1]))
    else if (cmd === 'render') await render(need(argv[1]), outArg)
    else if (cmd === 'composite') composite(need(opt('video')), need(opt('overlay')), outArg, +(opt('start') || 0))
    else if (cmd === 'auto') await auto()
    else if (cmd === 'draft') draft(need(argv[1]), outArg)
    else if (cmd === 'live') live(+(opt('port') || 5199))
    else if (cmd === 'schema') console.log(JSON.stringify(schema(), null, 2))
    else if (cmd === 'hyperframes') hyperframesLayer(need(argv[1]), outArg)
    else { console.log('用法：node render/render.mjs list | schema | draft <字幕.srt> | validate <剧本> | still <剧本> --at 1,2.5 -o 目录 | render <剧本> -o out.mov | composite --video v.mp4 --overlay cat.mov -o final.mp4 | auto --video v.mp4 --srt s.srt -o final.mp4 | live'); process.exit(cmd ? 1 : 0) }
  } catch (e) { die(e.message || String(e.stack || e)) }

  function need(f) { if (!f) throw new Error('缺少文件路径'); return f }

  function catalog() {
    const pick = (o, f) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'calib').map(([k, v]) => [k, f(v)]))
    return {
      actions: pick(GC.STATES, v => ({ label: v.label, duration: v.dur, use: v.use })),
      scenes: pick(GC.SCENES, v => ({ label: v.label, use: v.use, text: !!v.text, big: !!v.big })),
      accessories: pick(GC.ACCESSORIES, v => ({ label: v.label, use: v.use })),
      backgrounds: ['transparent', 'green', 'dots', '#RRGGBB'],
      formats: { '.mov': 'ProRes 4444，带透明（首选）', '.webm': 'VP9，带透明', '.mp4': 'H.264，不透明', '.gif': '动图', 'dir/ 或 .png': 'PNG 序列，带透明' }
    }
  }

  function schema() {
    const actions = Object.keys(GC.STATES).filter(k => k !== 'calib'), scenes = Object.keys(GC.SCENES), accs = Object.keys(GC.ACCESSORIES)
    const list = (en, desc) => ({ description: desc, oneOf: [{ type: 'null' }, { type: 'string', enum: en }, { type: 'array', items: { type: 'string', enum: en }, uniqueItems: true }] })
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://github.com/gnipbao/geekcat-bot/render/script.schema.json',
      title: 'GeekCat 剧本', type: 'object', required: ['timeline'], additionalProperties: false,
      properties: {
        $schema: { type: 'string' },
        width: { type: 'integer', minimum: 64, default: 1920 }, height: { type: 'integer', minimum: 64, default: 1080 },
        fps: { type: 'number', minimum: 1, maximum: 120, default: 60 },
        duration: { type: 'number', exclusiveMinimum: 0, description: '秒；不写 = 最后一条 at + 3' },
        background: { type: 'string', pattern: '^(transparent|green|dots|#[0-9a-fA-F]{6})$', default: 'transparent' },
        cat: { type: 'object', additionalProperties: false, properties: {
          x: { type: 'number', description: '猫落地点（底部中心）横坐标，画面宽度的比例 0–1', default: 0.82 },
          y: { type: 'number', description: '落地点纵坐标，比例；角落探头用 1.0', default: 0.95 },
          scale: { type: 'number', description: '猫高占画面高的比例，0.4–0.8', default: 0.6 },
          flip: { type: 'boolean', description: '镜像。猫默认朝左看，放画面左边时设 true', default: false } } },
        scene: list(scenes, '全局默认场景'), accessories: { type: 'array', items: { type: 'string', enum: accs }, uniqueItems: true },
        lipsync: { type: 'string', description: '配音文件路径（相对剧本），嘴型按音量自动驱动' },
        timeline: { type: 'array', minItems: 1, items: { type: 'object', required: ['at'], additionalProperties: false, properties: {
          at: { type: 'number', minimum: 0, description: '秒' },
          cat: { type: 'object', additionalProperties: false, description: '从这一刻起把猫平滑移动到新位置', properties: { x: { type: 'number' }, y: { type: 'number' }, scale: { type: 'number' }, flip: { type: 'boolean' }, duration: { type: 'number', minimum: 0, default: 0.8 } } },
          do: { type: 'string', enum: actions, description: '动作；不写 = 保持当前动作' },
          scene: list(scenes, '粘性；null 清空；大姿势一次只能一个'),
          accessories: { type: 'array', items: { type: 'string', enum: accs }, uniqueItems: true, description: '粘性；[] 清空' },
          text: { description: '粘性；只对 sign / bubble 生效', oneOf: [{ type: 'string', maxLength: 40 }, { type: 'object', properties: { sign: { type: 'string' }, bubble: { type: 'string' } }, additionalProperties: false }] } } } }
      }
    }
  }

  // 把剧本变成一个 HyperFrames 子合成：引擎、绘制、时间表、位置轨道、口型包络全部内联，
  // 用一个 seek-safe 的代理补间按时间重绘，可以直接挂到任何 HyperFrames 工程的最上层轨道。
  function hyperframesLayer(file, out) {
    if (!out) throw new Error('用 -o 指定输出，比如 -o compositions/mascot.html')
    const job = loadScript(file)
    const id = opt('id', 'mascot'), fps = +(opt('fps') || 30)
    const audio = job.s.lipsync ? path.resolve(job.base, job.s.lipsync) : null
    const env = audio ? lipsyncEnvelope(audio, fps) : null
    const src = f => fs.readFileSync(path.join(HERE, '../prototype', f), 'utf8').replace(/<\/script/gi, '<\\/script')
    const data = { schedule: job.schedule, timeline: job.s.timeline, cat: job.s.cat || {}, env, fps, width: job.width, height: job.height, duration: job.duration }
    const html = `<!doctype html>
<html>
  <head><meta charset="UTF-8" /><title>GeekCat layer · ${id}</title></head>
  <body>
    <template>
      <style>
        #root { position: absolute; inset: 0; pointer-events: none; }
        #${id}-stage { position: absolute; inset: 0; }
        #${id}-stage svg { display: block; width: 100%; height: 100%; }
      </style>
      <div id="root" data-composition-id="${id}" data-width="${job.width}" data-height="${job.height}" data-duration="${job.duration}">
        <div id="${id}-stage" data-layout-ignore aria-hidden="true"></div>
      </div>
      <script>
${src('cat-engine.js')}
      </script>
      <script>
${src('cat-svg.js')}
      </script>
      <script>
        (function () {
          // 由 geekcat-bot 生成：node render/render.mjs hyperframes ${path.basename(file)}（请勿手改，改剧本后重新生成）
          var D = ${JSON.stringify(data)};
          var stage = document.getElementById('${id}-stage');
          var viewAt = GeekCatSVG.viewTrack(D.cat, D.timeline);
          var mouthAt = D.env ? function (t) { var i = Math.floor(t * D.fps); return D.env[Math.max(0, Math.min(D.env.length - 1, i))] || 0; } : null;
          function draw(t) {
            var F = GeekCat.frameAt(D.schedule, t, { mouthAt: mouthAt });
            var v = viewAt(t);
            stage.innerHTML = GeekCatSVG.frameSVG(F, { width: D.width, height: D.height, background: 'transparent', uid: '${id}', x: v.x, y: v.y, scale: v.scale, flip: v.flip });
          }
          var proxy = { t: 0 };
          var tl = gsap.timeline({ paused: true });
          tl.fromTo(proxy, { t: 0 }, { t: D.duration, duration: D.duration, ease: 'none', onUpdate: function () { draw(proxy.t); } }, 0);
          draw(0);
          window.__timelines['${id}'] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
    fs.writeFileSync(out, html)
    console.log(JSON.stringify({ ok: true, output: path.resolve(out), id, duration: job.duration, lipsync: !!env, bytes: html.length,
      host: `<div id="el-${id}" data-composition-id="${id}" data-composition-src="${path.basename(path.dirname(out))}/${path.basename(out)}" data-start="0" data-duration="${job.duration}" data-track-index="20" data-width="${job.width}" data-height="${job.height}"></div>` }))
  }

  function encoderArgs(out, fps, audio) {
    const ext = path.extname(out).toLowerCase()
    const inA = audio ? ['-i', audio] : []
    const mapA = audio ? ['-map', '0:v', '-map', '1:a', '-shortest'] : []
    const base = ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-', ...inA, ...mapA]
    if (ext === '.mov') return [...base, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', ...(audio ? ['-c:a', 'pcm_s16le'] : []), out]
    if (ext === '.webm') return [...base, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', '-row-mt', '1', ...(audio ? ['-c:a', 'libopus'] : []), out]
    if (ext === '.mp4') return [...base, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', ...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : []), out]
    if (ext === '.gif') return ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-', '-filter_complex', '[0:v]fps=25,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse', out]
    return null
  }

  async function render(file, outArg) {
    const job = loadScript(file, opt('fps'))
    if (!outArg) throw new Error('用 -o 指定输出，比如 -o out/demo.mov')
    const from = +(opt('from') || 0), to = +(opt('to') || job.duration)
    const audio = job.s.lipsync ? path.resolve(job.base, job.s.lipsync) : null
    const env = audio ? lipsyncEnvelope(audio, job.fps) : null
    const ext = path.extname(outArg).toLowerCase()
    if (ext === '.mp4' && job.view.background === 'transparent') { job.view.background = 'green'; console.error('! .mp4 不支持透明，已改用绿幕背景 #00B140') }
    const total = Math.round((to - from) * job.fps)
    const seq = !ext || ext === '.png'
    fs.mkdirSync(seq && !ext ? outArg : path.dirname(path.resolve(outArg)), { recursive: true })

    let ff = null, ffDone = null
    if (!seq) {
      const args = encoderArgs(outArg, job.fps, flag('with-audio') && audio ? audio : null)
      if (!args) throw new Error(`不支持的输出格式 "${ext}"`)
      ff = spawn(ffmpegBin(), args, { stdio: ['pipe', 'inherit', 'inherit'] })
      ffDone = new Promise(r => ff.on('close', r))
    }
    const write = async (i, png) => {
      if (seq) {
        const name = ext ? outArg.replace(/\.png$/i, `_${String(i).padStart(5, '0')}.png`) : path.join(outArg, `frame_${String(i).padStart(5, '0')}.png`)
        fs.writeFileSync(name, png)
      } else if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r))
    }

    // 多核：帧按顺序派发给空闲 worker，结果按帧号重排后写给 ffmpeg；窗口限制在途帧数，内存不会涨
    const threads = Math.max(1, Math.min(+(opt('threads') || Math.max(1, os.cpus().length - 1)), total))
    const t0 = Date.now()
    await new Promise((resolve, reject) => {
      const done = new Map(), idle = [], workers = []
      const WINDOW = threads * 4
      let nextDispatch = 0, nextWrite = 0, writing = false
      const dispatch = () => {
        while (idle.length && nextDispatch < total && nextDispatch < nextWrite + WINDOW) {
          const w = idle.pop(), i = nextDispatch++
          w.postMessage({ i, t: from + i / job.fps })
        }
      }
      const flush = async () => {
        if (writing) return
        writing = true
        try {
          while (done.has(nextWrite)) {
            const png = done.get(nextWrite); done.delete(nextWrite)
            await write(nextWrite, Buffer.from(png))
            nextWrite++
            if (nextWrite % job.fps === 0) process.stderr.write(`\r渲染 ${nextWrite}/${total} 帧`)
            dispatch()
          }
        } catch (e) { reject(e) }
        writing = false
        if (nextWrite >= total) { workers.forEach(w => w.terminate()); resolve() }
      }
      for (let k = 0; k < threads; k++) {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { file: path.resolve(file), fps: job.fps, env, fontDir: opt('font-dir'), view: job.view } })
        w.on('message', ({ i, png }) => { done.set(i, png); idle.push(w); dispatch(); flush() })
        w.on('error', reject)
        workers.push(w); idle.push(w)
      }
      if (total === 0) resolve()
      dispatch()
    })
    process.stderr.write(`\r渲染 ${total}/${total} 帧，${threads} 线程，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)
    if (ff) {
      ff.stdin.end()
      const code = await ffDone
      if (code !== 0) throw new Error(`ffmpeg 退出码 ${code}`)
    }
    console.log(JSON.stringify({ ok: true, output: path.resolve(outArg), frames: total, fps: job.fps, duration: +(to - from).toFixed(3), width: job.width, height: job.height, alpha: ['.mov', '.webm', '.png', ''].includes(ext) && job.view.background === 'transparent' }))
  }

  function still(file, dirArg, atArg) {
    const job = loadScript(file)
    const ats = String(atArg || opt('at', '1')).split(',').map(Number)
    const dir = dirArg || outArg || 'shots'
    fs.mkdirSync(dir, { recursive: true })
    const audio = job.s.lipsync ? path.resolve(job.base, job.s.lipsync) : null
    const mouthAt = mouthFrom(audio ? lipsyncEnvelope(audio, job.fps) : null, job.fps)
    const raster = makeRasterizer(opt('font-dir'))
    const files = ats.map(t => {
      const f = path.resolve(dir, `still_${t.toFixed(2)}s.png`)
      fs.writeFileSync(f, raster(SV.frameSVG(GC.frameAt(job.schedule, t, { mouthAt }), Object.assign({}, job.view, job.viewAt(t))))); return f
    })
    console.log(JSON.stringify({ ok: true, files }))
  }

  /* -------------------------------------------------------- 字幕 → 剧本草稿 */
  function draft(srtFile, outArg) {
    const subs = parseSRT(fs.readFileSync(srtFile, 'utf8'))
    if (!subs.length) throw new Error(`${srtFile} 里没有读到字幕`)
    const corner = flag('corner'), side = opt('side', 'right')
    const acc = opt('accessories') ? opt('accessories').split(',').map(s => s.trim()).filter(Boolean) : []
    const base = corner ? ['peek'] : []
    const tl = [{ at: 0, do: 'enter', scene: base, accessories: acc }]
    let lastAt = 0
    const add = (at, e) => { at = Math.max(at, lastAt + 0.8); tl.push(Object.assign({ at: +at.toFixed(2) }, e)); lastAt = at }
    for (const sub of subs) {
      const m = choreograph(sub.text, corner)
      const scene = [...base.filter(s => !m.big), ...(m.scene ? [m.scene] : [])]
      if (m.bubble && !scene.includes('bubble')) scene.push('bubble')
      const e = { do: m.do, scene }
      if (m.text) e.text = m.text
      add(sub.start - 0.2, e)
    }
    const end = subs[subs.length - 1].end
    add(end + 0.3, { do: 'exit', scene: base })
    const vid = opt('video') ? probe(opt('video')) : null
    const size = opt('size') ? opt('size').split('x').map(Number) : vid ? [vid.width, vid.height] : [1920, 1080]
    const script = {
      width: size[0], height: size[1], fps: vid ? Math.min(60, Math.round(vid.fps)) : 60, background: 'transparent',
      cat: corner ? { x: side === 'left' ? 0.12 : 0.88, y: 1.0, scale: 0.55, flip: side === 'left' } : { x: side === 'left' ? 0.16 : 0.84, y: 0.97, scale: 0.6, flip: side === 'left' },
      ...(opt('audio') ? { lipsync: path.relative(outArg ? path.dirname(path.resolve(outArg)) : process.cwd(), path.resolve(opt('audio'))) } : {}),
      timeline: tl, duration: +(lastAt + 1).toFixed(2)
    }
    // 先过一遍校验，草稿保证能直接渲染
    GC.buildSchedule(script.timeline, {})
    const json = JSON.stringify(script, null, 2)
    if (outArg) { fs.mkdirSync(path.dirname(path.resolve(outArg)), { recursive: true }); fs.writeFileSync(outArg, json); console.log(JSON.stringify({ ok: true, output: path.resolve(outArg), entries: tl.length, duration: script.duration })) }
    else console.log(json)
    return script
  }

  function probe(file) {
    const ffprobe = ffmpegBin().replace(/ffmpeg(\.exe)?$/, 'ffprobe$1')
    const r = spawnSync(fs.existsSync(ffprobe) || ffprobe === 'ffprobe' ? ffprobe : 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file], { encoding: 'utf8' })
    if (r.status === 0) {
      const j = JSON.parse(r.stdout), st = j.streams[0], [a, b] = st.r_frame_rate.split('/').map(Number)
      return { width: st.width, height: st.height, fps: a / (b || 1), duration: +j.format.duration }
    }
    // 没有 ffprobe（例如只装了 ffmpeg-static）：从 ffmpeg 的输出里读
    const e = spawnSync(ffmpegBin(), ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr || ''
    const m = e.match(/, (\d{2,5})x(\d{2,5})[, ]/), f = e.match(/([\d.]+) fps/), d = e.match(/Duration: (\d+):(\d+):([\d.]+)/)
    if (!m) throw new Error(`读不出视频尺寸：${file}`)
    return { width: +m[1], height: +m[2], fps: f ? +f[1] : 30, duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0 }
  }

  // 把透明叠加层合成到主视频上：叠加层自动缩放到主视频尺寸，从 start 秒开始，音轨原样保留
  function composite(video, overlay, out, start) {
    if (!out) throw new Error('用 -o 指定成片路径，比如 -o out/final.mp4')
    const v = probe(video)
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
    const fc = `[1:v]scale=${v.width}:${v.height},format=rgba,setpts=PTS-STARTPTS+${start}/TB[o];[0:v][o]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`
    const r = spawnSync(ffmpegBin(), ['-y', '-v', 'error', '-i', video, '-i', overlay, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'copy', '-movflags', '+faststart', out], { stdio: ['ignore', 'inherit', 'inherit'] })
    if (r.status !== 0) throw new Error('ffmpeg 合成失败')
    const res = { ok: true, output: path.resolve(out), width: v.width, height: v.height, duration: v.duration }
    console.log(JSON.stringify(res))
    return res
  }

  // 一条命令：字幕 → 剧本草稿 → 透明叠加层 → 合成成片。中间文件都留在 --work 目录里，方便 agent 检查和返工
  async function auto() {
    const video = need(opt('video')), srt = need(opt('srt'))
    if (!outArg) throw new Error('用 -o 指定成片路径')
    const work = opt('work') || path.join(path.dirname(path.resolve(outArg)), path.basename(outArg, path.extname(outArg)) + '.geekcat')
    fs.mkdirSync(work, { recursive: true })
    const scriptFile = path.join(work, 'script.json'), overlay = path.join(work, 'overlay.mov')
    draft(srt, scriptFile)
    const shots = path.join(work, 'shots')
    still(scriptFile, shots, loadScript(scriptFile).s.timeline.slice(1).map(e => e.at + 0.6).join(','))
    await render(scriptFile, overlay)
    composite(video, overlay, outArg, 0)
  }

  /* -------------------------------------------------------- 直播 / OBS */
  function live(port) {
    const clients = new Set()
    let state = { do: 'enter', scene: [], accessories: [], text: '' }
    const send = (res, code, body, type) => { res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(body) }
    const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css' }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end() }
      if (url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' })
        res.write(`data: ${JSON.stringify(state)}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return
      }
      if (url.pathname === '/play' && req.method === 'POST') {
        let body = ''
        req.on('data', c => { body += c })
        req.on('end', () => {
          try {
            const cmd = JSON.parse(body || '{}')
            const next = Object.assign({}, state, cmd)
            GC.buildSchedule([{ at: 0, do: next.do, scene: next.scene, accessories: next.accessories, ...(next.text ? { text: next.text } : {}) }], {})
            state = next
            for (const c of clients) c.write(`data: ${JSON.stringify(state)}\n\n`)
            send(res, 200, JSON.stringify({ ok: true, state, viewers: clients.size }))
          } catch (e) { send(res, 400, JSON.stringify({ ok: false, error: e.message })) }
        })
        return
      }
      if (url.pathname === '/state') return send(res, 200, JSON.stringify({ state, viewers: clients.size }))
      if (url.pathname === '/catalog') return send(res, 200, JSON.stringify(catalog()))
      const rel = url.pathname === '/' ? 'live.html' : url.pathname.slice(1)
      const f = path.resolve(HERE, '../prototype', rel)
      if (!f.startsWith(path.resolve(HERE, '../prototype')) || !fs.existsSync(f)) return send(res, 404, '{"ok":false}')
      send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream')
    })
    server.listen(port, '127.0.0.1', () => {
      console.log(`知识猫直播模式：http://localhost:${port}/?x=0.85&y=0.97&scale=0.6`)
      console.log(`OBS：添加「浏览器」源，填上面的地址，宽 1920 高 1080，背景自动透明`)
      console.log(`遥控：curl -X POST localhost:${port}/play -d '{"do":"talk","scene":["peek","bubble"],"text":"这里有坑！"}'`)
    })
  }
}

/* ---------------------------------------------------------- 字幕解析与编排规则 */
function parseSRT(src) {
  const ts = s => { const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : NaN }
  return src.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim().split('\n')).map(lines => {
    const i = lines.findIndex(l => l.includes('-->'))
    if (i < 0) return null
    const [a, b] = lines[i].split('-->')
    return { start: ts(a), end: ts(b), text: lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim() }
  }).filter(x => x && !isNaN(x.start) && x.text)
}

// 关键词 → 动作 / 场景。顺序即优先级；草稿给 agent 或人再改
const RULES = [
  { re: /谢谢|下期|再见|拜拜|关注|订阅/, do: 'wave', bubble: true },
  { re: /bug|报错|崩溃|异常|故障/i, do: 'idle', scene: 'spider', corner: 'scared' },
  { re: /坑|小心|注意|风险|危险|千万|错误/, do: 'scared' },
  { re: /没想到|竟然|居然|其实|震惊|原来如此/, do: 'surprised' },
  { re: /[？?]|为什么|怎么|是不是|吗$/, do: 'curious', bubble: true },
  { re: /总结|结论|所以|因此|关键|核心/, do: 'think' },
  { re: /(第[一二三四五六七八九十\d]+|首先|其次|最后|步骤)/, do: 'talk', scene: 'sign', sign: true },
  { re: /成功|搞定|完成|太棒|好消息|上线|恭喜/, do: 'cheer' },
  { re: /钱|成本|预算|价格|收入|赚|省/, do: 'idle', scene: 'money', corner: 'happy' },
  { re: /代码|编程|程序|电脑|技术|AI|模型|算法/i, do: 'talk', scene: 'laptop', corner: 'talk' },
  { re: /笔记|记下|写下|方案|清单/, do: 'idle', scene: 'write', corner: 'think' },
  { re: /资料|档案|归档|查一下|翻一翻|文档/, do: 'idle', scene: 'cabinet', corner: 'curious' },
  { re: /书|知识|学习|阅读|论文/, do: 'talk', scene: 'book', corner: 'talk' },
  { re: /无聊|等待|加载|好久|困/, do: 'sleep', scene: 'scroll', corner: 'sleep' },
  { re: /下班|摸鱼|放假|休息|周末/, do: 'idle', scene: 'ring', corner: 'cheer' },
  { re: /对|没错|是的|同意/, do: 'nod' },
  { re: /不是|不要|别|不对|错了/, do: 'shake' }
]
function choreograph(text, corner) {
  for (const r of RULES) {
    const m = text.match(r.re)
    if (!m) continue
    const out = { do: r.do }
    // 角落探头时猫只露出头，道具会被底边挡住：不用场景道具，换成对应的动作；举牌改成气泡
    if (r.scene && corner) out.do = r.corner || r.do
    else if (r.scene) { out.scene = r.scene; out.big = !!GC.SCENES[r.scene].big }
    if (r.sign) {
      // 牌子上只放关键词：从匹配处截到下一个标点，最多 8 个字
      const key = [...text.slice(m.index).split(/[，,。.！!？?；;：:、\s]/)[0]].slice(0, 8).join('')
      if (corner) { out.bubble = true; out.text = key } else out.text = key
    }
    if (r.bubble && [...text].length <= 14) { out.bubble = true; out.text = text }
    return out
  }
  return { do: 'talk' }
}

// 放在文件末尾：main 用到下面的 RULES 等常量
if (isMainThread) main()
