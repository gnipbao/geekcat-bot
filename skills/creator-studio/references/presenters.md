# 主讲

工程根目录的 `presenter.json` 决定谁来讲；只有 `ip.json` 的旧工程按 `mascot` 处理；都没有 = `none`（纯配音）。

| kind | 画面 | 声音 | 模板 |
|---|---|---|---|
| `mascot` | IP 角色原生图层（知识猫：代码绘制，口型跟旁白） | 旁白音轨 | `templates/presenter/mascot.json`（= `templates/ip/geekcat.ip.json` + `kind`） |
| `camera` | 摄像头真人（`ingest.py` 剪好的 `footage/camera.cut.mp4`） | 旁白音轨 = 剪好的人声 | `templates/presenter/camera.json` |
| `avatar` | 数字人视频文件 | 旁白音轨 | `templates/presenter/avatar.json` |
| `none` | 无 | 旁白音轨 | — |

自称：口播稿里主讲只用 `selfName` 称呼自己（知识猫是「知识猫」，真人是「猫哥」）。

## IP 角色的两种出场方式

`presenter.json` 里写 `"display"`（不写时：讲解 = `overlay`，教程 / 口播 = `stage`）：

| display | 样子 | 什么时候用 |
|---|---|---|
| `stage` 主播 | 角色有自己的"机位"（半身、居中），装在和真人一样的画框里，背后是主题的演播背景（`theme.json.presenter.stage`）。全屏、侧栏、小窗、跳推、挪位都走版式轨道，和摄像头真人完全一样 | 口播、录屏教程、想要"主播感"的讲解；**深色主题必须用它**（黑猫站在亮色演播背景里，不会融进黑底） |
| `overlay` 陪伴 | 老样子：透明底的角色站在场景上面，位置由角色剧本里的 `cat` 控制 | 全屏动效讲解（场景给角色留了站位） |

stage 模式下角色剧本只管表演（动作、表情、配饰、口型），位置写在版式轨道里；`node <skill>/scripts/direct.mjs <工程>` 会按句子语气自动排一版表演（提问 → 好奇、反转 → 吓一跳、否定 → 摇头、数字 / 肯定 → 点头、结尾 → 挥手，表情做完回到说话）。别的 IP 动作名不同时，在 `presenter.json` 写 `"acting": {"question": "…", "twist": "…"}` 映射；机位不合适写 `"camera": {"cat": {x, y, scale}, "face": {x, y, w, h}}`。

## 版式轨道 presenter/track.json（camera / avatar / stage 模式的 mascot）

```json
[
  { "at": 0, "mode": "full" },
  { "at": 6.9, "mode": "pip", "corner": "br", "size": 0.27 },
  { "at": 24.1, "mode": "side" },
  { "at": 34.9, "mode": "full" }
]
```

| mode | 横版画框 | 场景内容的安全区 |
|---|---|---|
| `full` | 铺满画面 | 叠加层只放上沿和下三分之一，不压脸（人脸框见 `footage/camera.cut.face.json`） |
| `side` | 右侧 34% 竖栏（四周留 5% 边） | 左侧 0–1180px |
| `pip` | 角落方块 / 圆（`corner`: br / bl / tr / tl，`size` 占画面高的比例，默认 0.27） | 避开那个角：右下 pip 时 x > 1500 且 y > 680 不放东西 |
| `off` | 淡出隐藏 | 全屏 |

条目还可以带（只写这些、不写 `mode` 的条目沿用上一条的版式）：

| 字段 | 作用 |
|---|---|
| `zoom` | 推近倍数，绕着脸。`"cut": true` 硬切（跳推，1.12–1.20，句首交替近 / 远）；不写 cut 是 0.35 秒快推（重点句 1.2–1.3）；`"over": 6` 缓推 6 秒（长解释段 1.08–1.15） |
| `shift` | `[dx, dy]`（画框宽高的比例）把人往旁边挪，给花字让位，例如 `[0.17, 0]` 靠右 |
| `corner` / `size` | 小窗在哪个角（br / bl / tr / tl）、多大（占画面高的比例）；侧栏 `corner: "l"` 放左边、`size` 是宽度比例 |
| `rect` / `shape` | 任意位置：`[x, y, w, h]`（像素，或 0–1 的比例）；`shape`: `circle` / `card` |

