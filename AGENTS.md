# AGENTS.md · 知识猫 GeekCat

本文件是给 AI agent（Codex、Claude Code、Gemini CLI、Cursor 等）的操作手册。`CLAUDE.md` 和 `GEMINI.md` 都指向这里。

## 这个仓库是什么

一个代码绘制的猫咪角色「墨墨」，用来给视频加陪伴角色：讲解、吐槽、举牌、角落探头。
你写一份**剧本 JSON**（第几秒做什么动作、用什么场景、牌子上写什么字），命令行把它渲染成**透明背景视频**，再叠到用户的主视频上。

- 每一帧都是时间的纯函数：同一份剧本，在任何机器上渲染结果逐像素一致。
- 渲染不依赖浏览器、GPU 或系统字体：用 resvg 光栅化，中文字体随仓库附带（`render/fonts/`，Noto Sans SC，OFL 协议）。
- ffmpeg：优先用系统里的；没有就自动用 npm 装的 `ffmpeg-static`；也可以用环境变量 `FFMPEG=/path/to/ffmpeg` 指定。

## 安装和自检

```bash
npm install          # Node 18+；会同时装 resvg 和 ffmpeg-static
npm test             # 7 项测试：所有动作/场景/配饰可渲染、纯函数、切换不跳帧
```

没有网络时：`@resvg/resvg-js` 是必需的；`ffmpeg-static` 是可选的，系统里有 ffmpeg 就行。

## 命令

全部在仓库根目录执行，每条命令的最后一行都是一行 JSON（`{"ok":true,...}`），出错时退出码为 1，错误信息以 `✗` 开头并列出可用值。

| 命令 | 作用 |
|---|---|
| `node render/render.mjs list` | 动作 / 场景 / 配饰目录（含中文名和用途）。**写剧本前先跑这个，不要凭记忆写 id** |
| `node render/render.mjs schema` | 剧本的 JSON Schema（也提交在 `render/script.schema.json`） |
| `node render/render.mjs draft subs.srt -o work/script.json [--video main.mp4] [--corner] [--side left] [--accessories glasses] [--audio voice.wav]` | 按字幕自动生成剧本草稿 |
| `node render/render.mjs validate work/script.json` | 只校验，不渲染 |
| `node render/render.mjs still work/script.json --at 1,3.5,6 -o work/shots` | 渲染关键帧 PNG，供你目视检查 |
| `node render/render.mjs render work/script.json -o work/overlay.mov` | 渲染透明叠加层（多核并行） |
| `node render/render.mjs composite --video main.mp4 --overlay work/overlay.mov -o final.mp4 [--start 0]` | 叠到主视频上，出成片（音轨保留） |
| `node render/render.mjs auto --video main.mp4 --srt subs.srt -o final.mp4 [--corner]` | 一条命令：草稿 → 抽帧 → 渲染 → 合成。中间文件在 `final.geekcat/` |
| `node render/render.mjs live [--port 5199]` | 直播 / OBS 模式，见文末 |

`render` 的输出格式由扩展名决定：

| 扩展名 | 说明 | 适合 |
|---|---|---|
| `.mov` | ProRes 4444，带透明（首选） | Premiere / Final Cut / 达芬奇 / 剪映专业版 / `composite` |
| `.webm` | VP9，带透明 | 网页、OBS |
| `.mp4` | H.264，透明背景自动换成绿幕 #00B140 | 剪映 / CapCut 手机版（色度抠图） |
| `.gif` | 动图 | 文档、聊天 |
| 目录 | PNG 序列，带透明 | After Effects |

其他选项：`--fps 30`（加快）、`--from 2 --to 5`（只渲染一段）、`--threads N`、`--with-audio`（把 lipsync 配音混进去）。

## 标准流程：给一段视频加上知识猫

用户通常会说"给这个视频加个猫""让墨墨在角落吐槽""做个猫举牌的片头"。照下面做：

1. **拿到时间轴。** 需要每句话的开始时间。
   - 用户给了 SRT / VTT：直接用。
   - 视频里内嵌字幕：`ffmpeg -i main.mp4 -map 0:s:0 work/subs.srt`
   - 只有视频：用你能用的转写工具（whisper 等）生成 SRT；都没有就问用户要字幕或口播稿。
   - 只是做片头 / 短片段、没有口播：跳过，直接手写剧本。
2. **生成草稿。** `node render/render.mjs draft work/subs.srt -o work/script.json --video main.mp4`
   - `--video` 让剧本尺寸和帧率跟主视频一致。
   - 主体内容占满画面（录屏、讲解 PPT）时加 `--corner`，猫只在右下角探头，不挡内容。
   - 猫放画面左边：`--side left`（会自动镜像，让猫看向画面中间）。
