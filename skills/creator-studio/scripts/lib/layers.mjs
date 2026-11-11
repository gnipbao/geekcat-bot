// 图层生成：场景、字幕、主讲（真人 / 数字人视频）、录屏、竖版标题条、根合成。每个图层都是 seek-safe 的 HyperFrames 子合成。
import { captionCSS } from './theme.mjs'
import { presenterRect, fitFace, screenRect, focusTransform, V_LAYOUT } from './geometry.mjs'
import { modeAt } from './project.mjs'

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const wrap = (title, style, body, script) => `<!doctype html>
<html>
  <head><meta charset="UTF-8" /><title>${title}</title></head>
  <body>
    <template>
      <style>
${style}
      </style>
${body}
      <script>
        (function () {
${script}
        })();
      </script>
    </template>
  </body>
</html>
`

// 旧场景兜底：紧跟在另一行标题后面的标题里，带边框的行内高亮 span 打上 data-hl（base.css 把它变成行内块，不再压住上一行）
export const legacyHL = markup => markup.replace(/(<\/h[1-4]>\s*<h[1-4]\b[^>]*>)((?:(?!<\/h[1-4]>)[\s\S])*?)<span style="([^"]*\bborder\b[^"]*)"/g, '$1$2<span data-hl style="$3"')

/** 场景：标记 + 时间轴代码（build/scenes/sNN.html），注入主题 CSS 和 prelude。ground：{color} | {none} | {invert} */
export function sceneHTML({ sl, theme, fontsCSS, markup, js, prelude, ledger, hideCounter, W, H }) {
  const g = sl.ground, sel = '#' + sl.id
  const style = [fontsCSS, theme.css(sel),
    g.color ? `${sel} { --ground: ${g.color}; }` : '',
    g.none ? `${sel} .ground, ${sel} .dots { display: none; }` : '',
    hideCounter ? `${sel} .counter { display: none; }` : ''].filter(Boolean).join('\n')
  const pre = prelude.replace('__ID__', sl.id).replace('__D__', sl.D).replace('__A__', sl.A).replace('__IN__', sl.IN).replace('__OUT__', sl.OUT).replace('__TILT__', theme.json.tilt ?? 1)
  const body = `      <div id="${sl.id}"${g.invert ? ' class="tone-invert"' : ''} data-composition-id="${sl.id}" data-width="${W}" data-height="${H}" data-duration="${sl.D}">
${legacyHL(markup.trim()).replaceAll('class="ghost"', 'class="ghost" data-layout-ignore aria-hidden="true"')}
      </div>`
  return wrap(sl.id, style, body, `${pre}\n${(js || '').trim().replace('__LEDGER__', ledger)}\n          window.__timelines["${sl.id}"] = tl;`)
}

/** 卡拉 OK 字幕：正在念的字高亮，念过的实色，未念的稍淡。zone：{left,width,bottom,size} */
export function captionsHTML({ W, H, TOTAL, theme, fontsCSS, zone, data, look = 'card' }) {
  const style = `${fontsCSS}
        #captions { position: absolute; inset: 0; pointer-events: none; }
        #cap-zone { position: absolute; left: ${zone.left}px; width: ${zone.width}px; bottom: ${zone.bottom}px; display: flex; justify-content: center; }
        ${captionCSS(theme, zone.size, look)}`
  const body = `      <div id="captions" data-composition-id="captions" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        <div id="cap-zone" data-layout-allow-overlap data-layout-allow-occlusion><div id="cap-card" data-layout-allow-overlap data-layout-allow-occlusion></div></div>
      </div>`
  const script = `          // 每帧按时间决定：显示哪一屏、哪些字已念过、哪个字正在念。纯函数，seek-safe
          var C = ${JSON.stringify(data)};
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
              return '<span' + (cls ? ' class="' + cls + '"' : '') + ' data-layout-allow-overlap data-layout-allow-occlusion>' + esc(ch[0]) + '</span>';
            }).join('');
          }
          var proxy = { t: 0 };
          var tl = gsap.timeline({ paused: true });
          tl.fromTo(proxy, { t: 0 }, { t: ${TOTAL}, duration: ${TOTAL}, ease: 'none', onUpdate: function () { draw(proxy.t); } }, 0);
          draw(0);
          window.__timelines["captions"] = tl;`
  return wrap('captions', style, body, script)
}

