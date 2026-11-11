// 版式几何：主讲小窗 / 侧栏 / 全屏、录屏窗口、focus 推近。全部是纯函数，build.mjs 算好关键帧再写进合成。
const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))
const px = v => (typeof v === 'number' ? v : parseFloat(v) || 0)

export const V_LAYOUT = {                       // 竖版 1080×1920：标题条 / 16:9 舞台 / 主讲卡片 / 字幕 / 平台界面区
  header: { y: 0, h: 310 },
  stage: { x: 40, y: 330, w: 1000, h: 562.5 },
  presenter: { x: 60, y: 940, w: 960, h: 540 },
  captions: { left: 60, width: 960, bottom: 450, size: 58 },
  mascot: { x: 0.5, y: 0.775, scale: 0.25 },
}

/** 主讲画框（横版）。opt: { bw, radius, pipRadius }；k：轨道条目。
 *  位置灵活：corner（br/bl/tr/tl）+ size（占画面高的比例）；或 rect: [x, y, w, h]（像素，或 0–1 的比例）+ shape: 'circle' | 'card' */
export function presenterRect(mode, k, W, H, opt, layout = 'landscape') {
  if (layout === 'vertical') { const r = V_LAYOUT.presenter; return { x: r.x, y: r.y, w: r.w, h: r.h, r: px(opt.radius), bw: opt.bw } }
  const m = Math.round(0.05 * H)
  if (k.rect) {
    const frac = k.rect.every(v => v <= 1), [x, y, w, h] = frac ? [k.rect[0] * W, k.rect[1] * H, k.rect[2] * W, k.rect[3] * H] : k.rect
    const circle = k.shape === 'circle' || (!k.shape && mode === 'pip' && opt.pipRadius === '50%' && Math.abs(w - h) < 2)
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), r: circle ? Math.min(w, h) / 2 : px(k.shape === 'card' ? opt.radius : mode === 'pip' ? opt.pipRadius : opt.radius), bw: opt.bw }
  }
  if (mode === 'full') return { x: 0, y: 0, w: W, h: H, r: 0, bw: 0 }
  if (mode === 'side') { const w = Math.round(W * (k.size || 0.34)), left = (k.corner || 'r').includes('l'); return { x: left ? m : W - w - m, y: m, w, h: H - 2 * m, r: px(opt.radius), bw: opt.bw } }
  const s = Math.round((k.size || 0.27) * H), c = k.corner || 'br'
  const circle = k.shape ? k.shape === 'circle' : opt.pipRadius === '50%'
  return { x: c.includes('l') ? m : W - s - m, y: c.includes('t') ? m : H - s - m, w: s, h: s, r: circle ? s / 2 : px(k.shape === 'card' ? opt.radius : opt.pipRadius), bw: opt.bw }
}

/** 人像在画框里的缩放和位移：盖满画框，人脸居中；小窗和侧栏里把脸放大到画框宽度的一半左右。
 *  zoom：推近倍数（绕着脸）；shift：[dx, dy]（画框宽高的比例）把人往旁边挪，给花字让位；free：画面外是演播背景（IP 角色），不用夹住边缘 */
export function fitFace(R, SW, SH, f, mode, zoom = 1, shift = [0, 0], free = false) {
  const w = R.w - 2 * (R.bw || 0), h = R.h - 2 * (R.bw || 0)
  const cover = Math.max(w / SW, h / SH)
  const want = mode === 'full' ? cover : Math.max(cover, (mode === 'pip' ? 0.62 : 0.46) * w / Math.max(0.05, f.w * SW))
  const s = Math.min(want, cover * 3.2) * zoom
  // 全屏时不推近就保持原构图；推近时把脸往画面上三分之一处带
  let x = w / 2 - f.x * SW * s + shift[0] * w, y = h * (mode === 'pip' ? 0.5 : mode === 'full' ? 0.4 : 0.42) - f.y * SH * s + shift[1] * h
  if (free) { if (mode === 'full' && zoom === 1) { x = (w - SW * s) / 2 + shift[0] * w; y = (h - SH * s) / 2 + shift[1] * h }; y = Math.max(y, h - SH * s) }   // 角色：全屏不推近时保持机位原构图；脚下不露底
  else { x = clamp(x, w - SW * s, 0); y = clamp(y, h - SH * s, 0) }
  return { x: +x.toFixed(2), y: +y.toFixed(2), s: +s.toFixed(5) }
}

/** 录屏窗口（横版）：按主讲当前版式让出位置，按录屏宽高比居中。opt: { frame: 'window'|'full', captions, bar } */
export function screenRect(mode, k, W, H, aspect, opt) {
  if (opt.frame === 'full') return { x: 0, y: 0, w: W, h: H, bar: 0 }
  const m = 56, bar = opt.bar ?? 52, cap = opt.captions ? 118 : 0
  let area
  if (mode === 'side') { const pw = Math.round(W * (k.size || 0.34)) + Math.round(0.05 * H), left = (k.corner || 'r').includes('l'); area = { x: left ? pw + m : m, y: m, w: W - pw - 2 * m, h: H - 2 * m - cap } }
  else if (mode === 'pip') {
    const s = Math.round((k.size || 0.27) * H) + Math.round(0.05 * H), left = (k.corner || 'br').includes('l')
    area = { x: left ? s + m : m, y: m, w: W - s - 2 * m, h: H - 2 * m - cap }
  } else area = { x: m, y: m, w: W - 2 * m, h: H - 2 * m - cap }
  let vw = area.w, vh = vw / aspect
  if (vh + bar > area.h) { vh = area.h - bar; vw = vh * aspect }
  return { x: +(area.x + (area.w - vw) / 2).toFixed(1), y: +(area.y + (area.h - vh - bar) / 2).toFixed(1), w: +vw.toFixed(1), h: +(vh + bar).toFixed(1), bar }
}

/** 录屏在视口里的缩放和位移：box（录屏原始像素 [x,y,w,h]）推近到视口中间，最多 3 倍；没有 box = 整屏 */
export function focusTransform(V, SW, SH, box) {
  const s0 = Math.min(V.w / SW, V.h / SH)
  let s = s0, cx = SW / 2, cy = SH / 2
  if (box) {
    const [bx, by, bw, bh] = box
    s = s0 * clamp(Math.min(V.w / (bw * s0), V.h / (bh * s0)) * 0.88, 1, 3)
    cx = bx + bw / 2; cy = by + bh / 2
  }
  const x = SW * s <= V.w ? (V.w - SW * s) / 2 : clamp(V.w / 2 - cx * s, V.w - SW * s, 0)
  const y = SH * s <= V.h ? (V.h - SH * s) / 2 : clamp(V.h / 2 - cy * s, V.h - SH * s, 0)
  return { x: +x.toFixed(2), y: +y.toFixed(2), s: +s.toFixed(5) }
}