- 切换 0.6 秒平滑过渡（位移、缩放、圆角一起动），进出 `off` 是淡入淡出；时间点放在句首前 0.1–0.2 秒。跳推只放在句首，不在句子中间切。
- 人脸居中：`ingest.py` 用 macOS Vision 多帧取中位数写 `footage/<名字>.face.json`；找不到（非 macOS、卡通形象）就在 `presenter.json` 写 `"face": {"x":0.5,"y":0.36,"w":0.28,"h":0.2}`（0–1，左上原点，抽一帧看着估）。
- 画框外观（边框、阴影、小窗是圆还是方）来自主题 `theme.json.presenter`。
- 录屏窗口会跟着版式让位（`side` 时缩到左侧、`pip` 时让出小窗那一列）。
- 层级：讲解里主讲在场景上面；教程 / 口播里主讲在叠加层下面（字贴在人像上）。
- 没写 track.json 时：讲解 `side`、教程 `pip`、口播 `full` 全程。竖版里所有非 `off` 的版式都显示成下方的主讲卡片。

## mascot（IP 角色）接入约定

流程不认识任何具体角色，只读 `presenter.json`（或 `ip.json`）。换角色 = 换这个文件（和角色自己的仓库）。

| 字段 | 必需 | 作用 |
|---|---|---|
| `kind` | presenter.json 里必需 | `"mascot"` |
| `id` | 是 | 图层 composition id，也是 `video.json.ip.id` |
| `name` / `selfName` / `persona` | 是 / 是 / 建议 | 名字、口播里的自称、性格（决定口吻和动作） |
| `repo` / `repoEnv` / `repoProbe` | 是 | 角色仓库路径（命令模板里的 `{repo}`）、环境变量名、用来确认仓库的文件 |
| `setup` | 否 | 首次使用要执行的安装命令 |
| `commands.list / validate / layer / still` | 是 | 动作目录；校验剧本 `{script}`；剧本 → HyperFrames 子合成 `{script}` `{out}` `{id}`；某一时刻的透明 PNG `{script}` `{at}` `{dir}`（最后一行 `{"files":[...]}`） |
| `scriptSchema` / `guide` | 建议 | 角色剧本 schema 和说明 |
| `zones` | 建议 | 常用站位（host / side / peek / center），场景排版据此留空 |

调用统一走 `node <skill>/scripts/ip.mjs <list|validate|layer|still|info> [--ip presenter.json] --script mascot/script.json`。

角色剧本（`mascot/script.json`）的要求：`width` / `height` / `duration` 与主合成一致；`lipsync` 指向 `../narration/narration-full.mp3`；时间点用旁白真实时间、动作切在句首前 0.2 秒；站位随内容在 zones 之间移动（知识猫：timeline 条目里的 `"cat": {x, y, scale, duration}`）。竖版由 `build.mjs` 自动生成一份站位固定在主讲区的剧本。

新角色最低实现两条命令：`layer`（输出 `<template>` 包裹、根节点 `data-composition-id="{id}"`、注册暂停的 GSAP 时间轴、画面是时间的纯函数的子合成）和 `still`（透明 PNG）。只有序列帧 / 透明视频的角色，`layer` 生成一个包住 `<video>` 的子合成即可。

深色主题（night）会给角色图层加一圈描边光（`theme.json.mascotFilter`），黑猫不会融进底色。

## avatar（数字人）接入约定

现在没有绑定任何数字人平台：**把数字人视频当成一段"摄像头素材"交给流水线**，版式、人脸居中、竖版卡片、封面抽帧全部和 camera 一样。

两种做法：

1. **稿子先行**（推荐，口型最准）：`tts.py` 出 `narration-full.mp3`（可用克隆声音）→ 在数字人平台用**这段音频驱动**生成视频（时长必须和音频一致）→ 放到 `presenter/avatar.mp4` → `presenter.json` 写 `{"kind": "avatar", "src": "presenter/avatar.mp4"}`。时间轴就是 TTS 的，场景照常写。
2. **素材先行**：平台按稿子直接生成带声音的数字人视频 → 当摄像头素材 `ingest.py --camera avatar.mp4 [--script 稿子]`，再把 `presenter.json` 的 `kind` 改成 `avatar`。

视频要求：H.264 MP4，人物居中、上半身，背景随意（小窗和侧栏会裁切）；绿幕 / 透明背景版本先用平台自己导出带背景的版本（流水线暂不做抠像）。平台选好以后可以把生成步骤接成脚本（例如通过平台 API 或已连接的工具），文件契约不变。
