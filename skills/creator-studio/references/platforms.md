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

## 竖版原生工程（抖音 / 小红书是主战场时）

要展示的素材本身是竖图或竖视频（3:4 的手绘页、手机录屏）时，套进横版再缩成竖版会太小。这时直接按竖屏写：`new.sh … --vertical` 建工程（或 `video.json` 写 `"width": 1080, "height": 1920`），场景按 1080×1920 的像素排版，主版本就是竖屏成片，`render.mjs --platform douyin,xiaohongshu` 直接用它，不再另拼 `variants/vertical/`。

- **画面铺满，不留空白**：背景和素材一直铺到底（约 y 1780），底部被平台标题盖住的那一段只放不重要的东西（素材下沿、状态栏）；不要为了"安全区"把下面四分之一空着。关键内容（标题、数字、字幕）放在上 150px 以下、y 1700 以上，右侧 x > 950 且 y 在 900–1500 之间（点赞评论按钮）不放字。
- 带竖版版式的主题（`terminal`、`greenscreen`，见 `themes.md`）会给好整屏底色、字幕位置、主讲小头像的位置，场景用 `.v-*` 原子写；其他主题要自己在 `video.json` 写 `"backdrop"`（整屏底色，任意 CSS background）、`captionStyle`，在 `presenter.json` 写 `"front": true`（小头像压在素材卡片上面）。
- 字幕默认每屏 ≤ 12 字、放在 y ≈ 1400–1470；`captionStyle` 的 `left / width / bottom / size / max` 可以改。
- stage 模式的 IP 角色自动换成竖构图机位（头在画面中下部，上方 0–800px 留给钩子大字）。这个机位下跳推要带 `"shift": [0, 0.2]`，否则脸会被推到画面上方、压住大字。
- 素材（图片、视频）直接写进场景：视频用一个不计时的 `.card` 包住（动效加在外层），`<video class="clip" muted playsinline data-start data-duration [data-media-start] [data-playback-rate]>`，`data-start` 是场景本地时间（旁白时间减去场景起点，场景起点 = `scenes.json` 的 `start − 0.5`，第一个场景是 0）。
- 主讲在竖版里保持很小（约 200px 的圆形头像，放左下角）：`presenter/track.json` 写 `[{"at": 0, "mode": "pip", "rect": [30, 1540, 210, 210], "shape": "circle"}]`；要压在素材卡片角上就在 `presenter.json` 写 `"front": true`，否则会被卡片盖住。

## 变体目录

`variants/<名字>/` 是独立的 HyperFrames 根（`index.html` + `compositions/`，素材用硬链接，不占空间）。HyperFrames 和 FrameVelo 都只认 `index.html` 当入口，所以每个变体一个目录。检查、预览、抽帧都可以直接对变体目录跑：`(cd variants/vertical && npx hyperframes check)`。
