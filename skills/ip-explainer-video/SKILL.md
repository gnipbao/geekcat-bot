---
name: ip-explainer-video
description: 用一个 IP 角色当主讲人，把一个技术主题（开源项目、工具、概念）做成 BlockFrame 风格的中文讲解视频：调研 → 口播稿 → 豆包 2.0 整段配音（支持克隆声音）→ HyperFrames 逐场景搭画面（可含真实终端演示）→ IP 角色作为原生图层全程出场、口型跟旁白 → 渲染 → 五比例封面。主题和 IP 角色都可替换（默认知识猫）。用户说"做一期 XX 的介绍视频""让知识猫讲讲 XX""用我的 IP 角色做个讲解视频""按上次 REA 那期的方式做一个"时使用。
---

# IP 主讲科技讲解视频

一期视频 = 一个主题 + 一个 IP 角色 + 一个声音。流程固定，三者都可替换：

| 可替换 | 在哪里换 | 默认 |
|---|---|---|
| 主题 | 口播稿 `narration/narration.txt` + 场景 `build/scenes/` | — |
| IP 角色 | 工程根目录 `ip.json`（约定见 `references/ip-contract.md`） | 知识猫（`templates/ip/geekcat.ip.json`） |
| 声音 | `tts.py --voice`（官方音色或 `S_` 开头的克隆声音） | 渊博小叔 `zh_male_yuanboxiaoshu_uranus_bigtts` |
| 设计 | `video.json` / `kit/` | BlockFrame |

完整样例：`examples/rea/`（REA 介绍，4 分钟，8 个场景，含真实终端演示）。新做一期时把它当参照，不要从零想结构。

## 依赖

HyperFrames（`npx hyperframes doctor`）、Node 18+、Python 3、ffmpeg、jq；IP 角色仓库（知识猫：`github.com/gnipbao/geekcat-bot`，`npm install`；skill 放在该仓库的 `skills/` 下时自动定位，否则设置 `GEEKCAT_REPO`）；`DOUBAO_TTS_TOKEN`（只用环境变量传入，**不要写进任何文件**）。

本 skill 只负责编排。写场景 HTML 前必须读 `/hyperframes-core`（合成契约），动效读 `/hyperframes-animation`，设计读 `/hyperframes-creative` 的 `house-style.md` 和 `video-composition.md`，终端演示读 `/record-terminal`。设计规范 BlockFrame：`/hyperframes-creative` skill 目录下的 `frame-presets/blockframe/FRAME.md`。

## 开局要确认的（缺什么问什么，用户说"你定"就用默认）

主题与素材来源 · IP 角色（默认知识猫）· 声音（默认渊博小叔；用户有克隆声音就用 `S_` ID）· 时长（默认按内容 3–5 分钟）· 交付范围（成片 / 封面）· 是否需要真实演示。

## 流程

```bash
SK=~/.agents/skills/ip-explainer-video
bash $SK/scripts/init-project.sh <videos-dir> <slug> [ip.json]      # 1. 建工程：hyperframes init + 字体 + 配置模板 + ip.json
```

**2. 调研。** 读主题的一手资料（README、官方文档、`gh api` 拿星数 / 版本 / 日期等事实）。所有写进视频的数字都要有来源；拿不到权威数字就不写。

**3. 口播稿** `narration/narration.txt`。
- 结构参照样例：痛点开场 → 热度 → 它是什么 → 能做什么 → 实测 → 案例 → 上手 → 提醒收尾。每段 `# NN 标题` 开头。
- 主讲人是 IP 角色，第一人称，**自称只用 `ip.json.selfName`**；口吻按 `persona`。
- 写法规矩见 `references/voice.md`（口语短句、念得出来的数字和命令、多音字扫描）。
- 中文约每分钟 270–300 字。

**4. 配音。**
```bash
DOUBAO_TTS_TOKEN=... python3 $SK/scripts/tts.py narration/narration.txt narration/ --voice <音色或 S_ID> [--style "<语气>"]
```
产出 `narration-full.mp3` / `narration.srt` / `words.json` / `scenes.json`（场景起止 + 每句时间）。之后所有时间都以 `scenes.json` 为准。

