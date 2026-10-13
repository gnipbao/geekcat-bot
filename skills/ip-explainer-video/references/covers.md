# 封面（五比例 + YouTube 缩略图）

`node <skill>/scripts/covers.mjs <project>` 读 `cover.json`，输出 `covers/cover-{16x9,16x10,4x3,3x4,9x16}.png` 和 `covers/youtube-1280x720.png`（YouTube 缩略图规格，超过 2MB 会提示）。同目录留有 HTML，可微调后重新截图。

两种版式，用 `"style"` 切换：`blockframe`（默认，和视频同款）、`swiss`（瑞士极简频道版式，见文末）。

## blockframe

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

## swiss（频道统一版式）

米白底、大号英文名、一句中文钩子、红色短条 + 细线、一行数据；右侧（竖版在下方）站一张品牌照片或 IP 角色。适合做频道的固定封面模板：每期只改 `title` 和 `subtitle`。

```json
{
  "style": "swiss",
  "brand": { "label": "知识猫AI实验室", "photo": "../brand/cat-photo.png", "ground": "#F2F0EC", "accent": "#E30613" },
  "eyebrow": "开源实测",
  "title": ["REA", "AI *逆向*一切"],
  "subtitle": "14.6 万星 / 我拿自己开刀实测",
  "ip": { "do": "surprised", "at": 0.45, "accessories": ["glasses"] }
}
```

- `title[0]`：大号英文名（项目名 / 产品名，≤ 5 个字符最好）；`title[1…]`：中文钩子，每项一行，`*…*` 里的字用强调色。
- `brand.photo`：相对工程目录的 PNG，人物 / 角色贴底边、背景和 `brand.ground` 同色（左、上边缘会自动羽化）。默认按 0.735 宽高比排版，其他比例写 `brand.photoAspect`。照片通常有版权或肖像问题：放在工程外的品牌目录，不要提交进仓库。
- 不写 `brand.photo` 时用 `ip` 生成的角色定格图，版式不变。
- 字号按可用宽度自动收缩，文字不会压到照片上。字体 Inter Tight / JetBrains Mono 由 `init-project.sh` 下载到本机缓存；缺失时退回 Space Grotesk。
