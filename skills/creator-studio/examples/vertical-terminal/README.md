# 竖版样例：terminal 主题 · 墨墨小头像 · 抖音 / 小红书

45 秒，1080×1920 原生竖版：命令行标题 + 终端窗口里放素材 + 右上角绿色数字贴纸 + 底部状态栏，墨墨是左下角的小圆头像，字幕压在窗口下沿。内容是介绍 story-to-handdrawn-video（开源的手绘动画 Skill）：钩子 → 三步原理 → 297 种画风 → 开源数据和号召。

演示的是：

- **竖版原生工程**：`video.json` 写 `"width": 1080, "height": 1920`，场景直接按竖屏写，`render.mjs --platform douyin,xiaohongshu` 直接出主版本。
- **主题给的竖版默认值**：这个工程没有 `presenter/track.json`，也没写 `captionStyle` 和 `backdrop`，整屏底色、字幕位置、主讲小头像的位置和置顶都来自 `themes/terminal/theme.json` 的 `portrait`。
- **竖版原子**：场景里只写 `.v-title`（`.ctx` + `.key`）、`.v-media[data-title] > .v-body`、`.v-stk`（`<b>` 数字 + `<span>` 说明）、`.v-log`、`.v-panel`、`.v-foot`，位置和外观都在主题里。
- **素材直接写进场景**：`.v-body` 里放 `<video class="clip" muted playsinline data-start data-duration …>`（1000×1333 的 3:4 素材，下沿被窗口裁掉一点）和 `<img>`，动效加在 `.v-media` 外层。

素材和旁白不在仓库里。场景引用的 `assets/media/` 文件来自 story-to-handdrawn-video 仓库（风格翻书演示、逐层绘制演示、分镜母图和图层）和一张 GitHub 页面截图，换成你自己的素材即可：

```bash
SK=~/.agents/skills/creator-studio
bash $SK/scripts/new.sh ~/videos my-short --format talk --presenter mascot --theme terminal --platforms douyin,xiaohongshu --vertical
# 写稿 → tts.py → tighten.py → 参考 scenes/ 写 build/scenes/ → direct.mjs → build.mjs → render.mjs --platform douyin
```
