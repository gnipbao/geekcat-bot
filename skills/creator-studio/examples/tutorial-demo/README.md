# 教程样例：录屏 + 摄像头（night 主题）

演示素材先行的整条链路：`ingest.py` 对齐、转写、粗剪 → 主讲版式轨道（全屏开场 → 小窗 → 侧栏 → 全屏结尾）→ 录屏推近和标注 → 透明叠加层（下三分之一、关键词、章节卡、步骤条、按键）→ 横版 / 去字幕版 / 竖版 → FrameVelo 渲染。

素材不在仓库里（录屏和摄像头是你自己的），用你的素材跑一遍：

```bash
SK=~/.agents/skills/creator-studio
bash $SK/scripts/new.sh ~/videos tutorial-demo --format tutorial --presenter camera --theme night
P=~/videos/$(date +%Y%m%d)-tutorial-demo
cp $SK/examples/tutorial-demo/{video.json,cuts.json,cover.json} $P/ && cp $SK/examples/tutorial-demo/narration/script.txt $P/narration/
python3 $SK/scripts/ingest.py $P --screen 你的录屏.mov --camera 你的摄像头.mp4 --script $P/narration/script.txt
```

然后按 `narration/transcript.txt` 里的时间改 `presenter/track.json`、`screen.json`（focus / marks 的坐标用录屏原始像素），把 `scenes/` 里的叠加层拷到 `$P/build/scenes/` 并改 `c()` 时间，最后：

```bash
node $SK/scripts/build.mjs $P && (cd $P && npx hyperframes check)
node $SK/scripts/render.mjs $P --platform bilibili,youtube,douyin
node $SK/scripts/covers.mjs $P
```

样例里的时间点对应一段 45 秒的口播（剪完 39.4 秒），`presenter.json` 里的 `face` 是手填的（测试素材是卡通形象，Vision 找不到脸）；用真人素材时删掉 `face`，ingest 会自动写人脸框。
