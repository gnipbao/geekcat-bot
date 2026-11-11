# 素材先行：录屏 / 摄像头 / 口播原片

## 录制建议

- **录屏 + 摄像头分开录**（OBS：屏幕和摄像头各输出一个文件，或用 Source Record 插件；或 QuickTime 录屏 + 相机 / 手机单独录），这样主讲版式（全屏 / 侧栏 / 小窗）才能随时换。已经合成好的录屏（摄像头烧在画面里）只能当 `--screen` 用。
- 录屏分辨率 1920×1080 或 2560×1440 就够（ingest 会把更大的缩到 2560 宽以内）；帧率 30；把浏览器 / 编辑器字号调大，推近以后才清楚。
- 摄像头：横拍 16:9，人脸在画面中间偏上，背景干净；声音用领夹或桌面麦（--mic 单独给更好）。
- 开录后先拍一下手或说一句"开始"，自动对齐更稳；各轨同时开始录的可以直接 `--sync none`。
- 有稿子就照稿子讲（`--script`），转写错字会少很多；讲错了直接重说一遍，ingest 会自动保留后一遍。

## ingest.py

```bash
python3 <skill>/scripts/ingest.py <工程> --screen 录屏.mov --camera 摄像头.mp4 [--mic 人声.wav] [--script 稿子.txt]
    [--sync auto|none] [--offset camera=0.42] [--gap 0.25] [--idle 4] [--speedup 4] [--fps 30] [--no-cut] [--reasr]
```

| 做什么 | 说明 |
|---|---|
| 人声来源 | `--mic` > 摄像头的声音 > 录屏的声音 |
| 多轨对齐 | 默认按声音包络互相关自动算 offset（相关系数 < 0.3 会提示）；`--offset 轨=秒` 手动；`--sync none` 当作同时开始 |
| 转写 | whisper-cli，模型按 `--model` / `WHISPER_MODEL` / `~/models/` 依次找；结果缓存在 `footage/work/asr.json`，改稿子、改 cuts.json 重跑不重新转写（`--reasr` 强制） |
| 套稿子 | 稿子格式和 tts.py 一样（`# NN 标题` 分场景）；稿子的字 + whisper 的时间；稿子外的字在 transcript 里标 ⟨⟩；重说自动保留后一遍 |
| 粗剪 | 停顿压到约 `--gap` 秒；有录屏时超过 `--idle` 秒不说话改成加速（至少 `--speedup` 倍，最长占 3 秒，画面出"⏩ N×"）；`--no-cut` 不剪 |
| 输出 | `footage/screen.cut.mp4`、`footage/camera.cut.mp4`（无声、固定帧率、每秒一个关键帧）、`narration/narration-full.mp3`（-16 LUFS）、`words.json`、`scenes.json`、`captions.json/.srt`、`transcript.txt`、`footage/cutlist.json`、`footage/camera.cut.face.json`；没有的话顺手写 `presenter.json` 和 `screen.json` |

每段剪辑都对齐到帧网格，三条轨（录屏、摄像头、人声）拼完长度完全一致，不会越剪越不同步。

### cuts.json（读完 transcript.txt 再写）

```json
{
  "drop": ["说错的那句话", "重复的话#2", [12.3, 14.0]],
  "dropExtras": true,
  "fillers": ["嗯", "呃", "那个"],
  "keep": [[61.0, 75.5]]
}
```

`drop`：短语（`#n` 第几次出现）或秒数区间（原始人声时间）；`dropExtras`：删掉稿子里没有的字；`fillers`：前后有停顿的单独语气词自动删（默认 嗯 / 呃 / 额）；`keep`：这段不压停顿、不加速（比如故意留白的演示）。改完重跑 ingest，几秒钟。

没稿子时场景按长停顿和约 45 秒一段自动切，标题是"第 N 段"：直接改 `narration/scenes.json` 的 `title`，合并 / 拆分场景时改 `start` / `end` 并保证首尾相接。

## screen.json（录屏图层）

```json
{
  "src": "footage/screen.cut.mp4",
  "frame": "window",
  "title": "Location Scout — 上海外滩",
  "focus": [
    { "at": 9.0, "box": [905, 120, 290, 290], "until": 13.2 },
    { "at": 25.6, "box": [30, 36, 860, 120], "until": 28.0 }
  ],
  "marks": [
    { "at": 9.6, "until": 13.0, "box": [905, 120, 290, 290], "label": "① 真实街区地图" },
    { "at": 26.0, "until": 27.9, "box": [30, 36, 860, 40], "label": "② 输入地名", "style": "spot" }
  ]
}
```

- 坐标都是**录屏原始像素** `[x, y, w, h]`（ingest 之后的 `screen.cut.mp4` 的尺寸）。先抽帧带网格看坐标：`ffmpeg -ss 12 -i footage/screen.cut.mp4 -frames:v 1 -vf "drawgrid=w=100:h=100:c=red@0.5" grid.png`。
- `frame`：`window` 主题窗口框（带标题栏），会跟着主讲版式让位；`full` 全幅铺满。
- `focus`：从 `at` 起 0.6 秒推近到这个框（最多 3 倍），到 `until` 拉回全屏；时间用剪完以后的时间（transcript.txt）。
- `marks`：标注框跟着录屏一起移动、推近，线宽和字号保持不变；`style: "spot"` 把框外压暗；框贴着顶边时标签自动放到框下面（`labelAt: "above"/"below"` 可强制）。
- `segments`（事后配音的教程）：`[{ "at": 场景开始秒, "src": [源起, 源止] }]`，每段视频速度自动拉伸到下一段开始；无声录屏先跑 `ingest.py <工程> --screen 录屏.mov --no-voice`。
- 加速角标默认读 `footage/cutlist.json`；也可以手写 `"speed": [{ "at": 20, "dur": 1.5, "x": 4 }]`。
