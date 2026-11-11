---
workflow: general-video
flow: automation
storyboard: no
message: "REA 让 AI 智能体能逆向任何软件，结论、证据和边界一起交回来"
destination: youtube
aspect: "16:9"
language: zh-CN
audience: 中文开发者
length: "≈4 min (241.8s, driven by narration)"
angle: concept + hands-on demo
design: blockframe
voice: doubao seed-tts-2.0 · zh_male_m191_uranus_bigtts
fps: 60
---

## Intent

小木头 / 01Coder 风格的工具介绍：开场痛点 → 热度 → 它是什么 → 能分析什么 → 实测 → 官方案例 → 上手 → 提醒。
主讲人是 IP 角色「知识猫」（自称"知识猫"），全片以原生 HyperFrames 图层出现，嘴型由旁白音量驱动，位置按内容决定。

## Assets

- 旁白：`narration/narration.txt` → 豆包 TTS 男声 → `narration/narration-full.mp3` + `narration.srt`（40 句，逐句精确对齐）
- 真实终端演示：`terminal/capture.json`（PTY 原始捕获）→ `terminal/ledger.json`（回放账本）
- 知识猫：`mascot/script.json` → `node ../../render/render.mjs hyperframes` → `compositions/mascot.html`
- 字体：Noto Sans SC 400/700/900、Space Grotesk（OFL，本地 @font-face）；Inter、JetBrains Mono 为 HyperFrames 内置

## Customizations

- 设计：BlockFrame（4px 黑边 + 8px 硬阴影、五色糖果底逐场轮换、倾斜装饰、标签胶囊）
- 字幕不烧进成片（YouTube 上字幕），底部留安全区
- 转场：push（主）、vertical push（进入实测）、blur crossfade（进入结尾）

## Notes

- 用户只要成片（封面 / 文案 / 博客 / 推文本次不做）。
- 用户要求"成片先给我"，因此未做 Studio 预览暂停；构建中用 snapshot 抽帧自检。