// 关键帧补间：第一帧 set，之后每个变化点默认 0.6 秒 power3.inOut；d: 0 = 硬切（跳推），d 很长 = 缓推；off 用淡出淡入
const tweenBody = (F, I, keys) => `var K = ${JSON.stringify(keys)};
          tl.set('${F}', K[0].f, 0); tl.set('${I}', K[0].i, 0);
          for (var k = 1; k < K.length; k++) {
            var a = K[k], prevOff = K[k - 1].f.opacity === 0, d = a.d == null ? 0.6 : a.d, e = a.e || 'power3.inOut';
            if (a.f.opacity === 0) { tl.to('${F}', { opacity: 0, duration: 0.4, ease: 'power2.out' }, a.t); continue; }
            if (prevOff) { tl.set('${F}', Object.assign({}, a.f, { opacity: 0 }), a.t); tl.set('${I}', a.i, a.t); tl.to('${F}', { opacity: 1, duration: 0.45, ease: 'power2.out' }, a.t); continue; }
            if (d === 0) { tl.set('${F}', a.f, a.t); tl.set('${I}', a.i, a.t); continue; }
            tl.to('${F}', Object.assign({ duration: d, ease: e }, a.f), a.t);
            tl.to('${I}', Object.assign({ duration: d, ease: e }, a.i), a.t);
          }`
const tweenScript = (id, keys, TOTAL) => `          var tl = gsap.timeline({ paused: true });
          ${tweenBody(`#${id}-frame`, `#${id}-inner`, keys)}
          tl.set({}, {}, ${TOTAL});
          window.__timelines["${id}"] = tl;`

/** 版式轨道 → 画框和画面的关键帧（真人视频、数字人、舞台模式的 IP 角色共用）。
 *  轨道条目：{ at, mode: full|side|pip|off, corner, size, rect, shape, zoom, cut, over }
 *  zoom 推近倍数（绕着脸）；cut: true 硬切（跳推）；over: 秒数，缓推这么久；shift: [dx, dy] 把人往旁边挪（画框宽高的比例） */
export function presenterKeys({ W, H, theme, SW, SH, face, track, layout = 'landscape', free = false }) {
  const pz = theme.json.presenter, bw = pz.bw ?? 3
  let prev = null
  const keys = track.map(k => {
    const mode = layout === 'vertical' && k.mode !== 'off' ? 'card' : k.mode
    if (mode === 'off') { prev = null; return { t: k.at, f: { opacity: 0 } } }
    const R = presenterRect(mode, layout === 'vertical' ? {} : k, W, H, { bw, radius: pz.radius, pipRadius: pz.pipRadius }, layout)
    const fit = fitFace(R, SW, SH, face, mode === 'card' ? 'side' : mode, k.zoom || 1, layout === 'vertical' ? [0, 0] : k.shift || [0, 0], free)
    const sameFrame = prev && prev.x === R.x && prev.y === R.y && prev.w === R.w && prev.h === R.h
    prev = R
    const key = { t: k.at, f: { left: R.x, top: R.y, width: R.w, height: R.h, borderRadius: R.r, borderWidth: R.bw, opacity: 1 }, i: { x: fit.x, y: fit.y, scale: fit.s } }
    if (k.cut) key.d = 0
    else if (k.over) { key.d = +k.over; key.e = 'sine.inOut' }
    else if (sameFrame) { key.d = 0.35; key.e = 'power3.out' }      // 同一个画框里只变推近：快进（Quick In）
    return key
  })
  // 第一帧如果是 off，先给一个几何位置，淡入时才不会从左上角飞出来
  const firstOn = keys.find(k => k.f.opacity !== 0)
  if (keys[0].f.opacity === 0 && firstOn) keys[0] = { t: 0, f: { ...firstOn.f, opacity: 0 }, i: firstOn.i }
  if (!firstOn) keys[0] = { t: 0, f: { left: 0, top: 0, width: 10, height: 10, opacity: 0 }, i: { x: 0, y: 0, scale: 0.01 } }
  return keys
}

/** 主讲视频（camera / avatar）：静音视频（声音走旁白音轨）放在画框里，按版式轨道在全屏 / 侧栏 / 小窗 / 隐藏之间切换，人脸居中 */
export function presenterHTML({ W, H, TOTAL, theme, src, SW, SH, face, track, layout = 'landscape', mediaBase = '../' }) {
  const pz = theme.json.presenter
  const keys = presenterKeys({ W, H, theme, SW, SH, face, track, layout })
  const style = `        #presenter { position: absolute; inset: 0; pointer-events: none; }
        #presenter-frame { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; box-sizing: border-box; overflow: hidden; border-style: solid; ${pz.frame} }
        #presenter-inner { position: absolute; left: 0; top: 0; width: ${SW}px; height: ${SH}px; transform-origin: 0 0; }
        #presenter-video { position: absolute; left: 0; top: 0; right: auto; bottom: auto; width: ${SW}px; height: ${SH}px; object-fit: fill; }`
  const body = `      <div id="presenter" data-composition-id="presenter" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        <div id="presenter-frame" data-layout-ignore><div id="presenter-inner">
          <video id="presenter-video" class="clip" src="${mediaBase}${esc(src)}" muted playsinline data-start="0" data-duration="${TOTAL}" data-track-index="0"></video>
        </div></div>
      </div>`
  return wrap('presenter', style, body, tweenScript('presenter', keys, TOTAL))
}