3. **改剧本。** 草稿是关键词规则生成的，你要通读并按语义修正（见下方"编排指南"）。规则：
   - 动作切换放在句子开始前约 0.2 秒；两次切换间隔 ≥ 0.6 秒；进出大姿势间隔 ≥ 1 秒。
   - 牌子上只放关键词（≤ 3 行 × 7 个字），气泡每行约 9 个字、最多 4 行。
   - 最后一条用 `exit` 或 `idle`。
4. **校验。** `node render/render.mjs validate work/script.json`，按报错修改。
5. **抽帧检查。** `node render/render.mjs still work/script.json --at <每次切换后 0.6 秒> -o work/shots`，然后**打开这些 PNG 看**：
   - 猫有没有挡住画面主体？主体在中间时猫放 `x ≥ 0.8` 或 `x ≤ 0.2`。
   - 牌子 / 气泡的字是否完整、有没有出画？
   - 想看叠加效果，可以先渲染 2 秒：`render ... --to 2 -o work/test.mov` 再 `composite`，然后从成片里抽帧：`ffmpeg -ss 1 -i final.mp4 -frames:v 1 work/check.png`
6. **渲染 + 合成。**
   ```bash
   node render/render.mjs render work/script.json -o work/overlay.mov
   node render/render.mjs composite --video main.mp4 --overlay work/overlay.mov -o out/final.mp4
   ```
7. **交付。** 告诉用户：成片路径、透明叠加层路径（方便他在剪辑软件里继续调）、时长；如果他要自己剪，说明叠加层放在主视频上方轨道、从 0 秒开始。

赶时间或用户只要"先出一版看看"：`node render/render.mjs auto --video main.mp4 --srt subs.srt -o out/final.mp4 --corner`，然后照第 5 步检查 `out/final.geekcat/shots/` 里的截图，有问题改 `out/final.geekcat/script.json` 再执行第 6 步。

## 剧本格式

完整定义见 `render/script.schema.json`。最小例子：

```json
{
  "$schema": "./script.schema.json",
  "width": 1920, "height": 1080, "fps": 60,
  "background": "transparent",
  "cat": { "x": 0.85, "y": 0.97, "scale": 0.6, "flip": false },
  "accessories": ["glasses"],
  "lipsync": "voice.wav",
  "timeline": [
    { "at": 0,   "do": "enter" },
    { "at": 1.0, "do": "talk", "scene": "sign", "text": "今天讲 3 件事" },
    { "at": 4.2, "do": "surprised", "scene": null },
    { "at": 6.0, "do": "idle", "scene": ["peek", "bubble"], "text": "这里有坑！" },
    { "at": 9.0, "do": "exit" }
  ],
  "duration": 9.6
}
```

- `at`：秒。`do`：动作 id；不写 = 保持当前动作，只换场景 / 配饰。
- `scene`、`accessories`、`text` 是**粘性**的：不写就沿用上一条。`"scene": null`、`"accessories": []` 用来清空。
- `scene` 可以是数组（场景叠加）。**大姿势**（`list` 里 `big: true`）一次只能一个，可以叠加 `bubble` / `sign` 和配饰。
- `text` 只对 `sign`、`bubble` 生效；两个都有时写 `{"sign": "…", "bubble": "…"}`；`\n` 换行。
- `cat.x / cat.y`：猫落地点（底部中心）在画面中的比例位置。角落探头用 `y: 1.0`。`scale`：猫高占画面高的比例，常用 0.5–0.75。
- `cat.flip`：猫默认朝画面左侧看；放在画面左边时设 `true`。
- `lipsync`：配音文件（相对剧本路径），嘴型由音量驱动，提前 40ms。
- `background`：`transparent`（默认）、`green`、`dots`（品牌点阵）、`#RRGGBB`。

## 编排指南

动作（17 个）：`idle` 待机 · `look` 张望 · `talk` 说话 · `happy` 开心 · `surprised` 吓一跳 · `scared` 炸毛 · `curious` 好奇 · `think` 思考 · `sleep` 睡觉 · `wave` 挥手 · `cheer` 欢呼 · `nod` 点头 · `shake` 摇头 · `wink` 眨眼 · `jump` 跳跃 · `enter` 登场 · `exit` 退场

场景（13 个）：`sign` 举牌 · `bubble` 对话气泡 · `point` 指示 · `laptop` 敲电脑 · `book` 看书 · `fishing` 逗小鱼 · `peek` 角落探头；大姿势：`write` 写字 · `scroll` 趴卷轴 · `ring` 游泳圈 · `cabinet` 文件柜探头 · `money` 钱堆打滚 · `spider` 被蜘蛛吓到

