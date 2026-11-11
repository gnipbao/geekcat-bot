# 场景工具包

每个场景一个源文件 `build/scenes/sNN.html`（`NN` = 场景编号，和 `narration/scenes.json` 对应）：上半是标记，`<!--JS-->` 下半是时间轴代码。`scripts/build.mjs` 把它包成 HyperFrames 子合成，注入 `kit/base.css` + 当前主题（`themes/<name>/theme.css`）和 `kit/prelude.js`（工具函数 + 转场）。完整可运行的例子：`examples/rea/scenes/`（讲解）、`examples/tutorial-demo/scenes/`（教程叠加层）。

## 时间

- `c(t)`：把**旁白绝对时间**换成场景本地时间。所有动效都写 `c(<那句话在 scenes.json 里的 t>)`，画面就和旁白对齐（素材先行时是剪完以后的时间，见 `narration/transcript.txt`）。
- `T0`：进场转场结束的时刻，第一批入场动画从这里开始。
- `D` / `A`：场景时长 / 场景在全片中的起点（含 0.5 秒转场重叠）。

## 工具函数（prelude.js）

| 函数 | 作用 |
|---|---|
| `enter(sel, t, from, stagger)` | 淡入 + 位移入场（默认从下方 40px） |
| `popIn(sel, t, stagger)` | 回弹缩放出现（贴纸、卡片、芯片） |
| `wipe(sel, t, dur)` | 从左到右擦出 |
| `count(sel, t, to, dur, fmt)` | 数字滚动（自带淡入，滚动前不会露出 0） |
| `type(sel, t, dur)` | 逐字打出 `data-text` |
| `draw(sel, t, dur)` | SVG 描线（自带透明→可见，箭头不会提前悬空） |
| `drift(sel, vars, period)` | 装饰物的有限次往复漂移 |
| `slam(sel, t, stagger)` | 撞字：从大砸下来、落地轻弹（钩子、结论、数字）；自动配低频音效 |
| `strike(sel, t)` / `shake(sel, t)` | 划掉（元素加 `class="strike"`）/ 抖一下：否定、纠错 |
| `out(sel, t)` | 说完就撤（淡出上移） |
| `flash(t)` | 闪白 |
| `$(sel)` / `R` / `tl` | 场景内查询 / 场景根节点 / 场景时间轴 |

音效：教程 / 口播默认开，`build.mjs` 从上面这些函数的调用里自动收集（**时间要写成 `c(秒)` 或 `c(秒) + 0.2` 才认得**），讲解默认关（`"sfx": true` 打开）。

转场在 `video.json.transitions` 里按场景编号配置：`flash`（闪白硬切，换章）、`push`（pop / lab / volt 等的讲解默认）、`fade`（aurora / bento 的讲解默认，也是教程 / 口播叠加层的默认）、`vpush`（换话题、进入演示）、`blur`（收尾；渲染慢，少用）。

## 原子（kit/base.css，外观随主题变）

- 底与装饰：`.ground` `.dots`（主题纹理）`.ghost`（背景大字）`.stripe`（胶带）`.star`（星形贴纸）
- 文字：`.h-xl` `.h-lg` `.h-md` `.body` `.muted` `.label` `.mono` `.em`（强调色）`.hl`（标题里的高亮块；paper 主题是记号笔）
- 容器：`.pill`（标签胶囊）`.counter`（页码牌，开字幕时自动隐藏）`.card` / `.card-s` `.chip` `.tag` `.dot` `.rule` `.code`
- 叠加层（录屏 / 真人上方）：`.hua` > `.ctx` + `.key`（双层花字，`.hua.xl` 是钩子大字，`.hua.center` 居中）`.kw`（关键词贴纸）`.lower-third` > `.lt-name` + `.lt-role`（下三分之一）`.callout` > `.callout-label`（标注框）`.spot`（框外压暗）`.keys` > `.keycap`（按键）`.step` > `b`（步骤条）`.note`（手写批注）`.speed`（加速角标）`.window` > `.window-bar`（录屏窗口）

颜色、线宽、阴影、圆角、字体全部用变量（`var(--ink)` `var(--surface)` `var(--border)` `var(--accent)` `var(--shadow)` …，完整列表见 `themes.md`），不要写死 `#000` / `#fff`。旧色名 `var(--pink)` 等在每个主题里都可用。