/** 舞台模式的 IP 角色：角色图层（自己的 1920×1080 "机位"）装进和真人一样的画框里，背后是主题的演播背景。
 *  画框在根合成上，由根时间轴驱动（子合成的时间轴够不到宿主元素）。返回 { html, css, script }，交给 rootHTML */
export function mascotStage({ W, H, theme, id, src, start, dur, SW, SH, face, track, layout = 'landscape', z }) {
  const pz = theme.json.presenter
  const keys = presenterKeys({ W, H, theme, SW, SH, face, track, layout, free: true })
  return {
    css: `      #pstage-frame { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; box-sizing: border-box; overflow: hidden; border-style: solid; z-index: ${z}; ${pz.frame} background: ${pz.stage || '#F2F0EC'}; }
      #pstage-inner { position: absolute; left: 0; top: 0; width: ${SW}px; height: ${SH}px; transform-origin: 0 0; }`,
    html: `      <div id="pstage-frame" data-layout-ignore><div id="pstage-inner">
        <div id="el-${id}" data-composition-id="${id}" data-composition-src="${src}" data-start="${start}" data-duration="${dur}" data-track-index="20" data-width="${SW}" data-height="${SH}"></div>
      </div></div>`,
    script: `(function () { var tl = window.__timelines["root"];
          ${tweenBody('#pstage-frame', '#pstage-inner', keys)}
        })();`,
  }
}

