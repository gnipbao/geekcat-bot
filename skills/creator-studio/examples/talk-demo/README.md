# 口播样例：墨墨当主播（volt 主题）

34 秒：钩子大字 → 自我介绍 → 双层花字卡点 → "它叫 REA"撞字 → 闪白换章 → 小窗 + 录屏 → 侧栏 + 步骤条。演示的是：

- IP 角色的 `stage` 出场方式：像真人主播一样全屏 / 小窗 / 侧栏，句首跳推（`presenter/track.json` 的 `zoom` + `cut`），`shift` 靠右给花字让位。
- 深色主题也不吞猫：角色站在主题的亮色演播背景里。
- 口播节奏：2–4 秒一个节拍，花字卡在关键词起音，自动音效（看 `index.html` 里的 `sfx-*`）。
- 和录屏搭配：同一条时间轴上，主播缩成小窗，录屏窗口自动让位、按 `screen.json` 推近。

旁白音频和录屏不在仓库里。用自己的素材跑：`new.sh … --format talk --presenter mascot --theme volt` 建工程 → `tts.py` 配音 → `tighten.py` → `captions.py . --max 14` → `direct.mjs` 起表演和跳推 → 参考 `scenes/` 写叠加层 → `build.mjs` → `render.mjs`。