**5. 真实演示（可选）。** 写 `terminal/runbook.json`（模板 `templates/project/runbook.json`）：命令在哪里跑、提示符显示什么（不要露出真实用户名和路径）、每条命令贴着哪句旁白（`plan`）。
```bash
python3 $SK/scripts/pty_capture.py terminal/runbook.json terminal/capture.json     # 真实执行并捕获
python3 $SK/scripts/terminal_ledger.py terminal/runbook.json terminal/capture.json terminal/ledger.json
```
演示目标优先选安全、可控、和主题有关的东西（样例里是让 REA 分析知识猫自己的代码）。

**6. 场景** `build/scenes/sNN.html`。每个口播场景一个文件，工具函数、场景型和必须遵守的坑见 `references/scene-kit.md`；从 `examples/rea/scenes/` 里挑最接近的场景型改。所有动效时间写成 `c(<旁白时间>)`。

**7. IP 角色剧本** `mascot/script.json`：按角色的 schema 写（知识猫：`node $SK/scripts/ip.mjs info` 里的 `scriptSchema` / `guide`）。动作切在句首前 0.2 秒；站位按内容在 `zones` 之间移动；`lipsync` 指向旁白。
```bash
node $SK/scripts/ip.mjs validate --script mascot/script.json
node $SK/scripts/ip.mjs layer --script mascot/script.json --out compositions/mascot.html
```

**底部字幕（国内平台需要）。** `python3 $SK/scripts/captions.py .` → `narration/captions.json`（每屏 ≤ 18 字，逐字时间）+ `captions.srt`（YouTube CC 用）。之后 `build.mjs` 会自动加上 BlockFrame 卡拉 OK 字幕图层（正在念的字黄色色块），并隐藏页码牌；场景内容要留在 y ≤ 950。YouTube 发不烧字幕的版本：`video.json` 写 `"captions": false` 再构建一次，上传 `captions.srt`。

**8. 构建与自检。**
```bash
node $SK/scripts/build.mjs .                 # → compositions/sNN.html + index.html（场景、IP 图层、旁白音轨）
npx hyperframes lint
npx hyperframes snapshot --no-end --at <每个场景 2–3 个关键时刻>   # 打开 contact-sheet 看：文字出画、遮挡、IP 挡内容、数字溢出
npx hyperframes check                         # 必须通过（0 error）
```
发现问题改场景源文件后重新 `build.mjs`，不要手改 `compositions/`。

**9. 渲染。** 帧率：IP 角色有大量连续动作时用 60fps（更丝滑，渲染时间翻倍），纯图文可用 30fps，告诉用户选择和理由。
```bash
npx hyperframes@latest upgrade --project . --check   # 版本落后就升级并重跑 check
npx hyperframes render --fps 60 --quality high --resolution landscape -o renders/<slug>-1080p60.mp4
```
用户要预览就先 `npx hyperframes preview --background`；用户说"成片先给我"就直接渲染。渲染后从 MP4 抽帧检查 + `ffmpeg -af volumedetect` 确认有声。4K：`--resolution landscape-4k`（时间约 3–4 倍）。

**换声音 / 重新配音（不改场景）。** 换完声音记得重跑 `captions.py`。 口播文字不变、只换音色或语气时，不需要重写场景：
```bash
mkdir -p narration/v1 && mv narration/narration-full.mp3 narration/narration.srt narration/scenes.json narration/v1/
DOUBAO_TTS_TOKEN=... python3 $SK/scripts/tts.py narration/narration.txt narration/ --voice <新音色或 S_ID>
python3 $SK/scripts/retime.py . --old-srt narration/v1/narration.srt      # 场景 c()、角色剧本、终端计划全部搬到新时间轴
python3 $SK/scripts/terminal_ledger.py terminal/runbook.json terminal/capture.json terminal/ledger.json   # 有演示时
node $SK/scripts/ip.mjs layer --script mascot/script.json --out compositions/mascot.html && node $SK/scripts/build.mjs .
```
retime 要求场景里所有时间都写成 `c(<秒>)`（包括第 1 场）。

**10. 封面。** 改 `cover.json`，`node $SK/scripts/covers.mjs .` → 五比例 PNG。规则见 `references/covers.md`。

## 交付

成片路径、时长、帧率；封面路径；STORYBOARD.md（每个场景的时间、画面、IP 动作、旁白）；如实说明没做的部分（例如 4K、需要用户审听的读音）。

## 不要做

- 不要把 token 写进文件或提交；不要把用户的视频素材、配音、Canva 等第三方素材提交到公开仓库。
- 不要编造数字或案例；终端画面只能来自真实捕获。
- 不要在场景里画第二个吉祥物；IP 角色只通过 `ip.json` 接入。
