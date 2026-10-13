# 场景工具包（BlockFrame）

每个场景一个源文件 `build/scenes/sNN.html`（`NN` = 口播稿里的场景编号）：上半是标记，`<!--JS-->` 下半是时间轴代码。`scripts/build.mjs` 把它包成 HyperFrames 子合成，注入 `kit/shared.css`（BlockFrame 原子样式）和 `kit/prelude.js`（工具函数 + 转场）。完整可运行的例子：`examples/rea/scenes/s01.html`–`s08.html`。

## 时间

- `c(t)`：把**旁白绝对时间**换成场景本地时间。所有动效都写 `c(<那句话在 scenes.json 里的 t>)`，画面就和旁白对齐。
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
| `$(sel)` / `R` / `tl` | 场景内查询 / 场景根节点 / 场景时间轴 |

转场在 `video.json.transitions` 里按场景编号配置：`push`（默认）、`vpush`（换话题、进入演示）、`blur`（收尾）。

## BlockFrame 原子（shared.css）

`.ground` `.dots` `.ghost`（背景大字）`.pill`（标签胶囊）`.card` / `.card-s`（4px+8px / 3px+4px 黑边硬阴影）`.chip` `.stripe`（斜纹块）`.star`（星形贴纸）`.h-xl` `.h-lg` `.h-md` `.body` `.label` `.mono` `.tag` `.counter`（页码牌）。颜色变量：`--pink --blue --green --yellow --cream --offwhite`。底色由 `video.json.ground` 或默认五色轮换决定。

## 常用场景型（对应 hyperframes-animation 的 blueprint）

| 场景型 | blueprint / 手法 | 示例 |
|---|---|---|
| 痛点开场 → 标题卡 | kinetic-type-beats + logo-assemble-lockup | s01：App 窗口 → 印章 → 三块倾斜标题 |
| 数据 / 热度 | grid-card-assemble + count-up | s02：时间线 + 三张数据卡 + 热力格子 |
| 原理流程 | 节点 + `draw` 箭头 + `type` 示例请求 | s03 |
| 能力清单 | grid-card-assemble（按旁白节奏逐个弹出） | s04 |
| 真实演示 | record-terminal 回放 + 外侧贴纸 + 结论卡 | s05 |
| 案例 | 并排卡片 + 计数 / 链路 / 小动画 | s06 |
| 上手 CTA | prompt-type-submit-generate | s07 |
| 提醒 + 收尾 | close-frame（黑底白边黄阴影） | s08 |

## 排版规则

- 1920×1080 内边距 60–80px；标题 `h-lg`/`h-md`，中文标题用 `font-family:'Noto Sans SC'`。
- 给 IP 角色留出当前站位（见 `ip.json.zones`）；页码牌放左下。
- 每个场景至少：一个标签胶囊、一个持续动的装饰、两个视觉焦点。
- 正文最小 26px；终端 23px（118 列 × 23 行）。

## 已踩过的坑（必须遵守）

- **倾斜装饰用 `data-rot="-3"`**，不要写 CSS `transform: rotate()`：prelude 会用 GSAP 设置旋转，CSS transform 和补间会冲突（lint `gsap_css_transform_conflict`）。
- SVG 元素的位移写在外层 `<g transform>` 上，动画打在内层元素。
- 同一元素不要写多次 `tl.fromTo`（lint `gsap_repeated_fromto_without_baseline`）；需要第二段动画用 `tl.to`。
- 背景大字 `.ghost` 由构建脚本自动加 `data-layout-ignore`；有意叠在别的文字上的元素（印章、贴纸）加 `data-layout-allow-overlap data-layout-allow-occlusion`。
- 数字卡片字号别超过卡宽：6 位数字在 370px 卡片里用 84px。
- 不要用 `<br>`；需要换行用块级元素。
- 场景内的阶段切换可以把上一阶段元素淡出；但跨场景的退场交给转场，不要单独做出场动画。
- 演示场景的终端内容只能来自 `terminal/ledger.json`；解释、翻译、要点放在终端外的贴纸 / 卡片里。