配饰（7 件，同时最多 2 件）：`glasses` 圆眼镜 · `cap` 学士帽 · `headphones` 耳机 · `bowtie` 领结 · `bell` 铃铛项圈 · `fish` 叼小鱼 · `blush` 腮红

| 口播内容 | 写法 |
|---|---|
| 开场 | `enter`，0.9 秒后 `wave` + `bubble`「大家好」 |
| 正在讲解 | `talk`，可叠加 `point`（指向画面另一侧）或 `sign`（关键词） |
| 抛出问题 | `curious`（自带「?」），短问题配 `bubble` |
| 反常识结论 | `surprised`（0.8 秒），之后回到 `talk` |
| 恍然大悟 | `think`：5 秒循环，3.2 秒时亮灯泡，把 `at` 设成结论句开始前 3.2 秒 |
| 风险 / 报错 / 踩坑 | `scared`；bug 用大姿势 `spider` 接 `scared` |
| 肯定 / 否定 | `nod` / `shake` |
| 小技巧 | `wink` |
| 好消息 / 完成 | `cheer`、`happy`、`jump` |
| 技术 / 代码 | `laptop`，可加 `headphones` |
| 知识点 | `book`，可加 `cap` |
| 总结 / 记笔记 | `write` |
| 钱 / 预算 | `money` |
| 查资料 / 归档 | `cabinet` |
| 无聊 / 等待 | `scroll` + `sleep` |
| 摸鱼 / 下班 | `ring` |
| 片尾 | `wave` + `bubble`「下期见」，最后 `exit` |

角落模式（`peek`）只露出头，所以道具场景会被底边挡住：这时用动作 + `bubble` 表达，不要用 `laptop` / `sign` / 大姿势。

## 常见问题

| 现象 | 处理 |
|---|---|
| `✗ 未知动作 "xxx"` | 用 `list` 里的 id |
| `✗ 同时用了多个大姿势场景` | 一条里只留一个大姿势 |
| `✗ 写了 text，但当前没有带文字的场景` | 同一条加上 `"scene": "sign"` 或 `"bubble"` |
| `✗ 找不到 ffmpeg` | `npm install`（装 ffmpeg-static），或系统安装 ffmpeg，或设 `FFMPEG` |
| 中文显示成方块 | 确认 `render/fonts/NotoSansSC-Bold.otf` 存在（仓库自带）；也可 `--font-dir 目录` 指定其他字体 |
| 渲染太慢 | `--fps 30`、`--threads N`；1080p 60fps 约 30–50 毫秒一帧（多核） |
| 猫挡住了主体 | 调 `cat.x`、`cat.scale`，或改用 `--corner` |

## 不要做的事

- 不要改 `prototype/cat-engine.js` 里的造型数字（锚点、眼睛位置），那是从原图测量来的；要改造型先读 `README.md` 的"造型校准"。
- 不要在 `prototype` 里引入构建工具或框架：引擎必须同时能被浏览器 `<script>` 和 Node `require` 加载。
- 不要提交 `render/out/`、`work/`、用户的视频和参考图（`.gitignore` 已排除）。
- 改了引擎或绘制后，必须跑 `npm test`；新增动作 / 场景后再跑 `npm run schema` 更新 schema。

## 直播 / OBS

```bash
node render/render.mjs live --port 5199
```

- OBS 添加「浏览器」源：`http://localhost:5199/?x=0.85&y=0.97&scale=0.6&clean=1`，宽 1920 高 1080，背景透明。
- 遥控：`curl -X POST localhost:5199/play -d '{"do":"talk","scene":["peek","bubble"],"text":"这里有坑！"}'`
- 也可以在页面上按快捷键（按 H 显示说明）。`GET /state` 查看当前状态，`GET /catalog` 获取目录。

## 仓库结构

```
prototype/cat-engine.js   引擎：骨骼、动作、场景、配饰 → frameAt(schedule, t)；浏览器和 Node 共用
prototype/cat-svg.js      帧 → SVG 字符串；预览、直播、离线导出共用
prototype/index.html      方案文档 + 可交互舞台（npm run preview）
prototype/live.html       直播 / OBS 页面
render/render.mjs         CLI
render/script.schema.json 剧本 JSON Schema
render/examples/          示例剧本和字幕
render/fonts/             随仓库附带的中文字体（OFL）
render/test/              测试
.claude/skills/geekcat-video/SKILL.md   Claude Code 技能入口
```