/** 录屏图层：主题窗口框（或全幅），跟着主讲版式让位；focus 关键帧推近；加速段角标。screen：screen.json */
export function screenHTML({ W, H, TOTAL, theme, fontsCSS, screen, SW, SH, track, videoPresenter, captions, speed = [], mediaBase = '../' }) {
  const frame = screen.frame || 'window', bar = frame === 'window' ? 52 : 0
  const focus = (screen.focus || []).map(f => ({ ...f, at: +f.at })).sort((a, b) => a.at - b.at)
  const focusAt = t => { let cur = null; for (const f of focus) if (f.at <= t + 1e-6) cur = f; return cur && cur.box && (cur.until == null || t < cur.until - 1e-6) ? cur.box : null }
  const times = new Set([0])
  if (videoPresenter) for (const k of track) times.add(k.at)
  for (const f of focus) { times.add(f.at); if (f.until != null) times.add(+f.until) }
  const keys = [...times].filter(t => t < TOTAL).sort((a, b) => a - b).map(t => {
    const k = videoPresenter ? modeAt(track, t) : { mode: 'off' }
    const R = screenRect(k.mode === 'full' ? 'off' : k.mode, k, W, H, SW / SH, { frame, captions, bar })
    const tf = focusTransform({ w: R.w - (frame === 'window' ? 2 * (theme.json.presenter.bw ?? 3) : 0), h: R.h - bar }, SW, SH, focusAt(t))
    return { t, f: { left: R.x, top: R.y, width: R.w, height: R.h, opacity: 1 }, i: { x: tf.x, y: tf.y, scale: tf.s, '--z': tf.s } }
  })
  // 标注（录屏原始像素坐标）：跟着录屏一起移动、推近；线宽和字号除以缩放倍数，看起来始终一样粗
  const marks = (screen.marks || []).map((m, i) => {
    const [x, y, w, h] = m.box, until = m.until ?? Math.min(TOTAL, +m.at + 3)
    const cls = m.style === 'spot' ? 'spot' : 'callout'
    const below = m.labelAt === 'below' || (m.labelAt !== 'above' && y < 70)   // 框贴着录屏顶边时标签放到框下面，免得被裁
    return `<div id="screen-mark-${i}" class="${cls} clip" data-start="${+m.at}" data-duration="${+(until - m.at).toFixed(3)}" style="left:${x}px; top:${y}px; width:${w}px; height:${h}px; z-index:2;${cls === 'callout' ? ' border-width:calc(5px / var(--z, 1));' : ''}">${m.label ? `<div class="callout-label" style="font-size:calc(26px / var(--z, 1)); padding:calc(6px / var(--z, 1)) calc(16px / var(--z, 1));${below ? ' bottom:auto; top:100%; margin-top:calc(10px / var(--z, 1)); margin-bottom:0;' : ' margin-bottom:calc(10px / var(--z, 1));'}${cls === 'spot' ? ` position:absolute; left:0;${below ? '' : ' bottom:100%;'} background:var(--accent); color:var(--on-accent); font-family:var(--font-label); font-weight:700; white-space:nowrap;` : ''}">${esc(m.label)}</div>` : ''}</div>`
  }).join('\n          ')
  // 视频：整段一个；或 segments（稿子先行的教程：按场景指定源素材起止，速度自动拉伸到这段时长）
  const segs = (screen.segments && screen.segments.length ? screen.segments : [{ at: 0, src: null }]).map((s, i, a) => {
    const at = +s.at, dur = +(s.dur ?? ((i + 1 < a.length ? +a[i + 1].at : TOTAL) - at)).toFixed(3)
    const rate = s.src && s.fit !== false ? +((s.src[1] - s.src[0]) / dur).toFixed(4) : 1
    return { at, dur, mediaStart: s.src ? s.src[0] : 0, rate }
  })
  const videos = segs.map((s, i) => `<video id="screen-video-${i}" class="clip" src="${mediaBase}${esc(screen.src)}" muted playsinline data-start="${s.at}" data-duration="${s.dur}"${s.mediaStart ? ` data-media-start="${s.mediaStart}"` : ''}${s.rate !== 1 ? ` data-playback-rate="${s.rate}"` : ''} data-track-index="${i % 2}" style="position:absolute;left:0;top:0;right:auto;bottom:auto;width:${SW}px;height:${SH}px;"></video>`).join('\n          ')
  const badges = speed.map((s, i) => `<div id="screen-speed-${i}" class="speed clip" data-start="${s.at}" data-duration="${s.dur}" style="position:absolute; right:18px; top:${bar + 18}px; z-index:3;">⏩ ${s.x}×</div>`).join('\n        ')
  const style = `${fontsCSS}
${theme.css('#screen')}
        #screen { pointer-events: none; }
        #screen-frame { left: 0; top: 0; width: ${W}px; height: ${H}px; ${frame === 'full' ? 'border: none; box-shadow: none; border-radius: 0;' : ''} }
        #screen-view { position: absolute; left: 0; right: 0; top: ${bar}px; bottom: 0; overflow: hidden; background: #000; }
        #screen-inner { position: absolute; left: 0; top: 0; width: ${SW}px; height: ${SH}px; transform-origin: 0 0; }`
  const body = `      <div id="screen" data-composition-id="screen" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        <div id="screen-frame" class="window" data-layout-ignore>
          ${bar ? `<div class="window-bar"><i></i><i></i><i></i><span>${esc(screen.title || '')}</span></div>` : ''}
          <div id="screen-view"><div id="screen-inner">
          ${videos}
          ${marks}
          </div></div>
        ${badges}
        </div>
      </div>`
  return wrap('screen', style, body, tweenScript('screen', keys, TOTAL))
}

