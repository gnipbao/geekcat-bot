// 每个场景共用的工具（build.mjs 注入）。全部基于一条暂停的 GSAP 时间轴，seek-safe。
var ID = '__ID__', D = __D__, A = __A__, IN = '__IN__', OUT = '__OUT__';
var R = document.getElementById(ID);
var tl = gsap.timeline({ paused: true });
function $(s) { return R.querySelectorAll(s); }
function c(t) { return Math.max(0, t - A); }                       // 旁白绝对时间 → 场景本地时间
function rep(p) { return Math.max(0, Math.floor((D - 0.1) / p) - 1); } // 有限次循环，不超出场景时长
// 倾斜装饰只用 GSAP 设置，避免 CSS transform 与补间冲突
R.querySelectorAll('[data-rot]').forEach(function (el) { tl.set(el, { rotation: +el.dataset.rot }, 0); });
function drift(sel, vars, period) { var els = $(sel); if (els.length) tl.to(els, Object.assign({ duration: period, ease: 'sine.inOut', yoyo: true, repeat: rep(period) }, vars), 0); }
function enter(sel, t, from, stagger) {
  var els = $(sel); if (!els.length) return;
  tl.fromTo(els, Object.assign({ opacity: 0, y: 40 }, from || {}), { opacity: 1, x: 0, y: 0, duration: 0.55, ease: 'power3.out', stagger: stagger == null ? 0.08 : stagger }, t);
}
function popIn(sel, t, stagger) {
  var els = $(sel); if (!els.length) return;
  tl.fromTo(els, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: stagger == null ? 0.07 : stagger }, t);
}
function wipe(sel, t, dur) { // 从左到右擦出
  var els = $(sel); if (!els.length) return;
  tl.fromTo(els, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: dur || 0.6, ease: 'power2.inOut', stagger: 0.1 }, t);
}
function count(sel, t, to, dur, fmt) {
  var el = R.querySelector(sel); if (!el) return;
  var p = { v: 0 };
  fmt = fmt || function (v) { return Math.round(v).toLocaleString('en-US'); };
  el.textContent = fmt(0);
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 }, t);
  tl.fromTo(p, { v: 0 }, { v: to, duration: dur || 1.4, ease: 'power2.out', onUpdate: function () { el.textContent = fmt(p.v); } }, t);
}
function type(sel, t, dur) { // 打字：data-text 逐字出现
  var el = R.querySelector(sel); if (!el) return;
  var full = Array.from(el.dataset.text || el.textContent), p = { n: 0 };
  el.textContent = '';
  tl.fromTo(p, { n: 0 }, { n: full.length, duration: dur, ease: 'none', onUpdate: function () { el.textContent = full.slice(0, Math.round(p.n)).join(''); } }, t);
}
function draw(sel, t, dur) { // SVG 描线
  $(sel).forEach(function (path, i) {
    var L = path.getTotalLength ? path.getTotalLength() : 1000;
    tl.fromTo(path, { strokeDasharray: L, strokeDashoffset: L, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, duration: dur || 0.8, ease: 'power2.inOut' }, t + i * 0.12);
  });
}
// 转场：进场在本地 0 秒，出场在最后 0.5 秒，和相邻场景同时发生
var TIN = { push: [{ x: 1920 }, { x: 0, ease: 'power3.inOut' }], vpush: [{ y: 1080 }, { y: 0, ease: 'power3.inOut' }], blur: [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)', ease: 'power2.out' }] }[IN];
var TOUT = { push: { x: -1920 }, vpush: { y: -1080 } }[OUT];
if (TIN) tl.fromTo(R, TIN[0], Object.assign({ duration: 0.5 }, TIN[1]), 0);
if (TOUT) tl.to(R, Object.assign({ duration: 0.5, ease: 'power3.inOut' }, TOUT), D - 0.5);
var T0 = IN === 'none' ? 0.2 : 0.45; // 进场转场结束后才开始本场景的入场动画
