---
name: creator-studio
description: AI 博主的视频工作室：把一个技术主题做成讲解视频、录屏教程或口播视频，主讲可以是 IP 角色（知识猫墨墨）、摄像头真人、数字人或纯配音，七套主题（lab 实验室 / aurora 极光 / bento 便当格 / volt 电光 / night 夜间终端 / paper 手账 / pop 糖果），一次出 B站 / YouTube / 抖音 / X 各平台版本（横版烧字幕、横版不烧字幕 + SRT、竖版）和封面，用 FrameVelo 渲染（HyperFrames 兜底）。流程：调研 → 口播稿 → 豆包配音 或 录屏 / 摄像头素材导入（转写、对齐、粗剪）→ HyperFrames 场景和叠加层 → 主讲图层 → 渲染 → 封面。用户说"做一期 XX 的视频""让知识猫讲讲 XX""把这段录屏做成教程""给我的录屏加包装""出抖音竖版""按上次 REA 那期的方式做一个""用我的 IP / 真人 / 数字人讲"时使用。
---

# creator-studio · 知识猫视频工作室

一期视频 = **形式 × 主讲 × 主题 × 平台**，四项独立选择，流程固定：

| 选项 | 取值 | 写在哪 |
|---|---|---|
| 形式 `format` | `explainer` 讲解（全屏动效场景，稿子先行）· `tutorial` 教程（录屏是主画面）· `talk` 口播（人像是主画面） | `video.json` |
| 主讲 `presenter` | `mascot` IP 角色（默认墨墨；`display: stage` 像真人主播一样装在画框里，`overlay` 站在场景上自由走位）· `camera` 摄像头真人 · `avatar` 数字人视频 · `none` 纯配音 | `presenter.json`（旧工程的 `ip.json` = mascot） |
| 主题 `theme` | `lab` 实验室（品牌默认）· `aurora` 极光（深色科技）· `bento` 便当格（浅色苹果风）· `volt` 电光（黑绿网感）· `night` 夜间终端（教程默认）· `paper` 手账 · `pop` 糖果（原 BlockFrame，旧工程默认） | `video.json` |
| 平台 `platforms` | `bilibili` / `x` → 横版烧字幕 · `youtube` → 横版不烧字幕 + SRT · `douyin` / `shorts` / `channels` → 竖版 | `video.json` |

怎么选：`references/formats.md`（形式和场景型）、`references/presenters.md`（主讲、版式轨道、数字人接入）、`references/themes.md`（主题，`scripts/gallery.mjs` 出对比图）、`references/platforms.md`（平台规格、安全区）。

完整样例：`examples/rea/`（讲解 · 墨墨 · pop，4 分钟 8 场景，含真实终端演示）、`examples/tutorial-demo/`（教程 · 摄像头 · night，录屏推近 + 标注 + 小窗 / 侧栏 / 全屏切换）、`examples/talk-demo/`（口播 · 墨墨当主播 · volt，钩子花字 + 句首跳推 + 无底板字幕 + 自动音效，后半段配录屏）。新做一期先挑最接近的样例当参照。

## 依赖

Node 22.18+、Python 3、ffmpeg、jq；HyperFrames（`npx hyperframes doctor`）；**FrameVelo**（`framevelo doctor`，没装就自动回退 HyperFrames 渲染）；素材先行要 `whisper-cli` + 模型（推荐 `~/models/ggml-large-v3-turbo-q5_0.bin`）；IP 角色仓库（知识猫：本仓库，skill 放在 `skills/` 下时自动定位，否则设 `GEEKCAT_REPO`）；配音 `DOUBAO_TTS_TOKEN`（只用环境变量，**不要写进任何文件**）。

本 skill 只负责编排。写场景 HTML 前必须读 `/hyperframes-core`（合成契约），动效读 `/hyperframes-animation`，终端演示读 `/record-terminal`。

## 开局要确认的（缺什么问什么，用户说"你定"就用默认）

主题与素材来源 · 形式 · 主讲（默认墨墨）· 主题（讲解默认 lab、教程默认 night）· 平台（默认 B站 + YouTube + 抖音）· 声音（稿子先行时：默认渊博小叔，有克隆声音用 `S_` ID）· 时长 · 交付范围（成片 / 封面）。

## 流程

```bash
SK=~/.agents/skills/creator-studio
bash $SK/scripts/new.sh <videos-dir> <slug> --format tutorial --presenter camera --theme night --platforms bilibili,youtube,douyin
```
建工程：HyperFrames 骨架 + 字体（OFL，本机缓存只下一次）+ `video.json` / `cover.json` / `presenter.json` 模板。

**1. 时间轴**（两条路，产物是同一套文件：`narration/narration-full.mp3` + `words.json` + `scenes.json` + `captions.json`）

- **稿子先行**（讲解；事后配音的教程）：调研 → 口播稿 `narration/narration.txt`（`# NN 标题` 分场景，写法见 `references/voice.md`，所有数字要有来源）→
  ```bash
  DOUBAO_TTS_TOKEN=... python3 $SK/scripts/tts.py narration/narration.txt narration/ --voice <音色或 S_ID>
  python3 $SK/scripts/tighten.py .          # 口播 / 教程：把停顿压紧（只剪真静音，故意留的长停顿不动），更像博主说话
  python3 $SK/scripts/captions.py .
  ```
