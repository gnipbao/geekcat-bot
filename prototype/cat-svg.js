/* 知识猫 GeekCat · 帧 → SVG 字符串
 * 浏览器预览和离线导出共用这一个函数：导出的视频就是预览看到的画面，没有第二套绘制。
 * 配饰在"静息坐标"里画，外面套引擎给的跟随矩阵，所以它们和猫的歪头、挤压、打滚、大姿势完全同步。
 */
(function (global) {
  const INK = '#17161A', WHITE = '#FFFFFF', YELLOW = '#FFC83D', PINK = '#F48FA4', PAPER = '#FBFAF6', LINE = '#AEB4BF'
  const FONT = "'Noto Sans SC','PingFang SC','Hiragino Sans GB','Heiti SC','Microsoft YaHei',sans-serif"
  const DISPLAY = "'Noto Serif SC','Songti SC','STSong','Hiragino Mincho ProN',serif"
  const n = v => Math.round(v * 10) / 10
  const n3 = v => Math.round(v * 1000) / 1000
  const P = p => n(p[0]) + ' ' + n(p[1])
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const em = s => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1 : ch === ' ' ? 0.32 : 0.6), 0)
  const op = a => a >= 0.999 ? '' : ` opacity="${n3(Math.max(0, a))}"`
  const mat = m => `matrix(${m.join(' ')})`

  // 文字：镜像翻转时单独反向翻回来，字永远是正的
  function text(x, y, str, size, o) {
    o = o || {}
    return `<text transform="translate(${n(x)} ${n(y)}) scale(${o.flip ? -1 : 1} 1)" y="${n(size * 0.36)}" font-size="${n(size)}" font-family="${o.family || FONT}" font-weight="${o.weight || 700}" fill="${o.fill || INK}" text-anchor="middle"${op(o.a == null ? 1 : o.a)}>${esc(str)}</text>`
  }
  function wrap(str, maxEm) {
    const out = []
    for (const para of String(str).split('\n')) {
      let line = ''
      for (const ch of para) { if (em(line + ch) > maxEm && line) { out.push(line); line = ch } else line += ch }
      out.push(line)
    }
    return out
  }
  // 小鱼：和猫一样是墨黑剪影，白色描边和白色鱼眼让它在黑猫身上也看得见（参考 Canva 稿里吊着的那条鱼）
  function fish(x, y, s, rot) {
    return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n3(s)})">` +
      `<path d="M15 0 L30 -12 Q26 0 30 12 Z M-22 0 Q-4 -15 17 0 Q-4 15 -22 0 Z" fill="${INK}" stroke="${WHITE}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/>` +
      `<circle cx="-12" cy="-2" r="3.2" fill="${WHITE}"/><path d="M-3 -7 Q1 0 -3 7 M4 -5 Q7 0 4 5" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round"/></g>`
  }
  const mitten = (x, y, s) => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(25 * s)}" ry="${n(19 * s)}" fill="${INK}" stroke="${WHITE}" stroke-width="${n(3 * s)}"/>`
  const pop = (w, s) => Math.max(0.001, n3(s * (0.75 + 0.25 * w)))
  function bill(x, y, rot, s) {
    return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rot)}) scale(${n3(s || 1)})"><rect x="-46" y="-24" width="92" height="48" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="3.5"/><rect x="-38" y="-16" width="76" height="32" rx="2" fill="none" stroke="${INK}" stroke-width="1.6"/><circle r="11" fill="none" stroke="${INK}" stroke-width="2.4"/><path d="M-5 -6 L0 0 L5 -6 M0 0 V7 M-5 2 H5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></g>`
  }

  /* ---------------------------------------------------------- 场景：猫身后 */
  function sceneBack(F, o) {
    const r = F.r, pr = F.props, s = F.scale, t = F.t
    let out = ''
    const wf = r.sc_fishing
    if (wf > 0.01) {
      const p = pr.fishing
      out += `<g${op(wf)}><path d="M${P(p.pivot)}L${P(p.fish)}" stroke="${INK}" stroke-width="2.5" fill="none"/>` +
        `<g transform="translate(${P(p.fish)}) rotate(${n(90 + p.rot)}) scale(2.4) translate(22 0)">${fish(0, 0, 1, 0)}</g></g>`
    }
    const wp = r.sc_point
    if (wp > 0.01) {
      const a = F.arms[0], L = 150, e = [a.tip[0] + Math.cos(a.dir) * L * s, a.tip[1] + Math.sin(a.dir) * L * s]
      out += `<g${op(wp)}><path d="M${P(a.tip)}L${P(e)}" stroke="${INK}" stroke-width="${n(8 * s)}" stroke-linecap="round"/><path d="M${P(a.tip)}L${P(e)}" stroke="${YELLOW}" stroke-width="${n(3 * s)}" stroke-linecap="round" opacity=".55"/><circle cx="${n(e[0])}" cy="${n(e[1])}" r="${n(9 * s)}" fill="${YELLOW}" stroke="${INK}" stroke-width="${n(3 * s)}"/></g>`
    }
    const wsc = r.sc_scroll
    if (wsc > 0.01) {
      out += `<g${op(wsc)} transform="translate(0 ${n((1 - wsc) * 30)})">` +
        `<path d="M-30 650 H600 Q614 676 600 702 H-30 Z" fill="${PAPER}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<ellipse cx="-30" cy="676" rx="16" ry="27" fill="${PAPER}" stroke="${INK}" stroke-width="5"/><ellipse cx="-30" cy="676" rx="6" ry="11" fill="none" stroke="${INK}" stroke-width="3"/>` +
        `<ellipse cx="604" cy="676" rx="16" ry="27" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M40 668 H560 M40 684 H520" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/></g>`
    }
    const ww = r.sc_write
    if (ww > 0.01) {
      const prog = pr.write.progress
      let scrib = ''
      for (let k = 0; k < 4; k++) { const lp = Math.max(0, Math.min(1, prog * 4 - k)); if (lp > 0) scrib += `<path d="M${n(-10 + k * 6)} ${650 + k * 14} q12 -8 24 0 t24 0 t24 0 t24 0 t24 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-dasharray="140" stroke-dashoffset="${n(140 * (1 - lp))}"/>` }
      out += `<g${op(ww)}>` +
        `<path d="M-60 642 L210 624 L262 700 L-30 722 Z" fill="${PAPER}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M-30 660 L200 645 M-24 678 L212 662 M-18 696 L224 680" stroke="${LINE}" stroke-width="2.5"/>` + scrib +
        `<g transform="translate(-120 640)"><path d="M-24 0 Q-30 -30 -12 -38 V-50 H12 V-38 Q30 -30 24 0 Q24 16 0 16 Q-24 16 -24 0 Z" fill="${INK}" stroke="${WHITE}" stroke-width="2.5"/><path d="M-12 -4 Q-14 -18 -6 -26" stroke="${WHITE}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<path d="M2 -48 Q-30 -120 -60 -170 Q-20 -140 6 -60 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M2 -50 L-56 -164 M-14 -92 L-34 -96 M-22 -112 L-44 -118 M-30 -132 L-50 -140" stroke="${INK}" stroke-width="1.8"/></g></g>`
    }
    const wr = r.sc_ring
    if (wr > 0.01) out += ringPart(pr.ring, wr, false, o.uid)
    const wc = r.sc_cabinet
    if (wc > 0.01) {
      out += `<g${op(wc)}><path d="M100 492 L150 440 L480 440 L430 492 Z" fill="#DADDE3" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M170 444 L140 490 M230 444 L200 490 M380 444 L350 490 M440 444 L410 490" stroke="${INK}" stroke-width="3"/></g>`
    }
    const wm = r.sc_money
    if (wm > 0.01) {
      const B = [[-40, 600, -20], [60, 640, 12], [170, 610, -8], [300, 650, 18], [420, 615, -14], [530, 645, 8], [10, 520, 30], [500, 520, -28], [250, 690, 4], [120, 690, -12], [400, 690, 10]]
      out += `<g${op(wm)}>${B.map(b => bill(b[0], b[1], b[2], 1.1)).join('')}</g>`
    }
    return out
  }

  function ringPart(p, w, front, uid) {
    const cy = 545 + p.y, cx = 262, RX = 250, RY = 80, rx = 160, ry = 40
    const id = (uid || 'gc') + (front ? 'rf' : 'rb')
    const band = `M${cx - RX} ${n(cy)} A${RX} ${RY} 0 1 0 ${cx + RX} ${n(cy)} A${RX} ${RY} 0 1 0 ${cx - RX} ${n(cy)} Z M${cx - rx} ${n(cy)} A${rx} ${ry} 0 1 1 ${cx + rx} ${n(cy)} A${rx} ${ry} 0 1 1 ${cx - rx} ${n(cy)} Z`
    let stripes = ''
    for (const a of (front ? [0.28, 0.5, 0.72] : [-0.62, -0.38])) {
      const ang = a * Math.PI, c = Math.cos(ang), s = Math.sin(ang)
      stripes += `<path d="M${n(cx + c * rx)} ${n(cy + s * ry)} L${n(cx + c * RX)} ${n(cy + s * RY)}" stroke="${PINK}" stroke-width="34"/>`
    }
    const clip = front ? `<clipPath id="${id}"><rect x="-200" y="${n(cy)}" width="1000" height="400"/></clipPath>` : `<clipPath id="${id}"><rect x="-200" y="${n(cy - 400)}" width="1000" height="400"/></clipPath>`
    const water = front ? [0, 1, 2].map(k => `<path d="M${-10 + k * 40} ${n(cy + RY + 18 + k * 14)} q30 -12 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="${0.8 - k * 0.25}"/>`).join('') : ''
    return `<g${op(w)} transform="rotate(${n(p.tilt * 0.6)} ${cx} ${n(cy)})"><defs>${clip}<clipPath id="${id}i"><path d="${band}" clip-rule="evenodd"/></clipPath></defs>` +
      `<g clip-path="url(#${id})"><path d="${band}" fill="${PAPER}" fill-rule="evenodd"/><g clip-path="url(#${id}i)">${stripes}</g><path d="${band}" fill="none" stroke="${INK}" stroke-width="6"/></g>${water}</g>`
  }

  /* ---------------------------------------------------------- 场景：猫身前 */
  function sceneFront(F, o) {
    const r = F.r, pr = F.props, s = F.scale, flip = o.flip, t = F.t
    let out = ''
    const ws = r.sc_sign
    if (ws > 0.01) {
      const p = pr.sign, W = 320, H = 180
      const lines = wrap(F.texts.sign || '知识猫', 7).slice(0, 3)
      const fs = Math.min(64, (W - 40) / Math.max(1, ...lines.map(em)), (H - 30) / (lines.length * 1.25))
      const txt = lines.map((l, i) => text(0, (i - (lines.length - 1) / 2) * fs * 1.25, l, fs, { flip })).join('')
      out += `<g transform="translate(${n(p.c[0])} ${n(p.c[1] + (1 - ws) * 50)}) rotate(${n(p.rot)}) scale(${pop(ws, s)})"${op(ws)}>` +
        `<rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" rx="16" fill="${WHITE}" stroke="${INK}" stroke-width="6"/>${txt}` +
        mitten(-W / 2 + 46, -H / 2 + 2, 1) + mitten(W / 2 - 46, -H / 2 + 2, 1) + '</g>'
    }
    const wl = r.sc_laptop
    if (wl > 0.01) {
      const p = pr.laptop
      out += `<g transform="translate(${n(p.c[0])} ${n(p.c[1] + (1 - wl) * 60)}) scale(${pop(wl, s)})"${op(wl)}>` +
        `<rect x="-130" y="-130" width="260" height="160" rx="14" fill="#E6E9EE" stroke="${INK}" stroke-width="6"/>` +
        fish(0, -52, 1.3, 0) +
        `<path d="M-160 30 H160 L146 52 H-146 Z" fill="#C9CED7" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
        mitten(-150, 18 - p.tap[0] * 14, 1) + mitten(150, 18 - p.tap[1] * 14, 1) + '</g>'
    }
    const wb = r.sc_book
    if (wb > 0.01) {
      const p = pr.book
      const lines = [-0.7, -0.45, -0.2, 0.05, 0.3].map(k => `<path d="M-104 ${n(k * 90 + 40)} Q-58 ${n(k * 90 + 30)} -16 ${n(k * 90 + 40)}M16 ${n(k * 90 + 40)} Q58 ${n(k * 90 + 30)} 104 ${n(k * 90 + 40)}" stroke="${LINE}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('')
      out += `<g transform="translate(${n(p.c[0])} ${n(p.c[1] + (1 - wb) * 50)}) rotate(${n(p.rot)}) scale(${pop(wb, s)})"${op(wb)}>` +
        `<path d="M0 -14 Q-64 -34 -128 -14 L-128 96 Q-64 78 0 98 Q64 78 128 96 L128 -14 Q64 -34 0 -14 Z" fill="${PINK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round" transform="translate(0 10)"/>` +
        `<path d="M0 -14 Q-60 -32 -120 -14 L-120 92 Q-60 74 0 92 Z" fill="${WHITE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M0 -14 Q60 -32 120 -14 L120 92 Q60 74 0 92 Z" fill="${WHITE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        lines + mitten(-122, 70, 1) + mitten(122, 70, 1) + '</g>'
    }
    const wr = r.sc_ring
    if (wr > 0.01) out += ringPart(pr.ring, wr, true, o.uid)
    const wc = r.sc_cabinet
    if (wc > 0.01) {
      const drawer = (y, h) => `<rect x="120" y="${y}" width="290" height="${h}" fill="${PAPER}" stroke="${INK}" stroke-width="5"/><rect x="225" y="${y + 18}" width="80" height="26" rx="3" fill="none" stroke="${INK}" stroke-width="3.5"/><path d="M240 ${y + 58} H290" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`
      out += `<g${op(wc)}>` +
        `<path d="M410 560 L470 500 L470 1100 L410 1100 Z" fill="#E4E7EC" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M120 560 L180 500 H470 L410 560 Z" fill="#EEF0F3" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        drawer(560, 120) + drawer(680, 120) + drawer(800, 300) +
        `<path d="M100 492 H430 L430 580 H100 Z" fill="${PAPER}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<rect x="225" y="506" width="80" height="24" rx="3" fill="none" stroke="${INK}" stroke-width="3.5"/><path d="M238 552 H292" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M430 492 L470 452 V540 L430 580" fill="#E4E7EC" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        mitten(190, 494, 1) + mitten(330, 494, 1) + '</g>'
    }
    const wm = r.sc_money
    if (wm > 0.01) {
      let fly = ''
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.22 + k * 0.25) % 1, x = -60 + k * 170 + 30 * Math.sin(t * 1.3 + k * 2), y = -180 + ph * 760
        fly += `<g opacity="${n3(Math.sin(ph * Math.PI))}">${bill(x, y, 40 * Math.sin(t * 2 + k), 0.9)}</g>`
      }
      out += `<g${op(wm)}>${fly}${bill(40, 700, 8, 1.1)}${bill(460, 705, -6, 1.1)}</g>`
    }
    const wsp = r.sc_spider
    if (wsp > 0.01) {
      const sp = pr.spider, sx = 208 + sp.sway, sy = sp.y
      let legs = ''
      for (let k = 0; k < 4; k++) {
        const a = (25 + k * 22) * Math.PI / 180, wig = 4 * Math.sin(t * 9 + k)
        for (const sd of [-1, 1]) legs += `<path d="M0 0 Q${n(sd * Math.cos(a) * 22)} ${n(-Math.sin(a) * 22 - 6 + wig)} ${n(sd * Math.cos(a) * 34)} ${n(Math.sin(a) * 8 - 2 + k * 6)}" fill="none" stroke="${WHITE}" stroke-width="3.2" stroke-linecap="round"/>`
      }
      out += `<g${op(wsp)}><path d="M${n(sx)} -260 V${n(sy - 12)}" stroke="${WHITE}" stroke-width="4"/><path d="M${n(sx)} -260 V${n(sy - 12)}" stroke="${INK}" stroke-width="1.6"/>` +
        `<g transform="translate(${n(sx)} ${n(sy)})">${legs}<ellipse rx="13" ry="15" fill="${INK}" stroke="${WHITE}" stroke-width="3"/><circle cy="-14" r="8" fill="${INK}" stroke="${WHITE}" stroke-width="2.5"/><circle cx="-3" cy="-15" r="2" fill="${WHITE}"/><circle cx="3" cy="-15" r="2" fill="${WHITE}"/></g></g>`
    }
    const wbub = r.sc_bubble
    if (wbub > 0.01) {
      const p = pr.bubble
      const lines = wrap(F.texts.bubble || '喵？', 9).slice(0, 4), fs = 40
      const W = Math.max(150, Math.max(...lines.map(em)) * fs + 56), H = lines.length * fs * 1.3 + 40
      const c = p.c, k = pop(wbub, s)
      const tx = p.tail[0] - c[0], ty = p.tail[1] - c[1]
      const tail = `M-26 ${n(H / 2 - 4)} L${n(tx / k)} ${n(ty / k)} L18 ${n(H / 2 - 4)}`
      const txt = lines.map((l, i) => text(0, (i - (lines.length - 1) / 2) * fs * 1.3, l, fs, { flip })).join('')
      out += `<g transform="translate(${n(c[0])} ${n(c[1])}) scale(${k})"${op(wbub)}>` +
        `<path d="${tail}Z" fill="${WHITE}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
        `<rect x="${n(-W / 2)}" y="${n(-H / 2)}" width="${n(W)}" height="${n(H)}" rx="${n(Math.min(40, H / 2))}" fill="${WHITE}" stroke="${INK}" stroke-width="6"/>` +
        `<path d="${tail}" fill="${WHITE}" stroke="none" transform="translate(0 -6)"/>${txt}</g>`
    }
    return out
  }

  /* ---------------------------------------------------------- 配饰（静息坐标 + 跟随矩阵） */
  function accessoriesInBody(F) {
    const r = F.r, a = F.acc
    if (r.ac_bell <= 0.01) return ''
    return `<g transform="${mat(a.neck)}"${op(r.ac_bell * a.sit)}><path d="M178 338 Q300 384 414 326" stroke="${PINK}" stroke-width="12" fill="none"/></g>`
  }
  function accessoriesTop(F) {
    const r = F.r, a = F.acc
    let out = ''
    if (r.ac_bell > 0.01)
      out += `<g transform="${mat(a.neck)}"${op(r.ac_bell)}><g transform="translate(224 360) rotate(${n(a.swing)})"><circle cy="14" r="14" fill="${YELLOW}" stroke="${INK}" stroke-width="3"/><path d="M-6 18 H6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cy="0" r="4" fill="${YELLOW}" stroke="${INK}" stroke-width="2"/></g></g>`
    if (r.ac_bowtie > 0.01)
      out += `<g transform="${mat(a.neck)}"${op(r.ac_bowtie)}><g transform="translate(214 352) rotate(${n(a.swing * 0.35)}) scale(${n3(0.75 + 0.25 * r.ac_bowtie)})"><path d="M0 0 L-30 -18 Q-36 0 -30 18 Z M0 0 L30 -18 Q36 0 30 18 Z" fill="${PINK}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><circle r="8" fill="${PINK}" stroke="${INK}" stroke-width="3.5"/></g></g>`
    if (r.ac_glasses > 0.01) {
      // 镜框跟着眼睛的大小和形状走；炸毛时被弹歪，睡着时滑到鼻梁上
      const k = a.eyeS, ov = a.eyeOval
      const rim = (cx, cy, R) => `<ellipse cx="${cx}" cy="${cy}" rx="${n(R * k * (1 - 0.1 * ov) + 7)}" ry="${n(R * k * (1 + 0.22 * ov) + 7)}"/>`
      const dy = a.drop * 16 - a.pop * 18 - a.fall * 0.5
      out += `<g transform="${mat(a.face)}"${op(r.ac_glasses)}><g transform="translate(0 ${n(dy)}) rotate(${n(a.tilt + a.drop * 5)} 205 190)" fill="none" stroke="${YELLOW}" stroke-width="5.5" stroke-linecap="round">` +
        rim(148, 195, 49) + rim(258, 184, 51) +
        `<path d="M${n(148 + 49 * k + 5)} 186 Q203 ${n(172 - 4 * k)} ${n(258 - 51 * k - 5)} 178 M${n(258 + 51 * k + 7)} 180 L${n(258 + 51 * k + 40)} 172"/></g></g>`
    }
    if (r.ac_headphones > 0.01) {
      const w = r.ac_headphones, l = [98, 262], rr = [386, 226], ctl = [216, -40]
      const band = `M${P(l)}Q${P(ctl)} ${P(rr)}`
      const cup = c => `<rect x="${c[0] - 19}" y="${c[1] - 34}" width="38" height="68" rx="16" fill="${YELLOW}" stroke="${INK}" stroke-width="4"/>`
      out += `<g transform="${mat(a.head)}"${op(w)}><g transform="translate(0 ${n(-(1 - w) * 60 - a.pop * 12)})"><path d="${band}" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/><path d="${band}" stroke="${YELLOW}" stroke-width="10" fill="none" stroke-linecap="round"/>${cup(l)}${cup(rr)}</g></g>`
    }
    if (r.ac_cap > 0.01) {
      // 帽子：炸毛 / 吓一跳时被顶起来，下落时稍微飘起，流苏有惯性
      const w = r.ac_cap, sw = a.tassel
      out += `<g transform="${mat(a.head)}"${op(w)}><g transform="translate(208 ${n(84 - (1 - w) * 80 - a.pop * 50 - a.fall)}) rotate(${n(-4 + a.tilt * 1.6)})">` +
        `<path d="M-50 -4 Q-50 26 0 30 Q50 26 50 -4 Z" fill="${INK}" stroke="${WHITE}" stroke-width="3"/>` +
        `<path d="M-92 -8 L0 -40 L92 -8 L0 22 Z" fill="${INK}" stroke="${WHITE}" stroke-width="3.5" stroke-linejoin="round"/>` +
        `<g transform="translate(78 -6) rotate(${n(sw)})"><path d="M-78 -4 Q-28 -6 0 0 L0 40" stroke="${YELLOW}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M-7 38 L7 38 L9 60 L-9 60 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="2.5"/></g><circle cy="-10" r="5" fill="${YELLOW}"/></g></g>`
    }
    if (r.ac_fish > 0.01)
      out += `<g transform="${mat(a.mouth)}"${op(r.ac_fish)}>${fish(150, 294, 1.9, -8 + a.fishWag)}</g>`
    return out
  }

  /* ---------------------------------------------------------- 特效 */
  function effects(F, o) {
    const r = F.r, t = F.t, A = F.anchor, flip = o.flip
    let out = ''
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.45 + k / 3) % 1, a = r.fxZ * Math.sin(ph * Math.PI)
      if (a > 0.01) out += text(A[0] + 40 + ph * 60 + 6 * Math.sin(ph * 6 + k), A[1] + 60 - ph * 120, 'Z', 22 + ph * 22, { family: DISPLAY, weight: 900, a, flip })
    }
    if (r.fxBang > 0.01) out += `<g transform="translate(${n(A[0] + 36)} ${n(A[1] + 10)}) rotate(${n(10 * Math.sin(t * 9) * r.fxBang)}) scale(${n3(0.3 + 0.7 * r.fxBang)})"${op(r.fxBang)}>${text(0, -20, '!', 96, { family: DISPLAY, weight: 900, flip })}</g>`
    if (r.fxQ > 0.01) out += `<g transform="translate(${n(A[0] + 30)} ${n(A[1] + 20 + 5 * Math.sin(t * 3))}) rotate(${n(8 * Math.sin(t * 2))}) scale(${n3(0.5 + 0.5 * r.fxQ)})"${op(r.fxQ)}>${text(0, -16, '?', 80, { family: DISPLAY, weight: 900, flip })}</g>`
    if (r.fxDots > 0.01) for (let k = 0; k < 3; k++) {
      const ph = ((t * 1.6) % 2) - k * 0.33, on = ph <= 0 ? 0 : ph >= 0.15 ? 1 : ph / 0.15
      out += `<circle cx="${n(A[0] + 10 + k * 24)}" cy="${n(A[1] + 40 - k * 14)}" r="7" fill="${INK}"${op(r.fxDots * (0.2 + 0.8 * on))}/>`
    }
    if (r.fxIdea > 0.01) {
      let rays = ''
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t * 0.5; rays += `M${n(Math.cos(a) * 44)} ${n(Math.sin(a) * 44 - 6)}L${n(Math.cos(a) * 58)} ${n(Math.sin(a) * 58 - 6)}` }
      out += `<g transform="translate(${n(A[0] - 20)} ${n(A[1] - 40)}) scale(${n3(0.4 + 0.6 * r.fxIdea)})"${op(r.fxIdea)}><path d="${rays}" stroke="#E8A600" stroke-width="6" stroke-linecap="round"/><path d="M-22 6 A30 30 0 1 1 22 6 L14 22 L-14 22 Z" fill="${YELLOW}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M-12 30 H12 M-9 39 H9" stroke="${INK}" stroke-width="5" stroke-linecap="round"/></g>`
    }
    if (r.fxStar > 0.01) {
      const SP = [[-230, 70], [70, 110], [-90, -40]]
      SP.forEach((q, k) => {
        const sc = r.fxStar * (0.55 + 0.45 * Math.sin(t * 5 + k * 2.1))
        out += `<path d="M0 -20 Q3 -3 20 0 Q3 3 0 20 Q-3 3 -20 0 Q-3 -3 0 -20Z" fill="${YELLOW}" stroke="${INK}" stroke-width="3" stroke-linejoin="round" transform="translate(${n(A[0] + q[0])} ${n(A[1] + q[1])}) scale(${n3(Math.max(0.001, sc))}) rotate(${n(t * 40 + k * 30)})"${op(r.fxStar)}/>`
      })
    }
    // 炸毛时身边的惊吓线
    if (r.fuzz > 0.05) {
      const B = F.anchor
      let lines = ''
      for (let k = 0; k < 3; k++) { const a = (-150 + k * 22) * Math.PI / 180, j = 4 * Math.sin(t * 20 + k); lines += `M${n(B[0] - 300 + Math.cos(a) * (40 + j))} ${n(B[1] + 90 + Math.sin(a) * (40 + j))}l${n(Math.cos(a) * 34)} ${n(Math.sin(a) * 34)}` }
      for (let k = 0; k < 3; k++) { const a = (-30 - k * 22) * Math.PI / 180, j = 4 * Math.sin(t * 20 + k + 1); lines += `M${n(B[0] + 60 + Math.cos(a) * (40 + j))} ${n(B[1] + 50 + Math.sin(a) * (40 + j))}l${n(Math.cos(a) * 34)} ${n(Math.sin(a) * 34)}` }
      out += `<path d="${lines}" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"${op(r.fuzz)}/>`
    }
    return out
  }

  /* ---------------------------------------------------------- 猫本体 */
  function catSVG(F, o) {
    o = o || {}
    const id = o.uid || 'gc', r = F.r, s = F.scale, e = F.eyes
    const face = e.map((x, i) => `<path d="${x.aperture}" fill="${WHITE}"/><g clip-path="url(#${id}a${i})"><ellipse cx="${n(x.pupil.cx)}" cy="${n(x.pupil.cy)}" rx="${n(x.pupil.rx)}" ry="${n(x.pupil.ry)}" fill="${INK}" transform="rotate(${n(x.pupil.rot)} ${n(x.pupil.cx)} ${n(x.pupil.cy)})"/></g>` +
      (x.lineAlpha > 0.01 ? `<path d="${x.line}" fill="none" stroke="${WHITE}" stroke-width="${n(5 * s)}" stroke-linecap="round"${op(x.lineAlpha)}/>` : '')).join('')
    const mo = F.mouthOpen
    const blush = F.blush.a > 0.01 ? F.blush.pts.map(p => `<ellipse cx="${n(p[0])}" cy="${n(p[1])}" rx="${n(17 * s)}" ry="${n(8 * s)}" fill="${PINK}" opacity="${n3(0.8 * F.blush.a)}"/>`).join('') : ''
    const arms = F.arms.filter(a => a.show > 0.01).map(a =>
      `<path d="${a.d}" fill="none" stroke="${WHITE}" stroke-width="${n(41 * s)}" stroke-linecap="round"${op(a.a)}/><path d="${a.d}" fill="none" stroke="${INK}" stroke-width="${n(33 * s)}" stroke-linecap="round"/><circle cx="${n(a.shoulder[0])}" cy="${n(a.shoulder[1])}" r="${n(22 * s)}" fill="${INK}"/>`).join('')
    const tail = F.tailFuzz ? `<path d="${F.tailFuzz}" fill="${INK}"/>` :
      `<path d="${F.tail}" fill="none" stroke="${INK}" stroke-width="${n(F.tailW)}" stroke-linecap="round" stroke-linejoin="round"/>`
    return `<defs><clipPath id="${id}b"><path d="${F.body}"/></clipPath>` +
      e.map((x, i) => `<clipPath id="${id}a${i}"><path d="${x.aperture}"/></clipPath>`).join('') +
      `<clipPath id="${id}p"><rect x="-3000" y="-3000" width="6000" height="${n(3000 + F.clipBottom)}"/></clipPath></defs>` +
      sceneBack(F, o) +
      `<g clip-path="url(#${id}p)">` + tail +
      `<path d="${F.body}" fill="${INK}"/>` +
      (F.foot.a > 0.01 ? `<path d="${F.foot.d}" fill="none" stroke="${WHITE}" stroke-width="${n(2.6 * s)}" stroke-linecap="round"${op(F.foot.a)}/>` : '') +
      `<g clip-path="url(#${id}b)">${face}<path d="${F.nose}" fill="${WHITE}"/>` +
      (mo.a < 0.99 ? `<path d="${F.mouthLine}" fill="none" stroke="${WHITE}" stroke-width="${n(2 * s)}" stroke-linecap="round" stroke-linejoin="round"${op(1 - mo.a)}/>` : '') +
      (mo.a > 0.01 ? `<ellipse cx="${n(mo.cx)}" cy="${n(mo.cy)}" rx="${n(mo.rx)}" ry="${n(mo.ry)}" fill="${PINK}" stroke="${WHITE}" stroke-width="${n(2 * s)}" transform="rotate(${n(mo.rot)} ${n(mo.cx)} ${n(mo.cy)})"${op(mo.a)}/>` : '') +
      blush + accessoriesInBody(F) + '</g>' +
      `<g fill="none" stroke="${INK}" stroke-width="${n(2.4 * s)}" stroke-linecap="round">${F.whiskers.map(d => `<path d="${d}"/>`).join('')}</g>` +
      accessoriesTop(F) + arms + '</g>' +
      sceneFront(F, o) + effects(F, o)
  }

  /* ---------------------------------------------------------- 整帧 */
  // 世界坐标里猫的"落地点"是 (CX, G)；输出时把它放到画面的 (x·W, y·H)，scale=1 时猫高约等于画面高。
  function frameSVG(F, o) {
    o = o || {}
    const CX = 262, G = 665
    if (o.viewBox) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.viewBox}"${o.attrs || ''}>${o.before || ''}<g transform="${o.flip ? `translate(${2 * CX} 0) scale(-1 1)` : ''}"${o.catOpacity != null ? op(o.catOpacity) : ''}>${catSVG(F, o)}</g></svg>`
    const W = o.width || 1920, H = o.height || 1080
    const s = (o.scale == null ? 0.6 : o.scale) * H / 900
    const ax = (o.x == null ? 0.82 : o.x) * W, ay = (o.y == null ? 0.95 : o.y) * H
    let bg = ''
    const b = o.background || 'transparent'
    if (b === 'green') bg = `<rect width="${W}" height="${H}" fill="#00B140"/>`
    else if (b === 'dots') { const g = n(26 * s * 1.4); bg = `<defs><pattern id="dots" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><circle cx="${n(g / 2)}" cy="${n(g / 2)}" r="${n(Math.max(1.2, 1.8 * s * 1.4))}" fill="#CCD1DA"/></pattern></defs><rect width="${W}" height="${H}" fill="#F8F9FB"/><rect width="${W}" height="${H}" fill="url(#dots)"/>` }
    else if (b !== 'transparent') bg = `<rect width="${W}" height="${H}" fill="${esc(b)}"/>`
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}<g transform="translate(${n(ax)} ${n(ay)}) scale(${o.flip ? -n3(s) : n3(s)} ${n3(s)}) translate(${-CX} ${-G})">${catSVG(F, o)}</g></svg>`
  }

  /* ---------------------------------------------------------- 位置轨道 */
  // 剧本里某条 timeline 写了 "cat": {x, y, scale, flip, duration}，猫就从当时的位置平滑移过去。
  // 每段移动从"那一刻屏幕上的实际位置"出发，所以移动中途再改位置也不会跳。返回 t → {x, y, scale, flip}
  function viewTrack(base, timeline) {
    const lerp = (a, b, u) => a + (b - a) * u
    const keys = [{ t: -Infinity, from: null, to: Object.assign({ x: 0.82, y: 0.95, scale: 0.6, flip: false }, base || {}), d: 0 }]
    const at = t => {
      let i = 0
      while (i + 1 < keys.length && keys[i + 1].t <= t) i++
      const k = keys[i]
      if (!k.from || t - k.t >= k.d) return k.to
      const u = (t - k.t) / k.d, s = u * u * u * (u * (u * 6 - 15) + 10)
      return { x: lerp(k.from.x, k.to.x, s), y: lerp(k.from.y, k.to.y, s), scale: lerp(k.from.scale, k.to.scale, s), flip: s < 0.5 ? k.from.flip : k.to.flip }
    }
    for (const e of [...(timeline || [])].sort((a, b) => (a.at || 0) - (b.at || 0))) {
      if (!e.cat) continue
      const t = e.at || 0, from = at(t), prev = keys[keys.length - 1].to
      const { duration, ...pos } = e.cat
      keys.push({ t, from, to: Object.assign({}, prev, pos), d: duration == null ? 0.8 : Math.max(0.001, duration) })
    }
    return at
  }

  const api = { catSVG, frameSVG, viewTrack }
  global.GeekCatSVG = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
