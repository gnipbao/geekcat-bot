# 封面（五比例）

`node <skill>/scripts/covers.mjs <project>` 读 `cover.json`，输出 `covers/cover-{16x9,16x10,4x3,3x4,9x16}.png`（同目录留有 HTML，可微调后重新截图）。

```json
{
  "eyebrow": "知识猫 · 实测",
  "title": ["REA", "逆向一切"],
  "subtitle": "14.6 万星的 AI 逆向神器",
  "badge": "实测",
  "ghost": "REVERSE",
  "ground": "#FFDC8B",
  "chipColors": ["#FE90E8", "#F7CB46", "#C0F7FE"],
  "ip": { "do": "surprised", "at": 0.45, "accessories": ["glasses"], "scene": null, "text": null, "scale": 1.22 }
}
```

- 设计：BlockFrame（视频同款）。主题文字与角色居中构图：横版文字左、角色右；竖版文字上、角色下。字号按宽高比自动缩放。
- 主标题越短越好（≤ 5 个字符的英文或 ≤ 4 个汉字最醒目）；副标题一句卖点 ≤ 14 字；徽章 2–3 字。
- 角色定格图来自 `ip.json` 的 `still` 命令（透明 PNG）。表情挑"有情绪"的瞬间：surprised（at≈0.45，带「!」）、happy、curious（at≈1.2，带「?」）、scared（at≈1.2，炸毛）。可以加 `scene: "sign"` + `text` 让角色举牌。
- 涉及品牌 logo 时，用手上的 logo 工具或 skill 取素材，放进 `title` 旁边需要改 HTML（`covers/cover-*.html`）后重截。
- 交付前五张都要打开看：文字不出画、角色不被裁、徽章不压字。
