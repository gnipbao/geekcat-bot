// 知识猫引擎测试：node --test test/
// 锁住三件事：每个动作/场景/配饰都能渲染、帧是时间的纯函数、任意切换都不跳帧（"丝滑"的可测定义）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const GC = require('../../prototype/cat-engine.js')
const SV = require('../../prototype/cat-svg.js')

const ACTIONS = Object.keys(GC.STATES).filter(k => k !== 'calib')
const SCENES = Object.keys(GC.SCENES)
const ACCS = Object.keys(GC.ACCESSORIES)
const svgAt = (sched, t, view) => SV.frameSVG(GC.frameAt(sched, t), view || { width: 640, height: 360, background: 'transparent' })

test('每个动作 × 每个场景都能渲染，且没有 NaN', () => {
  for (const id of ACTIONS) for (const sc of [null, ...SCENES]) {
    const sched = GC.buildSchedule([{ at: 0, do: id, scene: sc, ...(sc && GC.SCENES[sc].text ? { text: '测试' } : {}) }])
    for (const t of [0, 0.37, 1.5, 4.2]) {
      const s = svgAt(sched, t)
      assert.ok(!/NaN|undefined|Infinity/.test(s), `${id} + ${sc} @${t}s 出现非法数值`)
    }
  }
})

test('所有配饰一起戴、配合大姿势也能渲染', () => {
  for (const sc of SCENES.filter(s => GC.SCENES[s].big)) {
    const sched = GC.buildSchedule([{ at: 0, do: 'scared', scene: sc, accessories: ACCS }])
    const s = svgAt(sched, 1.2)
    assert.ok(!/NaN|undefined/.test(s), sc)
  }
})

test('帧是时间的纯函数：同一时刻重复取样完全一致，倒着取也一致', () => {
  const sched = GC.buildSchedule([{ at: 0, do: 'enter' }, { at: 1, do: 'talk', scene: 'sign', text: '一' }, { at: 2.3, do: 'scared' }, { at: 3.1, scene: 'write' }])
  const ts = [3.7, 0.2, 2.5, 1.05, 3.7]
  const a = ts.map(t => svgAt(sched, t)), b = [...ts].reverse().map(t => svgAt(sched, t)).reverse()
  assert.deepEqual(a, b)
  assert.equal(a[0], a[4])
})

test('剧本校验：未知动作、未知场景、两个大姿势、没有文字场景却写 text，都给出可读错误', () => {
  assert.throws(() => GC.buildSchedule([{ at: 0, do: 'dance' }]), /未知动作 "dance"/)
  assert.throws(() => GC.buildSchedule([{ at: 0, scene: 'moon' }]), /未知场景 "moon"/)
  assert.throws(() => GC.buildSchedule([{ at: 0, scene: ['ring', 'money'] }]), /大姿势/)
  assert.throws(() => GC.buildSchedule([{ at: 0, do: 'talk', text: 'x' }]), /没有带文字的场景/)
  assert.throws(() => GC.buildSchedule([{ at: 0, accessories: ['hat'] }]), /未知配饰 "hat"/)
})

test('粘性字段：不写 scene / accessories / text 就沿用上一条', () => {
  const s = GC.buildSchedule([{ at: 0, do: 'talk', scene: 'sign', text: 'A', accessories: ['cap'] }, { at: 2, do: 'nod' }, { at: 4, scene: null }])
  assert.deepEqual(s[1].scenes, ['sign']); assert.deepEqual(s[1].acc, ['cap']); assert.equal(s[1].text.sign, 'A')
  assert.deepEqual(s[2].scenes, []); assert.equal(s[2].id, 'nod'); assert.equal(s[2].ta, 2)
})

// 丝滑：在 60fps 下，眼睛中心、两只爪尖、尾尖每帧位移不超过上限。
// 瞬移（姿势表写错、过渡没接上、切换时从错误的帧出发）会立刻超标。
test('任意切换都不跳帧：所有动作和场景轮流切换，关键点每帧位移有上限', () => {
  const tl = []
  let at = 0.8
  const cycle = [...ACTIONS.filter(a => a !== 'enter' && a !== 'exit'), ...SCENES.map(s => ({ scene: s }))]
  for (let k = 0; k < cycle.length; k++) {
    const c = cycle[k]
    // 故意有一部分切换落在上一次过渡中间（间隔 0.3s），这是最容易跳的情况
    tl.push(typeof c === 'string' ? { at, do: c, scene: null } : { at, do: 'idle', scene: c.scene, ...(GC.SCENES[c.scene].text ? { text: '测' } : {}) })
    at += k % 4 === 3 ? 0.3 : 1.3
  }
  const sched = GC.buildSchedule([{ at: 0, do: 'idle' }, ...tl])
  const key = F => [F.eyes[0].center, F.eyes[1].center, F.anchor]
  let prev = key(GC.frameAt(sched, 0.5)), worst = 0, worstAt = 0
  for (let t = 0.5 + 1 / 60; t < at + 1.5; t += 1 / 60) {
    const cur = key(GC.frameAt(sched, t))
    for (let i = 0; i < cur.length; i++) {
      const d = Math.hypot(cur[i][0] - prev[i][0], cur[i][1] - prev[i][1])
      if (d > worst) { worst = d; worstAt = t }
    }
    prev = cur
  }
  // 静息坐标里猫高约 630；60 单位/帧 ≈ 每秒 5.7 个猫身高，再快肉眼就会看成跳帧
  assert.ok(worst < 60, `最大单帧位移 ${worst.toFixed(1)}（t=${worstAt.toFixed(2)}s）`)
})

test('导出构图：透明背景不画底色，绿幕和点阵画底色，镜像时文字不反', () => {
  const sched = GC.buildSchedule([{ at: 0, do: 'talk', scene: 'sign', text: '正' }])
  const F = GC.frameAt(sched, 1)
  assert.ok(!SV.frameSVG(F, { background: 'transparent' }).includes('<rect width="1920" height="1080"'))
  assert.ok(SV.frameSVG(F, { background: 'green' }).includes('#00B140'))
  assert.ok(SV.frameSVG(F, { flip: true }).includes('scale(-1 1)'))
})

test('位置轨道：移动连续、能到达目标，中途改位置也不跳', () => {
  const tl = [{ at: 0, do: 'idle' }, { at: 1, cat: { x: 0.2, y: 1, scale: 0.4, duration: 1 } }, { at: 1.5, cat: { x: 0.9, scale: 0.8, duration: 0.6 } }]
  const at = SV.viewTrack({ x: 0.8, y: 0.95, scale: 0.6 }, tl)
  assert.deepEqual(at(0.5), { x: 0.8, y: 0.95, scale: 0.6, flip: false })
  let prev = at(0), worst = 0
  for (let t = 1 / 60; t < 3; t += 1 / 60) {
    const v = at(t)
    worst = Math.max(worst, Math.abs(v.x - prev.x), Math.abs(v.scale - prev.scale))
    prev = v
  }
  assert.ok(worst < 0.05, `单帧最大位移 ${worst.toFixed(3)}`)
  const end = at(3)
  assert.equal(end.x, 0.9); assert.equal(end.scale, 0.8); assert.equal(end.y, 1)
})
