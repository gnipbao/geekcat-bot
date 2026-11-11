# 封面

`node <skill>/scripts/covers.mjs <工程>` 读 `cover.json`，输出 `covers/cover-{16x9,16x10,4x3,3x4,9x16}.png` 和 `covers/youtube-1280x720.png`（超过 2MB 自动另存 JPG）。同目录留有 HTML，可微调后重新截图。每个平台用哪张见 `platforms.md`。

版式跟着 `video.json` 的主题走，`cover.json` 的 `"style"` 可以覆盖：

| 主题 / style | 版式 |
|---|---|
| `pop` / `blockframe` | 海报：色块标题（倾斜）+ 徽章 + 背景大字 + 胶带，角色居中构图 |
| `lab` / `swiss` | 瑞士极简：大号英文名 + 中文钩子（`*…*` 红色）+ 红色短条细线 + 一行数据，人物站在右侧 / 下方；和频道横幅同一语言 |
| `night` | 深色网格：等宽英文名 + 黄色光标、钩子里 `*…*` 是黄色块、`›` 开头的数据行，人物是圆角卡片或带描边光的角色 |
| `aurora` | 极光：近黑底 + 紫蓝光晕和网格、Geist 大字、钩子里 `*…*` 是渐变字，人物是发光圆角卡片或带描边光的角色 |
| `bento` | 便当格：浅灰底、Geist 大字、渐变字强调、无分隔线，人物是大圆角卡片 |
| `volt` | 电光：纯黑点阵、得意黑斜体大字、`*…*` 是荧光绿色块、`//` 栏目名、条码装饰 |
| `paper` | 手账：手写栏目名、钩子里 `*…*` 是记号笔、波浪线、拍立得照片 + 胶带，或角色 |

```json
{
  "brand": { "label": "知识猫AI实验室" },
  "eyebrow": "开源实测",
  "title": ["REA", "AI *逆向*一切"],
  "subtitle": "14.6 万星 / 我拿自己开刀实测",
  "figure": "camera",
  "figureAt": 5,
  "ip": { "do": "surprised", "at": 0.45, "accessories": ["glasses"] }
}
```

- `title[0]`：主标题（项目 / 产品名，越短越醒目，≤ 5 个字符的英文或 ≤ 4 个汉字最好）；`title[1…]`：中文钩子，每项一行，`*…*` 是强调。blockframe 版式里每项是一块色块。
- `subtitle`：一句卖点或数据，≤ 14 字；`eyebrow` + `brand.label` 组成栏目名。
- blockframe 专用：`badge`（2–3 字徽章）、`ghost`（背景大字）、`ground`、`chipColors`。
- 人物图（按顺序取第一个有的）：
  1. `brand.photo`：品牌照片（相对工程目录的 PNG，人物贴底边、背景和底色同色效果最好；`brand.photoAspect` 默认 0.735）。照片常有版权或肖像问题：放在工程外的品牌目录，不要提交。
  2. `"figure": "camera"`：从摄像头 / 数字人素材的 `figureAt` 秒抽一帧，按人脸框裁成 3:4。
  3. 主讲是 mascot 时：角色定格图（`ip` 写动作和时刻；有情绪的瞬间最好：surprised at≈0.45 带「!」、happy、curious at≈1.2 带「?」、scared at≈1.2 炸毛；`scene: "sign"` + `text` 举牌）。`"ip": false` 不放角色。
- 字号按可用宽度自动收缩，文字不会压到人物上。字体由 `new.sh` 下载到工程 `assets/fonts`（OFL）。
- 交付前每张都要打开看：文字不出画、人物不被裁、徽章不压字；缩到信息流大小（360px 宽）标题和人物表情还看得清。