/** 章节胶囊：顶部居中，显示当前章节，换章时换字（口播默认开；标题取 scenes.json 的 title，去掉编号） */
export function chaptersHTML({ W, H, TOTAL, theme, fontsCSS, scenes, top = 44 }) {
  const pills = scenes.map((s, i) => {
    const a = i === 0 ? 0 : +s.start, e = i + 1 < scenes.length ? +scenes[i + 1].start : TOTAL
    const name = String(s.title || '').replace(/^\d+\s*/, '')
    return name ? `<div id="chapters-${i}" class="clip" data-start="${a}" data-duration="${+(e - a).toFixed(3)}" style="position:absolute; left:0; right:0; top:${top}px; display:flex; justify-content:center;"><div class="pill" style="position:static; font-size:28px;"><b>${String(i + 1).padStart(2, '0')}</b>${esc(name)}</div></div>` : ''
  }).join('\n        ')
  const body = `      <div id="chapters" data-composition-id="chapters" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        ${pills}
      </div>`
  return wrap('chapters', `${fontsCSS}\n${theme.css('#chapters')}\n        #chapters { pointer-events: none; }`, body, `          var tl = gsap.timeline({ paused: true }); tl.set({}, {}, ${TOTAL});\n          window.__timelines["chapters"] = tl;`)
}

/** 底板：主题底色 + 纹理铺满整个画面（录屏窗口外、透明场景下面露出来的就是它） */
export function backdropHTML({ W, H, TOTAL, theme, fontsCSS }) {
  const body = `      <div id="backdrop" data-composition-id="backdrop" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        <div class="ground"></div><div class="dots"></div>
      </div>`
  return wrap('backdrop', `${fontsCSS}\n${theme.css('#backdrop')}`, body, `          var tl = gsap.timeline({ paused: true }); tl.set({}, {}, ${TOTAL});\n          window.__timelines["backdrop"] = tl;`)
}