## 常用场景型

讲解（全屏，对应 hyperframes-animation 的 blueprint）：

| 场景型 | 手法 | 示例 |
|---|---|---|
| 痛点开场 → 标题卡 | kinetic-type-beats + logo-assemble-lockup | rea s01：App 窗口 → 印章 → 三块倾斜标题 |
| 数据 / 热度 | grid-card-assemble + count-up | rea s02：时间线 + 三张数据卡 + 热力格子 |
| 原理流程 | 节点 + `draw` 箭头 + `type` 示例请求 | rea s03 |
| 能力清单 | grid-card-assemble（按旁白节奏逐个弹出） | rea s04 |
| 真实演示 | record-terminal 回放 + 外侧贴纸 + 结论卡 | rea s05 |
| 案例 | 并排卡片 + 计数 / 链路 / 小动画 | rea s06 |
| 上手 CTA | prompt-type-submit-generate | rea s07 |
| 提醒 + 收尾 | 反白收尾卡（`ground: "invert"`） | rea s08 |

教程 / 口播（透明叠加层）：

| 场景型 | 手法 | 示例 |
|---|---|---|
| 真人开场 | 主讲 `full` + 下三分之一 + 一个关键词贴纸 | tutorial-demo s01 |
| 操作讲解 | 主讲 `pip` + screen.json 推近 / 标注 + 结论贴纸 | tutorial-demo s02 |
| 章节 + 步骤 | 反白章节卡 1.3 秒后淡出 + `.step` 按旁白逐个进场 + `.keycap` | tutorial-demo s03 |
| 结尾号召 | 主讲 `full` + 评论口令 / 关注贴纸 | tutorial-demo s04 |

## 排版规则

- 1920×1080 内边距 60–80px；中文标题用 `font-family: var(--font-cjk-display)`。
- 给主讲留出当前版式的安全区（`presenters.md`）；开字幕时内容留在 y ≤ 950；页码牌放左下。
- 讲解场景至少：一个标签胶囊、一个持续动的装饰、两个视觉焦点。叠加层每次只出一个焦点，说完就撤。
- 正文最小 30px（抖音竖版会再缩小一半）；终端 23px（118 列 × 23 行）。

## 已踩过的坑（必须遵守）

- **倾斜装饰用 `data-rot="-3"`**，不要写 CSS `transform: rotate()`：prelude 会用 GSAP 设置旋转，CSS transform 和补间会冲突（lint `gsap_css_transform_conflict`）。
- **标题里的高亮块写 `<span class="hl">`**（换色：`style="background:var(--yellow)"`），不要自己写带边框的行内 `<span>`：行内元素的背景和边框按字体高度画、不撑开行高，两行标题时会盖住上一行，单行时会压到下面的元素。
- 色块里的强调（`.kw .em`、`.hl .em`）自动变成下划线：同色字会看不见。
- 局部反白：给容器加 `class="tone-invert"` 并写 `background:var(--ground)`（章节卡这样做）；不要自己写死反白的颜色，每个主题的反白都不一样（lab 墨黑、aurora 渐变、bento 纯黑、volt 荧光绿）。
- 不要写按行内样式匹配的选择器（`[style*=…]`）：HyperFrames lint 会报错。
- SVG 颜色写在 `style`（`style="stroke:var(--ink)"`）里才能跟主题变，写成属性 `stroke="#000"` 不会变。
- SVG 元素的位移写在外层 `<g transform>` 上，动画打在内层元素。
- 同一元素不要写多次 `tl.fromTo`（lint `gsap_repeated_fromto_without_baseline`）；需要第二段动画用 `tl.to`。
- 背景大字 `.ghost` 由构建脚本自动加 `data-layout-ignore`；有意叠在别的文字上的元素（印章、贴纸）加 `data-layout-allow-overlap data-layout-allow-occlusion`。
- 数字卡片字号别超过卡宽：6 位数字在 370px 卡片里用 84px。
- 不要用 `<br>`；需要换行用块级元素。
- 场景内的阶段切换可以把上一阶段元素淡出；但跨场景的退场交给转场，不要单独做出场动画。
- 演示场景的终端内容只能来自 `terminal/ledger.json`；录屏只能来自用户素材；解释、翻译、要点放在外面的贴纸 / 卡片里。
