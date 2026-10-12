---
name: geekcat-video
description: 让知识猫「墨墨」(GeekCat) 作为陪伴角色出现在视频里：根据口播稿 / 字幕时间戳写剧本 JSON，渲染成透明背景的 .mov / .webm 叠加素材，或直接合成进主视频。用户提到 知识猫、墨墨、GeekCat、猫咪角色、让猫在角落吐槽、加个猫举牌、猫咪陪看 等时使用。
---

# 知识猫视频素材

完整手册在仓库根目录的 `AGENTS.md`，先读它。这里是最短路径：

```bash
npm install                                                   # 第一次
node render/render.mjs list                                   # 查动作 / 场景 / 配饰 id
node render/render.mjs draft subs.srt -o work/script.json --video main.mp4 [--corner]
#   → 通读并按语义修改 work/script.json
node render/render.mjs validate work/script.json
node render/render.mjs still work/script.json --at 1.4,4.6 -o work/shots   # 用 Read 打开 PNG 检查构图
node render/render.mjs render work/script.json -o work/overlay.mov
node render/render.mjs composite --video main.mp4 --overlay work/overlay.mov -o out/final.mp4
```

只要先出一版：`node render/render.mjs auto --video main.mp4 --srt subs.srt -o out/final.mp4 --corner`

检查要点：猫不挡画面主体（主体在中间时 `cat.x ≥ 0.8`）；牌子 / 气泡的字完整不出画；角落模式（peek）下不用道具场景。

ChatCut Desktop：只有用户明确要求在 ChatCut 里操作时才用。先 `get_active_project` 确认项目，把 overlay.mov 作为本地素材导入，放到主轨之上的叠加轨，起点对齐。
