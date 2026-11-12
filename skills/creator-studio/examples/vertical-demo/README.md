# 竖版样例：一份场景，六套竖版主题

45 秒，1080×1920 原生竖版，介绍 story-to-handdrawn-video（开源的手绘动画 Skill）：钩子 → 三步原理 → 297 种画风 → 开源数据和号召。场景只用竖版原子（`.v-title`、`.v-media`、`.v-doc`、`.v-stk` …）写，没有写死位置，所以**改 `video.json` 的 `"theme"` 一行就能换版式**：

| theme | 版式 |
|---|---|
| `terminal` | 命令行标题 + 终端窗口 + 绿色数字贴纸 + 状态栏，墨墨是左下角小圆头像 |
| `greenscreen` | 素材铺满整屏 + 红白胶囊标题 + 黄色贴纸，墨墨是带白边的抠像小角色，逐词弹跳字幕 |
| `headline` | 整屏素材压暗 + 压在画面上的黄色特粗大字（开场钩子居中最大）+ 黄色徽章 |
| `markup` | 纸色底 + 黑边素材卡片 + 荧光笔标题 + 红圈和手写批注 + 黄色便签数字 |
| `prompt` | 深色紫光底 + 结果卡片 + 提示词面板（标题排成带光标的等宽字）|
| `cinema` | 整屏素材 + 上下黑边 + 细体小标题和字幕，只有关键词是暖色 |

这个工程没有 `presenter/track.json`，也没写 `captionStyle`、`backdrop`、`display`：整屏底色、字幕样式和位置、墨墨的出场方式和位置都来自主题 `theme.json` 的 `portrait`。任何主题想换成逐词弹跳字幕，加一行 `"captionStyle": {"look": "pop"}`。

写法要点（细节见 `references/themes.md` 的"竖版版式"）：

- 素材放进 `.v-fill`（3:4 盒子；边上有字、不能裁的加 `.fit`）或 `.v-page`（网页长截图，写 `aspect-ratio`），里面的 `<img>` / `<video>` 不写宽高；圈和标签用百分比写在盒子里，换主题后还对得上。
- 说明内容放进 `.v-body.doc > .v-doc`，用 `.v-row`、`.v-bar`、`.v-cols > .v-cell`、`.v-shot`、`.v-sq` 排，不写坐标。
- 标题每句话换一个 `.v-title`（进场用 `enter('#id', t, { y: 0 })` 动整块，再 `slam` 大字）；7 个字以上加 `.m`、8 个字以上加 `.s`；`<br class="v-br">` 是给两行大标题的主题用的建议换行位置。
- 动效用百分比（`xPercent`、`transformOrigin: '3% 60%'`），不用像素位移。

素材和旁白不在仓库里。场景引用的 `assets/media/` 文件来自 story-to-handdrawn-video 仓库（风格翻书演示、逐层绘制演示、分镜母图和图层）和一张 GitHub 页面截图，换成你自己的素材即可：

```bash
SK=~/.agents/skills/creator-studio
bash $SK/scripts/new.sh ~/videos my-short --format talk --presenter mascot --theme terminal --platforms douyin,xiaohongshu --vertical
# 写稿 → tts.py → tighten.py → 参考 scenes/ 写 build/scenes/ → direct.mjs → build.mjs → render.mjs --platform douyin
```
