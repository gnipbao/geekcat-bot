# 竖版样例：greenscreen 主题（绿幕评论式）+ 逐词弹跳字幕

45 秒，1080×1920 原生竖版：素材、文档页、GitHub 页面依次铺满整屏，墨墨是左下角带白边的抠像小角色，顶部红白两枚胶囊交代"现在在看什么"，右上角黄色数字贴纸，黄色高亮圈和箭头指着页面上的重点，字幕是逐词弹跳的两行大字。内容和 `examples/vertical-terminal/` 是同一期（介绍 story-to-handdrawn-video），可以对照着看同一份稿子换版式以后怎么写。

演示的是：

- **主题给的竖版默认值**：工程里没有 `presenter/track.json`、`captionStyle`、`backdrop`、`display`，都来自 `themes/greenscreen/theme.json` 的 `portrait`：字幕用 `pop`（逐词弹跳），主讲用 `overlay`（抠像）并固定站在左下角，白边来自 `mascotFilter`。
- **整屏素材**：`.v-media > .v-body` 是 1080×1920；3:4 的视频按 1440×1920 铺满（左右各裁掉一点），有文字贴边的素材按 1200×1600 放在白底上；网页截图自己写宽高；`.v-body.light` 当"文档页"用，里面放 `.v-panel`。
- **指给观众看**：`.v-ring` 高亮圈 + 一条 SVG 箭头（`draw()` 描出来），`.kw` 黄色贴纸写结论。
- **逐词弹跳字幕**：`captions.py` 按词断行（macOS 用系统分词），每屏 ≤ 8 个字、拆成两行，第二行更大并换成强调色，按语音一行一行弹出来。别的主题也能用：`video.json` 写 `"captionStyle": {"look": "pop"}`。

素材和旁白不在仓库里（同 `vertical-terminal`）。用自己的素材：

```bash
SK=~/.agents/skills/creator-studio
bash $SK/scripts/new.sh ~/videos my-take --format talk --presenter mascot --theme greenscreen --platforms douyin,xiaohongshu --vertical
# 写稿 → tts.py → tighten.py → 参考 scenes/ 写 build/scenes/ → direct.mjs → build.mjs → render.mjs --platform douyin
```
