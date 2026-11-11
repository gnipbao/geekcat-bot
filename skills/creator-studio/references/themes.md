# 主题

`video.json` 写 `"theme": "lab"`。主题 = `kit/base.css`（结构 + 默认变量）+ `themes/<name>/theme.css`（变量 + 少量覆盖）+ `themes/<name>/theme.json`（底色序列、命名色、字幕样式、主讲画框、封面版式）。场景、录屏窗口、标题条、字幕、封面全部跟着主题走。

| 主题 | 一句话 | 适合 | 封面版式 |
|---|---|---|---|
| `lab` 实验室（品牌默认） | 纸色 #F2F0EC、墨黑 #141414、红 #E30613、黄 #F7CB46（墨墨的眼镜）；瑞士网格、方角、只有大卡片有硬阴影、标签前一个红方块 | 讲解、教程、口播都行；和频道 swiss 封面同一种语言 | swiss |
| `night` 夜间终端 | 近黑 #0E0F11、暖白字、黄色强调、终端绿；圆角细边、柔和投影、等宽标题；黑猫自动加描边光 | 录屏教程、写代码、AI 工具实测 | night |
| `paper` 手账 | 米白纸 + 点阵（墨墨线稿原图同款底）、黄色记号笔高亮、红笔批注、手写标签（Caveat / 龙藏体） | 想法、观点、方法论 | paper |
| `aurora` 极光 | 近黑底 + 紫蓝青极光、发丝细边、玻璃质感卡片、渐变字高亮、描边大字（Linear / Vercel 一路的深色科技感）；Geist 字体；黑猫自动加描边光 | 讲解、教程；深色里最"贵"的一套 | aurora |
| `bento` 便当格 | 浅灰底、纯白大圆角卡片、柔和投影、蓝紫粉渐变字、灵动岛式黑色关键词胶囊和字幕（苹果发布会一路）；反白是纯黑 | 讲解、评测、口播；让数字和产品说话 | bento |
| `volt` 电光 | 纯黑 + 荧光绿、得意黑斜体大标题、等宽小标签、卡片四角取景框角标、条码装饰；反白是整屏荧光绿 | 短视频、热点快评、工具速览；网感最强 | volt |
| `pop` 糖果 | 原 BlockFrame：粗黑边、硬阴影、糖果色逐场轮换 | B站向的热闹工具介绍；旧工程不写 theme 时就是它 | blockframe |

挑主题：`node <skill>/scripts/gallery.mjs -o theme-gallery [--screen 录屏.mp4] [--camera 摄像头.mp4]` 出每套主题 × 讲解 / 教程 / 口播 / 竖版的静态样张和总览 `themes.png`。

## 写场景时怎么用

- 同一份场景要能换主题，就别假设外观：`.hl` 在 pop / lab / volt 里是色块，在 aurora / bento 里是渐变字，在 paper 里是记号笔；`.stripe` `.star` 的形状也各不相同；倾斜（`data-rot`）会乘上主题的 `tilt`（pop 1、lab 0.5、其余科技风主题 0）。
- 边框写 `border:var(--bw) solid var(--border)`（细的用 `--bw-s`），标题字体写 `font-family:var(--font-cjk-display)`，线宽和字体才会跟主题走。
- 只用原子类和变量，不写死颜色：底 `var(--ground)`、卡片 `var(--surface)`、文字 `var(--ink)`、边框 `var(--border)`、次要文字 `var(--muted)`、强调 `var(--accent)` / `var(--accent-text)`、高亮 `var(--hl)` / `var(--on-hl)`、记号笔 `var(--mark)`、阴影 `var(--shadow)` / `var(--shadow-s)`、圆角 `var(--radius)` / `var(--radius-s)`、字体 `var(--font-display)` / `var(--font-cjk-display)` / `var(--font-label)` / `var(--font-mono)` / `var(--font-hand)`。
- 旧色名 `var(--pink)` `var(--yellow)` `var(--blue)` `var(--green)` `var(--cream)` `var(--offwhite)` 在每个主题里都映射成合适的浅色 / 深色块，文字照样可读，所以旧场景不改也能换主题（REA 示例就是这样换的）。
- 逐场底色：`video.json` 的 `"ground": {"03": "blue", "08": "invert"}`。命名色（cream / yellow / blue / pink / green / offwhite / white）每个主题都有，lab / night / paper 里是很浅的色调变化，pop 里是糖果色；`"invert"` 反白（lab 墨黑底、aurora 紫蓝渐变、bento 纯黑、volt 整屏荧光绿、night 浅底、paper 黑板、pop 黑底黄阴影）；`"none"` 透明（教程 / 口播的叠加层默认就是）。也可以直接写 `#RRGGBB`。
- 场景里局部反白：给容器加 `class="tone-invert"` 并写 `background:var(--ground)`，里面的变量自动换成反白版（章节卡这样做）。

## 新增一套主题

主题里和主播有关的三样：`theme.json.presenter.stage`（IP 角色的演播背景，要和黑色角色、花字都拉得开）、`captions.bare`（无底板字幕的颜色）、`theme.css` 里的 `--hua`（花字关键词色；演播背景和强调色相同的主题，像 volt，把花字和贴纸改成深色色块）。

复制一套最接近的主题改名（浅色看 `lab` / `bento`，深色看 `aurora` / `volt`）：在 `theme.css` 里改变量（`SCOPE { --ground: …; }`，`SCOPE` 由构建换成图层根节点）和少量覆盖、写一个 `SCOPE.tone-invert { … }`；`theme.json` 写 `grounds`、`named`（至少 cream / yellow / blue / pink / green / offwhite / white）、`captions`（card / dim / spoken / active 四段 CSS）、`presenter`（frame CSS、bw、radius、pipRadius）、`tilt`（倾斜系数，0 = 全部摆正）、`transition`（默认转场）、深色主题加 `mascotFilter`（角色描边光）、`cover`（封面版式，要在 `covers.mjs` 的 LOOKS 里有同名项）。用到新字体时加进 `scripts/lib/fonts.mjs` 的 FONTS（必须是 OFL）。然后跑 `gallery.mjs` 逐张看。
