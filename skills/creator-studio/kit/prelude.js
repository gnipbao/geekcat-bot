// 每个场景共用的工具（build.mjs 注入）。全部基于一条暂停的 GSAP 时间轴，seek-safe。
var ID = '__ID__', D = __D__, A = __A__, IN = '__IN__', OUT = '__OUT__', TILT = __TILT__;
var R = document.getElementById(ID);
var tl = gsap.timeline({ paused: true });
function $(s) { return R.querySelectorAll(s); }
function c(t) { return Math.max(0, t - A); }                       // 旁白绝对时间 → 场景本地时间
function rep(p) { return Math.max(0, Math.floor((D - 0.1) / p) - 1); } // 有限次循环，不超出场景时长
// 倾斜装饰只用 GSAP 设置，避免 CSS transform 与补间冲突。TILT：主题的倾斜系数（theme.json.tilt；pop 是 1，极简主题是 0）
R.querySelectorAll('[data-rot]').forEach(function (el) { tl.set(el, { rotation: +el.dataset.rot * TILT }, 0); });
function drift(sel, vars, period) { var els = $(sel); if (els.length) tl.to(els, Object.assign({ duration: period, ease: 'sine.inOut', yoyo: true, repeat: rep(period) }, vars), 0); }
function enter(sel, t, from, stagger) {
  var els = $(sel); if (!els.length) return;
  tl.fromTo(els, Object.assign({ opacity: 0, y: 40 }, from || {}), { opacity: 1, x: 0, y: 0, duration: 0.55, ease: 'power3.out', stagger: stagger == null ? 0.08 : stagger }, t);
}
function popIn(sel, t, stagger) {
  var els = $(sel); if (!els.length) return;
  tl.fromTo(els, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: stagger == null ? 0.07 : stagger }, t);
}
// —— 口播动效 ——
function slam(sel, t, stagger) { // 撞字：从大到小砸下来，落地轻弹一下（结论、数字、钩子）
  var els = $(sel); if (!els.length) return;
  tl.fromTo(els, { opacity: 0, scale: 1.9 }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power4.in', stagger: stagger == null ? 0.1 : stagger }, t);
  tl.to(els, { scale: 1.07, duration: 0.07, ease: 'power1.out', yoyo: true, repeat: 1, stagger: stagger == null ? 0.1 : stagger }, t + 0.2);
}
function strike(sel, t, dur) { // 划掉：元素要有 class="strike"
  var els = $(sel); if (els.length) tl.fromTo(els, { '--strike': 0 }, { '--strike': 1, duration: dur || 0.3, ease: 'power2.out' }, t);
}
function shake(sel, t) { // 抖一下（否定、警告）
  var els = $(sel); if (els.length) tl.to(els, { x: 10, duration: 0.05, ease: 'power1.inOut', yoyo: true, repeat: 5 }, t);
}
function out(sel, t, dur) { // 说完就撤
  var els = $(sel); if (els.length) tl.to(els, { opacity: 0, y: -18, duration: dur || 0.25, ease: 'power2.in' }, t);
}
function flash(t) { // 闪白（换章、揭晓）
  var fl = document.createElement('div');
  fl.style.cssText = 'position:absolute;inset:0;background:#fff;pointer-events:none;z-index:99;opacity:0';
  fl.setAttribute('data-layout-ignore', ''); R.appendChild(fl);
  tl.fromTo(fl, { opacity: 0.85 }, { opacity: 0, duration: 0.32, ease: 'power2.out' }, t);
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
var TIN = { push: [{ x: 1920 }, { x: 0, ease: 'power3.inOut' }], vpush: [{ y: 1080 }, { y: 0, ease: 'power3.inOut' }], blur: [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)', ease: 'power2.out' }], fade: [{ opacity: 0 }, { opacity: 1, ease: 'power1.out' }] }[IN];
var TOUT = { push: { x: -1920 }, vpush: { y: -1080 }, fade: { opacity: 0 } }[OUT];   // fade：叠加层（教程 / 口播）之间淡入淡出
if (TIN) tl.fromTo(R, TIN[0], Object.assign({ duration: 0.5 }, TIN[1]), 0);
if (TOUT) tl.to(R, Object.assign({ duration: 0.5, ease: 'power3.inOut' }, TOUT), D - 0.5);
if (IN === 'flash') flash(0);   // 闪白进场：硬切 + 一帧白
var T0 = IN === 'none' ? 0.2 : 0.45; // 进场转场结束后才开始本场景的入场动画