/** 竖版背景 + 标题条：主题底色和纹理铺满，上方栏目名 + 标题 + 当前章节，舞台画框 */
export function vheaderHTML({ W, H, TOTAL, theme, fontsCSS, label, title, scenes, stage }) {
  const chapters = scenes.map((s, i) => {
    const a = i === 0 ? 0 : +s.start, e = i + 1 < scenes.length ? +scenes[i + 1].start : TOTAL
    const name = String(s.title || '').replace(/^\d+\s*/, '')
    return `<div id="vheader-ch-${i}" class="label vh-ch clip" data-start="${a}" data-duration="${+(e - a).toFixed(3)}" style="position:absolute; left:60px; top:262px; font-size:26px; color:var(--muted);">${String(i + 1).padStart(2, '0')} · ${esc(name)}</div>`
  }).join('\n        ')
  const bw = theme.json.presenter.bw ?? 3
  // 标题一行放得下就一行（最大 62px），放不下缩到 44px 再折行
  const em = [...String(title)].reduce((w, ch) => w + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : /\s/.test(ch) ? 0.3 : 0.58), 0) || 1
  const tsize = Math.max(44, Math.min(62, Math.floor(950 / em)))
  const style = `${fontsCSS}
${theme.css('#vheader')}
        #vheader .vh-title { position: absolute; left: 60px; top: 146px; width: 960px; font-family: var(--font-cjk-display); font-weight: 900; font-size: ${tsize}px; line-height: 1.22; letter-spacing: -0.01em; white-space: ${tsize > 44 ? 'nowrap' : 'normal'}; }
        #vheader .vh-stage { left: ${stage.x - bw}px; top: ${stage.y - bw}px; width: ${stage.w + 2 * bw}px; height: ${stage.h + 2 * bw}px; background: #000; }`
  const body = `      <div id="vheader" data-composition-id="vheader" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
        <div class="ground"></div><div class="dots"></div>
        ${label ? `<div class="pill" style="left:60px; top:78px;">${esc(label)}</div>` : ''}
        <div class="vh-title">${esc(title)}</div>
        ${chapters}
        <div class="card vh-stage" data-layout-ignore></div>
      </div>`
  return wrap('vheader', style, body, `          var tl = gsap.timeline({ paused: true }); tl.set({}, {}, ${TOTAL});\n          window.__timelines["vheader"] = tl;`)
}

/** 根合成：图层宿主 + 旁白音轨。hosts：[{id, src, start, dur, track, z, style?, wrap?}] */
export function rootHTML({ W, H, TOTAL, title, fontsCSS, hosts, narration, extraCSS = '', stage, extraHTML = '', rootScript = '', audios = [] }) {
  const host = h => `<div id="el-${h.id}" data-composition-id="${h.id}" data-composition-src="${h.src}" data-start="${h.start}" data-duration="${h.dur}" data-track-index="${h.track}" data-width="${h.w || W}" data-height="${h.h || H}"${h.attrs || ''}></div>`
  const top = hosts.filter(h => !h.staged).map(h => '      ' + host(h)).join('\n')
  const staged = hosts.filter(h => h.staged)
  const stageHTML = staged.length ? `      <div id="v-stage" data-layout-ignore style="position:absolute; left:${stage.x}px; top:${stage.y}px; width:1920px; height:1080px; transform:scale(${(stage.w / 1920).toFixed(6)}); transform-origin:0 0; overflow:hidden; z-index:10;">
${staged.map(h => '        ' + host(h)).join('\n')}
      </div>` : ''
  const zs = hosts.map(h => `      #el-${h.id} { z-index: ${h.z}; }`).join('\n')
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${fontsCSS}
      body { margin: 0; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
      [data-composition-id="root"] div[data-composition-src] { position: absolute; inset: 0; }
${zs}
${extraCSS}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="root" data-start="0" data-width="${W}" data-height="${H}" data-duration="${TOTAL}">
${top}
${stageHTML}
${extraHTML}
      <audio id="narration" src="${narration}" data-start="0" data-duration="${TOTAL}" data-track-index="10" data-volume="1"></audio>
${audios.map((a, i) => `      <audio id="${a.id || 'sfx-' + i}" src="${a.src}" data-start="${a.at}"${a.dur ? ` data-duration="${a.dur}"` : ''} data-track-index="${a.track ?? 11 + (i % 4)}" data-volume="${a.volume}"></audio>`).join('\n')}
    </div>
    <script>
      window.__timelines["root"] = gsap.timeline({ paused: true });
      window.__timelines["root"].set({}, {}, ${TOTAL});
      ${rootScript}
    </script>
  </body>
</html>
`
}