- **素材先行**（录屏 + 摄像头、录屏 + 现场配音、口播原片）：
  ```bash
  python3 $SK/scripts/ingest.py . --screen 录屏.mov --camera 摄像头.mp4 [--script 稿子.txt]
  ```
  自动：多轨按声音对齐 → whisper 转写 → 套稿子 → 删重说 / 语气词 → 压停顿 → 长时间不说话的录屏段加速 → 人声 -16 LUFS → 人脸框 → 字幕。读 `narration/transcript.txt` 校对：要删的写进 `cuts.json` 再跑一遍（转写有缓存，几秒钟）。没稿子时场景按停顿自动切，改 `narration/scenes.json` 的标题。细节见 `references/footage.md`。

**2. 画面**
- 场景 `build/scenes/sNN.html`（每个场景一个文件，场景型和原子见 `references/scene-kit.md`）。讲解：全屏场景；教程 / 口播：透明叠加层（关键词贴纸、下三分之一、步骤条、按键、章节卡），默认淡入淡出。所有动效时间写 `c(<旁白时间>)`。
- 录屏（教程）：`screen.json` 写 focus 推近和标注（录屏原始像素坐标，先抽帧看坐标），见 `references/footage.md`。
- 先让 `node $SK/scripts/direct.mjs .` 起一版：IP 角色按句子语气自动表演（`mascot/script.json`），口播自动排句首跳推、教程自动排全屏 / 小窗（`presenter/track.json`），再人工微调。
- 口播感的规矩（`references/formats.md`「口播节奏」）：前 3 秒给钩子大字、每 2–4 秒一个视觉节拍、花字卡在关键词起音、同一手段不连用三次。
- 主讲：`presenter/track.json` 写版式轨道（`full` / `side` / `pip` / `off`，可带 `zoom` 跳推、`shift` 挪位、`rect` 任意位置），场景内容避开当前版式的安全区；overlay 模式的 mascot 写角色剧本 `mascot/script.json`（`node $SK/scripts/ip.mjs info` 看 schema），再生成图层（stage 模式由 build 自动生成，不用这一步）：
  ```bash
  node $SK/scripts/ip.mjs validate --script mascot/script.json
  node $SK/scripts/ip.mjs layer --script mascot/script.json --out compositions/mascot.html
  ```

**3. 构建与自检**
```bash
node $SK/scripts/build.mjs .        # → index.html + compositions/（主版本）+ variants/clean、variants/vertical（按 platforms）
npx hyperframes lint && npx hyperframes check            # 主版本，必须 0 error
(cd variants/vertical && npx hyperframes check)          # 竖版也要过
npx hyperframes snapshot --no-end --at <每个场景 2–3 个关键时刻>   # 打开看：文字出画、遮挡、主讲挡内容、安全区
```
有问题改源文件（场景、`screen.json`、`track.json`、`video.json`）后重新 `build.mjs`，不要手改 `compositions/` 和 `variants/`。

**4. 渲染**（FrameVelo 优先，失败自动回退 HyperFrames；每个平台一个文件）
```bash
node $SK/scripts/render.mjs . --platform bilibili --preview 30,6    # 先出 6 秒看效果
node $SK/scripts/render.mjs . --platform bilibili,youtube,douyin,x --fps 60
```
输出 `renders/<slug>-<平台>.mp4`（YouTube 另有 `.srt`），自带成片检查：时长、有声、响度、首中尾三帧（`renders/*.check/`），打开三帧看一眼。帧率：角色动作多或录屏推近多用 60，纯图文 30。详见 `references/render.md`。

**5. 封面**：改 `cover.json`，`node $SK/scripts/covers.mjs .` → 五比例 + YouTube 缩略图，版式跟主题走，人物用墨墨定格 / 摄像头抽帧 / 品牌照片，见 `references/covers.md`。

**换声音 / 重新配音（稿子先行，不改场景）**：旧旁白挪到 `narration/v1/`，重跑 `tts.py`，`python3 $SK/scripts/retime.py . --old-srt narration/v1/narration.srt`（场景 `c()`、角色剧本、终端计划一起搬到新时间轴），再跑 `captions.py`、角色 `layer`、`build.mjs`。retime 要求场景时间都写成 `c(<秒>)`。

## 交付

各平台成片路径、时长、帧率、渲染引擎；封面路径（每个平台用哪张，见 `references/platforms.md`）；YouTube 的 SRT；STORYBOARD.md（每个场景的时间、画面、主讲版式、旁白）；如实说明没做的部分（例如 4K、需要用户审听的读音、转写模型是 small 时可能的错字）。

## 不要做

- 不要把 token 写进文件或提交；不要把用户的录屏、摄像头素材、配音、品牌照片、Canva 等第三方素材提交到公开仓库（`videos/` 已在 `.gitignore`）。
- 不要编造数字或案例；终端画面只能来自真实捕获，录屏只能来自用户素材。
- 不要在场景里画第二个吉祥物；主讲只通过 `presenter.json` / `ip.json` 接入。
- 数字人：只用用户本人授权的形象和声音。
