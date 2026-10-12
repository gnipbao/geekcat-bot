/* 知识猫 GeekCat · 参数化骨骼引擎
 * 设计原则沿用 bloub：frameAt(schedule, t) 是时间的纯函数，没有内部时钟。
 * 猫不是星形轮廓（尾巴会回卷、耳朵是尖角），所以不用径向 profile，
 * 而是"锚点 + 权重绑定 + 平滑样条"，动画只插值参数，永远不插值路径。
 * 大姿势（趴、弓身）是同一组 32 个锚点的另一套坐标，所以坐姿和趴姿之间也是连续变形。
 * 浏览器和 Node 共用这一个文件：浏览器里挂到 window.GeekCat，Node 里挂到 globalThis.GeekCat。
 */
(function (global) {
  const TAU = Math.PI * 2, D2R = Math.PI / 180
  const lerp = (a, b, t) => a + (b - a) * t
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const smoother = t => t * t * t * (t * (t * 6 - 15) + 10) // C2 连续：起止速度、加速度都为 0
  const bump = (x, a, b, c, d) => sm(a, b, x) * (1 - sm(c, d, x))
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
  const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1 }
  const backOut = k => { const c = 1.70158, q = k - 1; return 1 + (c + 1) * q * q * q + c * q * q }

  /* ---------------------------------------------------------- 场景与配饰目录 */
  const SCENES = {
    sign: { label: '举牌', text: true, use: '标题、要点、数字，牌子上的字可改' },
    bubble: { label: '对话气泡', text: true, use: '台词、提问、吐槽' },
    point: { label: '指示', use: '用教鞭指向画面另一侧的内容' },
    laptop: { label: '敲电脑', use: '编程、技术、上网查资料' },
    book: { label: '看书', use: '知识点、引用、读文档' },
    fishing: { label: '逗小鱼', use: '轻松片段、转场、片尾彩蛋' },
    peek: { label: '角落探头', use: '画面底边探出头，做陪看/吐槽小窗' },
    write: { label: '写字', big: true, use: '弓着身子用羽毛笔写字：记笔记、总结、写方案' },
    scroll: { label: '趴卷轴', big: true, use: '趴在卷轴上（配 sleep 就是睡着）：长文、历史、无聊' },
    ring: { label: '游泳圈', big: true, use: '套着游泳圈举双爪：摸鱼、假期、"我先溜了"' },
    cabinet: { label: '文件柜探头', big: true, use: '从抽屉里探出来：查资料、归档、翻旧账' },
    money: { label: '钱堆打滚', big: true, fade: 1.1, use: '四脚朝天躺在钞票里：赚钱、预算、成本' },
    spider: { label: '被蜘蛛吓到', big: true, use: '捂嘴瞪眼：bug、意外、恐怖真相' }
  }
  const ACCESSORIES = {
    glasses: { label: '圆眼镜', use: '极客、讲解' },
    cap: { label: '学士帽', use: '知识、毕业、总结' },
    headphones: { label: '耳机', use: '播客、音乐' },
    bowtie: { label: '领结', use: '正式开场' },
    bell: { label: '铃铛项圈', use: '日常、可爱' },
    fish: { label: '叼小鱼', use: '奖励、彩蛋' },
    blush: { label: '腮红', use: '害羞、开心' }
  }

  /* ---------------------------------------------------------- 静息参数 */
  const REST = {
    x: 0, y: 0, sx: 1, sy: 1, sc: 1, lean: 0, roll: 0, breath: 1,
    head: 0, headY: 0, turn: 0,
    earL: 0, earR: 0, earFlat: 0,
    eyeL: 1, eyeR: 1, eyeS: 1, eyeOval: 0, lidCurve: 0, blink: 1,
    px: -1.2, py: 0.3, pupil: 1, slit: 0,
    mouth: 0, whisk: 0, blush: 0,
    tailA: 0, tailCurl: 1, wagSlow: 3, wagFast: 0,
    arm: 0, armA: 95, armB: 0, armW: 0,
    arm2: 0, arm2A: 85, arm2B: 0, arm2W: 0, armLen: 1,
    fuzz: 0, type: 0, scan: 0, write: 0, glassDrop: 0,
    pose_lie: 0, pose_hunch: 0,
    fxZ: 0, fxBang: 0, fxQ: 0, fxIdea: 0, fxStar: 0, fxDots: 0
  }
  for (const k in SCENES) REST['sc_' + k] = 0
  for (const k in ACCESSORIES) REST['ac_' + k] = 0
  const KEYS = Object.keys(REST)

  /* ---------------------------------------------------------- 造型数据（按参考图实测，单位：参考图像素×3.5） */
  const G = 665, CX = 262, PIV = [245, 335], ROLL_C = [262, 420]
  // [x, y, 头部权重, 切线系数(越小越尖), 标记]
  const BODY = [
    [114, 44, 1, 0.18, 'eLt'], [150, 92, 1, 0.9, 'eLi'], [205, 99, 1, 1], [255, 86, 1, 0.9, 'eRi'],
    [300, 34, 1, 0.18, 'eRt'], [314, 88, 1, 0.9, 'eRo'], [346, 126, 1, 1], [371, 168, 1, 1],
    [394, 236, 0.8, 1], [405, 300, 0.4, 1], [414, 370, 0.1, 1], [420, 450, 0, 1],
    [414, 530, 0, 1], [404, 590, 0, 1], [388, 634, 0, 1], [345, 657, 0, 1],
    [275, 665, 0, 1], [205, 660, 0, 1], [150, 642, 0, 1], [121, 610, 0, 1],
    [110, 560, 0, 1], [115, 500, 0, 1], [134, 448, 0, 1], [158, 405, 0.05, 1],
    [176, 365, 0.2, 1], [179, 330, 0.45, 1], [152, 311, 0.85, 1], [112, 286, 1, 1],
    [92, 240, 1, 1], [90, 185, 1, 1], [95, 130, 1, 1], [104, 90, 1, 0.9, 'eLo']
  ]
  const HEAD_IDX = [0, 1, 2, 3, 4, 5, 6, 7, 26, 27, 28, 29, 30, 31]

  // 大姿势：同一组锚点的另一套坐标。头部锚点整体平移（脸跟着走），身体锚点逐个给出。
  function makePose(face, body, extra) {
    const pts = BODY.map(b => [b[0], b[1]])
    for (const i of HEAD_IDX) pts[i] = [BODY[i][0] + face[0], BODY[i][1] + face[1]]
    for (const k in body) pts[k] = body[k]
    return Object.assign({ pts, face }, extra)
  }
  const POSES = {
    // 趴着：头在左前，身体像面包一样向右延伸，前爪伸到下巴前
    lie: makePose([-30, 300], {
      8: [380, 482], 9: [440, 476], 10: [500, 484], 11: [546, 510], 12: [566, 556], 13: [566, 606],
      14: [548, 646], 15: [500, 664], 16: [400, 667], 17: [300, 667], 18: [190, 668], 19: [40, 665],
      20: [22, 644], 21: [36, 626], 22: [60, 622], 23: [85, 621], 24: [104, 619], 25: [116, 615]
    }, { tail: [172, -4], tailA: 0, tailCurl: 1, s1: [100, 600], s2: [200, 610] }),
    // 弓身：头低下来朝左前，屁股抬高，前爪伸向纸面
    hunch: makePose([-40, 170], {
      8: [372, 340], 9: [432, 352], 10: [484, 396], 11: [512, 462], 12: [520, 536], 13: [510, 598],
      14: [488, 642], 15: [440, 664], 16: [360, 666], 17: [285, 666], 18: [215, 666], 19: [148, 667],
      20: [118, 660], 21: [124, 640], 22: [160, 630], 23: [186, 602], 24: [188, 556], 25: [160, 512]
    }, { tail: [112, 0], tailA: -55, tailCurl: 0.75, s1: [150, 560], s2: [230, 570] })
  }
  const S1 = [212, 410], S2 = [318, 420]

  const EAR_L = [127, 91], EAR_R = [284, 87]
  const EYES = [{ c: [148, 195], r: 49 }, { c: [258, 184], r: 51 }]
  const TAIL = [[392, 608], [440, 601], [475, 619], [484, 656], [468, 690], [431, 704], [380, 707], [330, 707], [292, 704]]
  const TAIL_W = 40
  const TAIL_SEG = TAIL.slice(1).map((p, i) => {
    const q = TAIL[i]; return { len: Math.hypot(p[0] - q[0], p[1] - q[1]), ang: Math.atan2(p[1] - q[1], p[0] - q[0]) }
  })
  const TAIL_CURV = TAIL_SEG.map((s, i) => {
    if (i === 0) return 0
    let d = s.ang - TAIL_SEG[i - 1].ang; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d
  })
  const WHISKERS = [
    { root: [130, 292], tip: [19, 294], bow: -6, side: 1 }, { root: [131, 297], tip: [24, 308], bow: -4, side: 1 },
    { root: [133, 302], tip: [44, 350], bow: 4, side: 1 },
    { root: [376, 182], tip: [454, 144], bow: -5, side: -1 }, { root: [378, 186], tip: [469, 165], bow: -3, side: -1 },
    { root: [379, 190], tip: [471, 186], bow: 3, side: -1 }
  ]
  const FISHING_PIVOT = [-30, -170], FISHING_LEN = 330
  const fishingAngle = t => 0.33 * Math.sin(TAU * 0.42 * t) + 0.06 * Math.sin(TAU * 1.1 * t)
  const spiderY = t => 250 + 22 * Math.sin(TAU * 0.5 * t) + 6 * Math.sin(TAU * 1.7 * t)

  /* ---------------------------------------------------------- 动作库 */
  const STATES = {
    calib: { label: '对齐', fade: 0.3, pose: () => ({ breath: 0, blink: 0, wagSlow: 0 }) },
    idle: { label: '待机', fade: 0.5, dur: '循环', use: '垫底的默认画面，旁白间隙', pose: lt => ({
      px: -1.05 + 0.25 * noise1(lt * 0.35 + 1), py: 0.25 + 0.15 * noise1(lt * 0.3 + 9),
      earR: 10 * bump(lt % 5.2, 3.0, 3.07, 3.18, 3.45), earL: 6 * bump(lt % 7.3, 5.0, 5.07, 5.2, 5.5),
      whisk: 2.5 * noise1(lt * 0.8), head: 1.5 * noise1(lt * 0.25 + 4)
    }) },
    look: { label: '张望', fade: 0.5, dur: '5s 循环', use: '转场前左顾右盼，引导视线', pose: lt => {
      const c = lt % 5
      const px = -0.75 + 1.5 * sm(1.0, 1.5, c) - 0.75 * sm(2.8, 3.3, c) - 0.75 * sm(4.4, 4.95, c)
      const up = bump(c, 2.8, 3.3, 4.2, 4.7)
      return { px, py: 0.12 - 0.7 * up, turn: px * 0.55, head: -px * 4 - 5 * up, earL: 4 * up, earR: 4 * up }
    } },
    talk: { label: '说话', fade: 0.35, dur: '循环', use: '配音段落；有音频时由口型同步驱动', pose: lt => {
      const gate = sm(-0.15, 0.25, noise1(lt * 0.7 + 4))
      const syl = Math.pow(Math.abs(Math.sin(lt * 10.5)), 0.8) * (0.55 + 0.45 * noise1(lt * 3 + 2))
      const m = clamp(syl * gate, 0, 1) * 0.85
      return { mouth: m, px: -0.25, py: 0.02, headY: m * 3, head: 2.5 * noise1(lt * 0.6), earL: 3, earR: 3, whisk: m * 5 }
    } },
    happy: { label: '开心', fade: 0.4, dur: '循环', use: '答对了、成功了、结尾致谢', pose: lt => ({
      eyeL: 0, eyeR: 0, lidCurve: 1, blink: 0, head: 6 * Math.sin(lt * TAU * 0.7),
      sy: 1 + 0.025 * Math.sin(lt * TAU * 1.4), wagFast: 5, wagSlow: 0, earL: 8, earR: 8,
      mouth: 0.35, fxStar: sm(0, 0.4, lt), py: 0, blush: 1
    }) },
    surprised: { label: '吓一跳', fade: 0.15, dur: '0.8s 单次', use: '抛出反常识结论的瞬间', pose: lt => {
      const a = sm(0, 0.12, lt)
      const sy = 1 + 0.08 * bump(lt, 0.04, 0.12, 0.14, 0.4) - 0.05 * bump(lt, 0.38, 0.46, 0.5, 0.75)
      return {
        eyeS: 1 + 0.18 * a, pupil: 1 - 0.45 * a, px: -0.1, py: -0.05, earL: -7 * a, earR: -7 * a,
        y: -28 * bump(lt, 0.05, 0.16, 0.18, 0.42), sy, sx: 1 / Math.sqrt(sy), fxBang: a,
        tailCurl: 1 - 0.25 * a, tailA: -14 * a, mouth: 0.5 * a, blink: 0
      }
    } },
    // 炸毛：参考 Canva 稿里的毛球——先一个惊跳，然后整只猫鼓成带尖刺的毛团，眼睛变竖椭圆、瞳孔变竖缝，尾巴竖起炸开
    scared: { label: '炸毛', fade: 0.12, dur: '循环', use: '风险、报错、踩坑', pose: lt => {
      const a = sm(0, 0.18, lt), jolt = bump(lt, 0, 0.08, 0.12, 0.45)
      const sy = 1 + 0.03 * a + 0.1 * jolt
      return {
        fuzz: a, sx: 1 + 0.13 * a - 0.04 * jolt, sy, y: -40 * jolt, earFlat: 0.45 * a, eyeS: 1 + 0.08 * a, eyeOval: a,
        pupil: 1 - 0.25 * a, slit: a, px: 0.05 * Math.sin(lt * 3), py: 0.05, x: 2.2 * a * Math.sin(lt * 52),
        tailCurl: 1 - 0.95 * a, tailA: -52 * a, whisk: -14 * a, blink: 0, head: -3 * a, wagSlow: 0, mouth: 0.18 * a
      }
    } },
    curious: { label: '好奇', fade: 0.5, dur: '单次 + 保持', use: '提出问题，配「?」', pose: lt => {
      const a = sm(0, 0.5, lt)
      return {
        head: 13 * a + 1.5 * Math.sin(lt * 1.6), turn: 0.15 * a, earL: -8 * a, earR: 12 * a, pupil: 1 + 0.3 * a,
        eyeS: 1 + 0.05 * a, px: -0.25, py: -0.15, fxQ: sm(0.3, 0.7, lt), wagSlow: 5
      }
    } },
    think: { label: '思考', fade: 0.5, dur: '5s 循环', use: '先冒省略号，再亮灯泡：恍然大悟', pose: lt => {
      const c = lt % 5, aha = sm(3.2, 3.4, c) * (1 - sm(4.6, 5, c))
      return {
        px: 0.5 - 0.7 * aha, py: -0.6 + 0.6 * aha, head: -7 * (1 - aha) + 3 * aha, turn: 0.2 * (1 - aha),
        tailA: 5 * Math.sin(lt * TAU * 0.8) * (1 - aha), fxIdea: aha, fxDots: (1 - aha) * sm(0.3, 0.8, c),
        eyeS: 1 + 0.1 * aha, earL: -6 * aha, earR: -6 * aha, mouth: 0.25 * aha
      }
    } },
    sleep: { label: '睡觉', fade: 0.8, dur: '循环', use: '无聊、等待、加载中', pose: lt => {
      const a = sm(0, 0.8, lt)
      return {
        eyeL: 0, eyeR: 0, lidCurve: -1, blink: 0, breath: 1 + 1.8 * a, head: 7 * a, headY: 6 * a,
        earFlat: 0.25 * a, sy: 1 - 0.02 * a, fxZ: sm(0.8, 1.6, lt), wagSlow: 0, px: 0, py: 0.3, whisk: -6 * a, glassDrop: a
      }
    } },
    wave: { label: '挥手', fade: 0.45, dur: '循环', use: '开场打招呼、片尾再见', pose: lt => {
      const a = sm(0, 0.45, lt)
      return { arm: a, armA: 95 + 105 * a, armB: 60 * a, armW: a, head: 5 * a, mouth: 0.3 * a, px: -0.3, py: 0, earL: 4, earR: 4, wagSlow: 5 }
    } },
    cheer: { label: '欢呼', fade: 0.35, dur: '循环', use: '双爪举高：庆祝、完成、冲鸭', pose: lt => {
      const a = sm(0, 0.35, lt), b = Math.sin(lt * TAU * 1.6)
      return {
        arm: a, armA: 95 + 110 * a, armB: 50 * a, armW: 0.5 * a, arm2: a, arm2A: 85 - 115 * a, arm2B: -50 * a, arm2W: 0.5 * a, armLen: 1 + 0.45 * a,
        eyeL: 0, eyeR: 0, lidCurve: 1, blink: 0, mouth: 0.5, y: -10 * Math.max(0, b), sy: 1 + 0.03 * b, wagFast: 6, wagSlow: 0, blush: 1, earL: 6, earR: 6
      }
    } },
    nod: { label: '点头', fade: 0.3, dur: '循环', use: '肯定、同意', pose: lt => {
      const n = Math.max(0, Math.sin(lt * TAU * 1.6)) * sm(0, 0.15, lt)
      return { headY: 10 * n, py: 0.15 + 0.4 * n, head: 2 * n, px: -0.3, earL: 2, earR: 2 }
    } },
    shake: { label: '摇头', fade: 0.3, dur: '循环', use: '否定、错误示范', pose: lt => {
      const s = Math.sin(lt * TAU * 2.2) * sm(0, 0.12, lt)
      return { turn: s, px: -0.1 + 0.55 * s, head: -3 * s, whisk: 3 * s }
    } },
    wink: { label: '眨眼', fade: 0.35, dur: '3s 循环', use: '小技巧、彩蛋', pose: lt => {
      const w = bump(lt % 3, 0.3, 0.45, 0.95, 1.15)
      return { eyeR: 1 - w, lidCurve: 1, mouth: 0.25 * w, head: -5 * w, fxStar: w, px: -0.35, earR: -4 * w, blush: w }
    } },
    jump: { label: '跳跃', fade: 0.3, dur: '2.2s 循环', use: '兴奋、宣布好消息', pose: lt => {
      const c = lt % 2.2
      const crouch = bump(c, 0, 0.22, 0.24, 0.34)
      const air = c > 0.3 && c < 0.95 ? Math.sin(Math.PI * (c - 0.3) / 0.65) : 0
      const stretch = bump(c, 0.28, 0.38, 0.5, 0.75), land = bump(c, 0.93, 1.0, 1.03, 1.35)
      const sy = 1 - 0.12 * crouch + 0.1 * stretch - 0.12 * land
      return { y: -150 * air, sy, sx: 1 / Math.sqrt(sy), eyeS: 1 + 0.08 * air, mouth: 0.3 * air, pupil: 1 + 0.15 * air }
    } },
    enter: { label: '登场', fade: 0.0001, dur: '0.7s 单次', use: '开场登场（带回弹）', pose: lt => {
      const k = clamp(lt / 0.7, 0, 1)
      return { sc: k <= 0 ? 0.0001 : backOut(k), y: 60 * (1 - sm(0, 0.55, lt)), eyeS: 1 + 0.12 * bump(lt, 0.4, 0.55, 0.7, 1.1), blink: sm(0.8, 1, lt) }
    } },
    exit: { label: '退场', fade: 0.15, dur: '0.5s 单次', use: '退场', pose: lt => {
      const k = clamp(lt / 0.5, 0, 1)
      return { sc: Math.max(0.0001, 1 - k * k * (2.7 * k - 1.7)), y: -20 * sm(0, 0.2, lt), eyeL: 1 - sm(0.05, 0.15, lt), eyeR: 1 - sm(0.05, 0.15, lt), lidCurve: 1, blink: 0 }
    } }
  }

  // 场景姿态：叠加在动作之上，只覆盖它声明的参数（比如举牌时爪子必须扶着牌子）
  const SCENE_POSE = {
    sign: () => ({ px: -0.35, py: 0.1 }),
    bubble: () => ({}),
    point: lt => { const a = sm(0, 0.4, lt); return { arm: a, armA: 95 + 87 * a, armB: -14 * a + 4 * Math.sin(lt * TAU * 0.7) * a, armW: 0, px: -1.25, py: 0.1, head: -3 * a, turn: -0.15 * a } },
    laptop: lt => ({ type: 1, px: -0.25, py: 0.62 + 0.04 * Math.sin(lt * 3), head: 4, headY: 4 }),
    book: lt => ({ scan: 1, px: -0.7 + 0.7 * ((lt % 2.4) / 2.4), py: 0.6, head: 5, headY: 5 }),
    fishing: (lt, t) => {
      const th = fishingAngle(t), fx = FISHING_PIVOT[0] + FISHING_LEN * Math.sin(th), fy = FISHING_PIVOT[1] + FISHING_LEN * Math.cos(th)
      const swipe = bump(lt % 3.2, 2.2, 2.35, 2.5, 2.9)
      return {
        px: clamp((fx - 200) / 140, -1.3, 1.3), py: clamp((fy - 190) / 140, -1.3, 1.3), turn: clamp((fx - 200) / 600, -0.4, 0.4),
        head: clamp((fx - 200) / 40, -8, 8), arm: swipe, armA: 95 + 120 * swipe, armB: 40 * swipe, armW: 0, wagFast: 3, earL: 5, earR: 5, pupil: 1.25
      }
    },
    peek: lt => ({ y: 330, px: -0.6 + 0.3 * noise1(lt * 0.4), py: -0.1, wagSlow: 0 }),
    write: lt => ({
      pose_hunch: 1, arm: 1, armA: 112 + 5 * Math.sin(lt * 6.3), armB: 28 + 9 * Math.sin(lt * 9.1), armW: 0, write: 1,
      px: -0.7 + 0.15 * Math.sin(lt * 6.3), py: 0.85, head: -3, wagSlow: 4
    }),
    scroll: () => ({ pose_lie: 1, px: -0.9, py: 0.35, wagSlow: 2.5 }),
    ring: lt => ({
      y: 30 + 7 * Math.sin(lt * 2.1), roll: 2.5 * Math.sin(lt * 1.4),
      arm: 1, armA: 205, armB: 50, armW: 0.35, arm2: 1, arm2A: -30, arm2B: -50, arm2W: 0.35, armLen: 1.45,
      px: -0.35, py: 0, mouth: 0.3, wagSlow: 0, earL: 5, earR: 5
    }),
    cabinet: lt => ({ y: 150 + 3 * Math.sin(lt * 1.3), px: -0.8 + 0.3 * noise1(lt * 0.5), py: 0.05, wagSlow: 0, earL: 3, earR: 6 * bump(lt % 4, 2, 2.08, 2.2, 2.5) }),
    money: lt => ({
      roll: 166 + 6 * Math.sin(lt * 1.8), y: -150, x: 10 * Math.sin(lt * 1.8),
      arm: 1, armA: 150 + 12 * Math.sin(lt * 4), armB: -25, arm2: 1, arm2A: 30 - 12 * Math.sin(lt * 4 + 1), arm2B: 25, armLen: 1.2,
      px: 0, py: -0.4, mouth: 0.4, wagFast: 4, wagSlow: 0, blush: 1, earL: 4, earR: 4
    }),
    spider: (lt, t) => ({
      arm: 1, armA: 250, armB: 12, armW: 0, eyeS: 1.16, pupil: 0.5, px: 0.15, py: clamp((spiderY(t) - 200) / 140, -0.4, 0.8),
      earL: -6, earR: -6, earFlat: 0.15, blink: 0, whisk: -8, x: 0.8 * Math.sin(lt * 40), mouth: 0
    })
  }

  /* ---------------------------------------------------------- 时间表 */
  // Agent 写的时间轴 → 引擎时间表。scene / accessories / text 是"粘性"的：不写就沿用上一条。
  function buildSchedule(timeline, defaults) {
    const d = defaults || {}
    const asList = v => v == null || v === '' ? [] : Array.isArray(v) ? v : [v]
    const items = [...timeline].sort((a, b) => (a.at || 0) - (b.at || 0))
    const out = []
    let prev = { id: 'idle', ta: 0, scenes: asList(d.scene), acc: asList(d.accessories), text: {} }
    for (const e of items) {
      const t0 = e.at || 0
      const id = e.do || prev.id
      if (!STATES[id] || id === 'calib') throw new Error(`未知动作 "${id}"，可用：${Object.keys(STATES).filter(k => k !== 'calib').join(', ')}`)
      const scenes = 'scene' in e ? asList(e.scene) : prev.scenes
      for (const sc of scenes) if (!SCENES[sc]) throw new Error(`未知场景 "${sc}"，可用：${Object.keys(SCENES).join(', ')}`)
      if (scenes.filter(sc => SCENES[sc].big).length > 1) throw new Error(`第 ${out.length + 1} 条同时用了多个大姿势场景（${scenes.join(', ')}），一次只能一个`)
      const acc = 'accessories' in e ? asList(e.accessories) : prev.acc
      for (const a of acc) if (!ACCESSORIES[a]) throw new Error(`未知配饰 "${a}"，可用：${Object.keys(ACCESSORIES).join(', ')}`)
      const text = Object.assign({}, prev.text)
      // text 可以是字符串（给当前带文字的场景）或 { sign: "...", bubble: "..." }
      if (e.text != null) {
        if (typeof e.text === 'object') Object.assign(text, e.text)
        else { const target = scenes.filter(sc => SCENES[sc].text); if (!target.length) throw new Error(`第 ${out.length + 1} 条写了 text，但当前没有带文字的场景（sign / bubble）`); for (const sc of target) text[sc] = String(e.text) }
      }
      const b = { id, t0, ta: e.do ? t0 : prev.ta, scenes, acc, text }
      out.push(b); prev = b
    }
    if (!out.length) out.push({ id: 'idle', t0: 0, ta: 0, scenes: prev.scenes, acc: prev.acc, text: {} })
    return out
  }

  /* ---------------------------------------------------------- 引擎：时间表 → 参数 */
  function poseOf(b, t) {
    const lt = Math.max(0, t - (b.ta == null ? b.t0 : b.ta)), ls = Math.max(0, t - b.t0)
    const out = Object.assign({}, REST, STATES[b.id].pose(lt))
    if (b.scenes) for (const sc of b.scenes) { Object.assign(out, SCENE_POSE[sc](ls, t)); out['sc_' + sc] = 1 }
    if (b.acc) for (const a of b.acc) out['ac_' + a] = 1
    return out
  }
  function mix(a, b, k) { const o = {}; for (const key of KEYS) o[key] = lerp(a[key], b[key], k); return o }
  function blockAt(schedule, t) {
    let i = -1; for (let j = 0; j < schedule.length; j++) if (schedule[j].t0 <= t) i = j
    return i
  }
  function blendAt(schedule, i, t) {
    if (i < 0) return Object.assign({}, REST)
    const b = schedule[i], p = poseOf(b, t), lt = t - b.t0
    const prevBig = i > 0 && (schedule[i - 1].scenes || []).some(s => SCENES[s].big), big = (b.scenes || []).some(s => SCENES[s].big)
    // 只换场景时用统一的淡入；进出大姿势给更长的过渡，让身体有时间变形
    let f = b.ta === b.t0 || b.ta == null ? STATES[b.id].fade : 0.45
    if (big !== prevBig || (big && prevBig)) {
      const bf = [...(b.scenes || []), ...(i > 0 ? schedule[i - 1].scenes || [] : [])].reduce((m, s) => Math.max(m, SCENES[s].fade || 0.75), 0.75)
      f = Math.max(f, bf)
    }
    if (i === 0 || lt >= f) return p
    // 切换落在上一次淡入过程中时，从"屏幕上实际的合成帧"出发，所以连点也不跳（bloub 的同款修复）
    return mix(blendAt(schedule, i - 1, t), p, smoother(lt / f))
  }
  const rigAt = (schedule, t) => blendAt(schedule, blockAt(schedule, t), t)

  // 预生成的眨眼日程：每 4 秒窗口一次，偶尔连眨两下
  function blinkAt(t) {
    const k = Math.floor(t / 4), base = k * 4 + 0.6 + hash(k) * 2.6
    const one = s => { const d = t - s; return d < 0 || d > 0.18 ? 1 : d < 0.07 ? 1 - sm(0, 0.07, d) : sm(0.07, 0.18, d) }
    let v = one(base); if (hash(k + 0.37) > 0.72) v = Math.min(v, one(base + 0.26))
    return v
  }

  /* ---------------------------------------------------------- 几何 */
  // 静息坐标 → 世界坐标。所有挂在猫身上的东西（锚点、五官、配饰、道具）都走这一个映射，
  // 所以挤压、歪头、打滚、大姿势时它们天然一致。skipFace：身体锚点已经包含大姿势位移，不再叠加。
  function place(x, y, w, r, par, skipFace) {
    const fo = r._fo
    if (w > 0 && !skipFace) { x += fo[0] * w; y += fo[1] * w }
    if (w > 0) {
      const px = PIV[0] + fo[0], py = PIV[1] + fo[1]
      const a = r.head * w * D2R, dx = x - px, dy = y - py
      x = px + dx * Math.cos(a) - dy * Math.sin(a); y = py + dx * Math.sin(a) + dy * Math.cos(a)
      x += r.turn * (10 + (par || 0)) * w; y += r.headY * w * (1 + (par ? 0.25 : 0))
    }
    const bt = r._bt
    x = CX + (x - CX) * (1 + 0.014 * bt * (1 - w)); y = G + (y - G) * (1 + 0.007 * bt)
    const sh = Math.tan(r.lean * D2R)
    x = CX + (x - CX) * r.sx + sh * (G - y); y = G + (y - G) * r.sy
    if (r.roll) {
      const a = r.roll * D2R, dx = x - ROLL_C[0], dy = y - ROLL_C[1]
      x = ROLL_C[0] + dx * Math.cos(a) - dy * Math.sin(a); y = ROLL_C[1] + dx * Math.sin(a) + dy * Math.cos(a)
    }
    x = CX + (x - CX) * r.sc; y = G + (y - G) * r.sc
    return [x + r.x, y + r.y]
  }
  // 映射在某一点的局部仿射（雅可比）：配饰在静息坐标里画好，套上这个矩阵就会跟着身体一起挤压、旋转、缩放
  function affAt(x, y, w, r, par) {
    const p = place(x, y, w, r, par), a = place(x + 1, y, w, r, par), b = place(x, y + 1, w, r, par)
    const A = a[0] - p[0], B = a[1] - p[1], C = b[0] - p[0], D = b[1] - p[1]
    return [A, B, C, D, p[0] - (A * x + C * y), p[1] - (B * x + D * y)].map(v => Math.round(v * 10000) / 10000)
  }
  const rot = (p, c, a) => { const s = Math.sin(a), k = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * k - dy * s, c[1] + dx * s + dy * k] }
  const f1 = v => Math.round(v * 10) / 10
  const pt = p => f1(p[0]) + ' ' + f1(p[1])

  // 锚点 → 三次贝塞尔（切线取相邻点方向，长度取弦长/3：不会打结也不会过冲）
  function beziers(pts, k, closed) {
    const n = pts.length, segs = []
    const dir = pts.map((p, i) => {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]
    })
    const m = closed ? n : n - 1
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n, p = pts[i], q = pts[j], L = Math.hypot(q[0] - p[0], q[1] - p[1]) / 3
      segs.push([p, [p[0] + dir[i][0] * L * k[i], p[1] + dir[i][1] * L * k[i]], [q[0] - dir[j][0] * L * k[j], q[1] - dir[j][1] * L * k[j]], q])
    }
    return segs
  }
  const segPath = (segs, closed) => 'M' + pt(segs[0][0]) + segs.map(s => `C${pt(s[1])} ${pt(s[2])} ${pt(s[3])}`).join('') + (closed ? 'Z' : '')
  function bez(s, u) {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u
    return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]]
  }
  const dense = (segs, n) => { const P = []; for (const s of segs) for (let u = 0; u < n; u++) P.push(bez(s, u / n)); return P }
  // 毛刺：一簇簇三角形尖刺，长度各不相同，炸毛时抖动
  function tufts(P, amount, t, seed, closed, base) {
    const n = P.length, out = [], G6 = 6
    for (let i = 0; i < n; i++) {
      const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1
      const k = Math.floor(i / G6), ph = (i % G6) / G6
      const L = 12 + 26 * hash(k * 1.7 + seed)
      const spike = Math.pow(1 - Math.abs(2 * ph - 1), 1.6) * L * (0.85 + 0.15 * Math.sin(t * 31 + k * 2.3))
      const d = amount * ((base || 8) + spike)
      out.push([P[i][0] + ty / l * d, P[i][1] - tx / l * d])
    }
    return out
  }

  /* ---------------------------------------------------------- 一帧 */
  // ext: { look: {px, py, mix}, mouthAt: t => 0..1 }（口型同步的音量包络）
  function frameAt(schedule, t, ext) {
    ext = ext || {}
    const r = rigAt(schedule, t)
    const look = ext.look
    if (look && look.mix > 0) {
      r.px = lerp(r.px, look.px, look.mix); r.py = lerp(r.py, look.py, look.mix); r.turn += look.px * 0.22 * look.mix
    }
    if (ext.mouthAt) { const m = ext.mouthAt(t + 0.04); r.mouth = Math.max(r.mouth, m); r.headY += m * 2 }
    r._bt = Math.sin(TAU * t / 3.4) * r.breath
    const kL = r.pose_lie, kH = r.pose_hunch, kSit = Math.max(0, 1 - kL - kH)
    const mixP = (a, b) => [a[0] * kL + b[0] * kH, a[1] * kL + b[1] * kH]
    r._fo = mixP(POSES.lie.face, POSES.hunch.face)
    // 惯性：用速度驱动尾巴、耳朵和配饰（取 t 与 t-50ms 两个纯采样的差，不需要物理状态）
    const yAt = tt => rigAt(schedule, tt).y
    const vy = (yAt(t) - yAt(t - 0.05)) / 0.05, vyLag = (yAt(t - 0.06) - yAt(t - 0.11)) / 0.05

    // 身体：坐姿锚点和大姿势锚点按权重混合
    const pts = [], ks = []
    BODY.forEach(([bx, by, w, k, tag], i) => {
      let x = bx * kSit + POSES.lie.pts[i][0] * kL + POSES.hunch.pts[i][0] * kH
      let y = by * kSit + POSES.lie.pts[i][1] * kL + POSES.hunch.pts[i][1] * kH
      if (tag === 'eLt' || tag === 'eRt') {
        const base = tag === 'eLt' ? EAR_L : EAR_R, b = [base[0] + r._fo[0], base[1] + r._fo[1]]
        const sgn = tag === 'eLt' ? -1 : 1, ang = tag === 'eLt' ? r.earL : r.earR
        const p = rot([x + (b[0] - x) * 0.45 * r.earFlat, y + (b[1] - y) * 0.45 * r.earFlat], b, sgn * (ang + 50 * r.earFlat - vy * 0.02) * D2R)
        x = p[0]; y = p[1]
      }
      // 炸毛时整体向一个毛球收拢（参考 Canva 稿的毛团），保留耳朵
      if (r.fuzz > 0 && !tag) {
        const cx = 262 + r._fo[0] * 0.5, cy = 360 + r._fo[1] * 0.5, a = Math.atan2(y - cy, x - cx)
        x = lerp(x, cx + Math.cos(a) * 200, r.fuzz * 0.3); y = lerp(y, cy + Math.sin(a) * 300, r.fuzz * 0.3)
      }
      pts.push(place(x, y, w, r, 0, true)); ks.push(k)
    })
    const segs = beziers(pts, ks, true)
    let body
    if (r.fuzz > 0.002) {
      const P = tufts(dense(segs, 14), r.fuzz, t, 0, true, 8)
      body = 'M' + P.map(pt).join('L') + 'Z'
    } else body = segPath(segs, true)

    // 尾巴：正向运动学，每节读取 i×45ms 之前的姿态 → 动作像波一样从根部传到尾尖
    const tOff = mixP(POSES.lie.tail, POSES.hunch.tail)
    const tp = [[TAIL[0][0] + tOff[0], TAIL[0][1] + tOff[1]]]
    let x = tp[0][0], y = tp[0][1], ang = 0
    for (let i = 0; i < TAIL_SEG.length; i++) {
      const tl = t - i * 0.045, ri = rigAt(schedule, tl)
      const vyl = (ri.y - rigAt(schedule, tl - 0.05).y) / 0.05
      const poseA = POSES.hunch.tailA * ri.pose_hunch, poseC = lerp(1, POSES.hunch.tailCurl, ri.pose_hunch)
      if (i === 0) ang = TAIL_SEG[0].ang + (ri.tailA + poseA + clamp(vyl * 0.06, -35, 35)) * D2R
      else ang += TAIL_CURV[i] * ri.tailCurl * poseC
      ang += (ri.wagSlow * Math.sin(TAU * 0.55 * tl - i * 0.55) + ri.wagFast * Math.sin(TAU * 2.1 * tl - i * 0.7)) * D2R * 0.35
      x += TAIL_SEG[i].len * Math.cos(ang); y += TAIL_SEG[i].len * Math.sin(ang); tp.push([x, y])
    }
    const tailPts = tp.map(p => place(p[0], p[1], 0, r))
    const tailSegs = beziers(tailPts, tailPts.map(() => 1), false)
    const tail = segPath(tailSegs, false)
    // 炸毛时尾巴变成带毛刺的实心轮廓
    let tailFuzz = null
    if (r.fuzz > 0.002) {
      const S = dense(tailSegs, 10); S.push(tailPts[tailPts.length - 1])
      const half = TAIL_W * r.sc * (0.5 + 0.35 * r.fuzz), L = [], R = []
      S.forEach((p, i) => {
        const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1
        const nx = ty / l, ny = -tx / l
        L.push([p[0] + nx * half, p[1] + ny * half]); R.push([p[0] - nx * half, p[1] - ny * half])
      })
      const end = S[S.length - 1], prev = S[S.length - 2], ea = Math.atan2(end[1] - prev[1], end[0] - prev[0]), cap = []
      for (let k = 1; k < 8; k++) { const a = ea - Math.PI / 2 + Math.PI * k / 8; cap.push([end[0] + Math.cos(a) * half, end[1] + Math.sin(a) * half]) }
      const ring = [...L, ...cap, ...R.reverse()]
      tailFuzz = 'M' + tufts(ring, r.fuzz * 0.8, t, 50, true, 4).map(pt).join('L') + 'Z'
    }

    // 眼睛：(椭)圆 ∩ 上下眼睑，眼睑边缘的弧度由 lidCurve 决定（-1 睡眼 ‿，+1 笑眼 ^）
    const blinkV = blinkAt(t)
    const eyes = EYES.map((e, idx) => {
      const open = clamp((idx ? r.eyeR : r.eyeL) * lerp(1, blinkV, r.blink), 0, 1)
      const R = e.r * r.eyeS, Rx = R * (1 - 0.1 * r.eyeOval), Ry = R * (1 + 0.22 * r.eyeOval), c0 = e.c
      const closeY = c0[1] + 0.2 * Ry, bulge = 0.42 * R * r.lidCurve
      const top = c0[1] - Ry - 2 + (closeY - c0[1] + Ry + 2) * (1 - open)
      const bot = c0[1] + Ry + 2 - (c0[1] + Ry + 2 - closeY) * (1 - open)
      const ap = []
      for (let k = 0; k < 64; k++) {
        const a = k / 64 * TAU, ex = c0[0] + Math.cos(a) * Rx, u = (ex - c0[0]) / Rx, lid = bulge * (1 - u * u)
        let ey = c0[1] + Math.sin(a) * Ry
        const tY = top - lid * (1 - open), bY = bot - lid * (1 - open)
        ey = tY > bY ? (tY + bY) / 2 : clamp(ey, tY, bY)
        ap.push(place(ex, ey, 1, r, 14))
      }
      const line = []
      for (let k = 0; k <= 12; k++) { const u = -0.82 + 1.64 * k / 12; line.push(place(c0[0] + u * Rx, closeY - bulge * (1 - u * u), 1, r, 14)) }
      const pr = 13 * r.pupil * r.eyeS
      const prx = pr * (1 - 0.55 * r.slit), pry = pr * (1 + 1.1 * r.slit)
      let ox = r.px * Rx * 0.55, oy = r.py * Ry * 0.55; const ol = Math.hypot(ox / Rx, oy / Ry) * R, lim = R - Math.max(prx, pry) - 3
      if (ol > lim) { ox *= lim / ol; oy *= lim / ol }
      const pc = place(c0[0] + ox, c0[1] + oy, 1, r, 18)
      const wc = place(c0[0], c0[1], 1, r, 14)
      return {
        aperture: 'M' + ap.map(pt).join('L') + 'Z', center: wc, R: R * r.sc,
        pupil: { cx: pc[0], cy: pc[1], rx: prx * r.sc, ry: pry * r.sc, rot: r.head + r.roll },
        line: 'M' + line.map(pt).join('L'), lineAlpha: 1 - sm(0.04, 0.2, open)
      }
    })

    // 口鼻
    const P = (x, y, par) => place(x, y, 1, r, par == null ? 16 : par)
    const nose = `M${pt(P(179, 249))}L${pt(P(193, 249))}L${pt(P(186, 258))}Z`
    const m1 = P(188, 276)
    const mouthLine = `M${pt(P(186, 258))}L${pt(m1)}M${pt(P(182, 286))}Q${pt(P(184, 279))} ${pt(m1)}Q${pt(P(194, 278))} ${pt(P(199, 285))}`
    const mc = P(189, 278 + 6 * r.mouth)
    const mouthOpen = { cx: mc[0], cy: mc[1], rx: (5 + 4 * r.mouth) * r.sc, ry: Math.max(0.01, 11 * r.mouth) * r.sc, a: sm(0.03, 0.15, r.mouth), rot: r.head + r.roll }
    const blushA = Math.max(r.blush, r.ac_blush)
    const blush = [P(122, 262, 14), P(236, 252, 14)]

    // 胡须
    const whiskers = WHISKERS.map((wk, i) => {
      const a = (r.whisk * wk.side + 1.5 * noise1(t * 1.3 + i * 3.1)) * D2R
      const tip = rot(wk.tip, wk.root, a), mid = [(wk.root[0] + tip[0]) / 2, (wk.root[1] + tip[1]) / 2 + wk.bow]
      return `M${pt(place(wk.root[0], wk.root[1], 1, r, 10))}Q${pt(place(mid[0], mid[1], 1, r, 10))} ${pt(place(tip[0], tip[1], 1, r, 10))}`
    })

    // 两只前爪（两节，Q 曲线让肘部自然）；肩膀位置跟着大姿势走
    const sOff1 = mixP([POSES.lie.s1[0] - S1[0], POSES.lie.s1[1] - S1[1]], [POSES.hunch.s1[0] - S1[0], POSES.hunch.s1[1] - S1[1]])
    const sOff2 = mixP([POSES.lie.s2[0] - S2[0], POSES.lie.s2[1] - S2[1]], [POSES.hunch.s2[0] - S2[0], POSES.hunch.s2[1] - S2[1]])
    function arm(S, off, A, B, W, show, phase) {
      const a1 = A * D2R, bend = (B + W * 26 * Math.sin(TAU * 1.8 * t + phase)) * D2R
      const s0 = [S[0] + off[0], S[1] + off[1]]
      const L = lerp(1, r.armLen, show)
      const e1 = [s0[0] + 85 * L * Math.cos(a1), s0[1] + 85 * L * Math.sin(a1)]
      const e2 = [e1[0] + 82 * L * Math.cos(a1 + bend), e1[1] + 82 * L * Math.sin(a1 + bend)]
      const ps = place(s0[0], s0[1], 0.1, r), pe1 = place(e1[0], e1[1], 0.1, r), pe2 = place(e2[0], e2[1], 0.1, r)
      return { d: `M${pt(ps)}Q${pt(pe1)} ${pt(pe2)}`, shoulder: ps, tip: pe2, dir: Math.atan2(pe2[1] - pe1[1], pe2[0] - pe1[0]), a: sm(0.05, 0.35, show), show }
    }
    const arms = [arm(S1, sOff1, r.armA, r.armB, r.armW, r.arm, 0), arm(S2, sOff2, r.arm2A, r.arm2B, r.arm2W, r.arm2, 1.3)]

    // 后脚白线（大姿势里没有这个视角）
    const foot = { d: `M${pt(place(324, 615, 0, r))}Q${pt(place(336, 608, 0, r))} ${pt(place(349, 614, 0, r))}Q${pt(place(361, 609, 0, r))} ${pt(place(376, 617, 0, r))}`, a: kSit * (1 - r.fuzz) }

    // 配饰：每件给出"静息坐标里的锚点 + 跟随矩阵 + 反应量"，绘制时在静息坐标里画
    const pop = clamp(r.fuzz + 0.6 * r.fxBang, 0, 1)
    const fall = clamp(vyLag * 0.025, -12, 22) // 下落时帽子、眼镜微微飘起
    const acc = {
      head: affAt(205, 150, 1, r, 8), // 头部刚性矩阵：帽子、耳机、眼镜
      face: affAt(205, 190, 1, r, 14),
      mouth: affAt(186, 285, 1, r, 16),
      neck: affAt(220, 355, 0.85, r, 0), sit: kSit,
      pop, fall, tilt: r.fuzz * 9 + r.fxBang * 4, drop: r.glassDrop, eyeS: r.eyeS, eyeOval: r.eyeOval,
      swing: 10 * Math.sin(t * 3.1) * 0.4 + clamp(-vy * 0.05, -25, 25) + r.x * 1.5,
      tassel: 6 * Math.sin(t * 1.7) + clamp(-vyLag * 0.06, -30, 30) - r.head * 0.6,
      fishWag: 10 * Math.sin(t * 7) * (0.3 + r.mouth) + 4 * Math.sin(t * 2.3)
    }
    // 场景道具：世界里固定的（柜子、纸、卷轴）直接用静息坐标；跟着猫动的给矩阵
    const fth = fishingAngle(t)
    const props = {
      body: affAt(262, 470, 0.05, r, 0),
      sign: { c: place(262, 470, 0.08, r), rot: r.head * 0.1 + 1.2 * Math.sin(t * 1.1) + r.roll * 0.5 },
      bubble: { c: P(60, -80, 4), tail: P(150, 30, 4) }, // 气泡在猫面朝的一侧（画面中间方向），角落里也不会出画
      laptop: { c: place(250, 560, 0, r), tap: [Math.max(0, Math.sin(t * 17)) * r.type, Math.max(0, Math.sin(t * 17 + 2.1)) * r.type] },
      book: { c: place(240, 470, 0.15, r), rot: -4 + r.head * 0.3 },
      fishing: { pivot: FISHING_PIVOT, fish: [FISHING_PIVOT[0] + FISHING_LEN * Math.sin(fth), FISHING_PIVOT[1] + FISHING_LEN * Math.cos(fth)], rot: -fth / D2R },
      ring: { y: r.y, tilt: r.roll },
      spider: { y: spiderY(t), sway: 3 * Math.sin(t * 1.3) },
      write: { tip: arms[0].tip, progress: (t % 4) / 4 },
      money: { t }
    }
    // 遮挡线：探头、游泳圈、文件柜都把猫的下半身藏起来
    const clipBottom = Math.min(G + (1 - r.sc_peek) * 3000, 560 + r.y + (1 - r.sc_ring) * 3000, 492 + (1 - r.sc_cabinet) * 3000)

    const texts = {}
    const bi = blockAt(schedule, t)
    if (bi >= 0) Object.assign(texts, schedule[bi].text)

    return {
      r, t, body, tail, tailFuzz, tailW: TAIL_W * r.sc, eyes, nose, mouthLine, mouthOpen, blush: { pts: blush, a: blushA },
      whiskers, arms, foot, acc, props, texts, clipBottom, anchor: P(300, 20), scale: r.sc
    }
  }

  const api = { STATES, SCENES, ACCESSORIES, REST, CX, G, buildSchedule, rigAt, frameAt, blinkAt, noise1, sm, TAU }
  global.GeekCat = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
