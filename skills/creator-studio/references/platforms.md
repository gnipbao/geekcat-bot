# 平台

`video.json` 写 `"platforms": ["bilibili", "youtube", "douyin", "x"]`，`build.mjs` 据此构建需要的变体，`render.mjs --platform …` 按平台出片。

| 平台 | 变体 | 画面 | 字幕 | 封面 | 注意 |
|---|---|---|---|---|---|
| `bilibili` B站 | master | 1920×1080 横版 | 烧录（卡拉 OK 样式） | `cover-16x10.png`（也可 4:3 动态封面 `cover-4x3.png`） | 可传 60fps、4K（`--resolution` 见 render.md） |
| `youtube` | clean | 1920×1080 横版 | **不烧**，上传 `renders/<slug>-youtube.srt` 作 CC | `youtube-1280x720.png`（超过 2MB 自动出 JPG） | 响度 -16 LUFS 即可（YouTube 只往下压） |
| `douyin` 抖音（`shorts` / `channels` / `xiaohongshu` 同） | vertical | 1080×1920 竖版 | 烧录，每屏 ≤ 12 字 | `cover-9x16.png` + `cover-3x4.png` | 底部约 22% 和右侧按钮列是平台界面，内容不要放进去 |
| `x` | master | 1920×1080 横版 | 烧录（X 默认静音播放） | `cover-16x9.png` | 非 Premium 账号单条 ≤ 2 分 20 秒，超了 render.mjs 会提示；长视频剪一段精华发 X，正片挂 B站 / YouTube 链接 |

## 竖版怎么来的

不重新写场景：`variants/vertical/` 用同一批场景自动拼成竖版。

```
0–310     标题条：栏目名（cover.json 的 brand.label · eyebrow）+ 标题 + 当前章节
330–892   舞台：横版场景（含录屏、叠加层）缩到 1000 宽
940–1480  主讲卡片：摄像头 / 数字人按人脸裁切；墨墨站在这里；纯配音时留空
~1400     字幕（压在主讲卡片下沿）
1480–1920 平台界面区（标题、点赞按钮），不放内容
```

标题和栏目名可以在 `video.json` 里单独指定：`"vertical": {"title": "…", "label": "…"}`。竖版对横版场景里的小字不友好：抖音是主战场的那期，场景字号再大一档、每屏信息再少一些。

## 变体目录

`variants/<名字>/` 是独立的 HyperFrames 根（`index.html` + `compositions/`，素材用硬链接，不占空间）。HyperFrames 和 FrameVelo 都只认 `index.html` 当入口，所以每个变体一个目录。检查、预览、抽帧都可以直接对变体目录跑：`(cd variants/vertical && npx hyperframes check)`。
