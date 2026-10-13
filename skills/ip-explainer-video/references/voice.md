# 配音：豆包语音 2.0（更像真人）

脚本：`scripts/tts.py`。环境变量 `DOUBAO_TTS_TOKEN`（火山引擎控制台 → 语音技术 → API Key）。

## 为什么整段合成更像真人

旧做法逐句请求再拼接，每句话都从头起调，句尾一律收平，句间停顿是硬插的静音——听起来像播音。`tts.py` 按**场景整段**送进模型：

- 语气、重音、句间停顿由模型按上下文决定，连贯自然（同一段话整段合成通常比逐句拼接短 ~10%，节奏更贴近真人说话）。
- 时间轴来自接口的逐字时间戳（`audio_params.enable_subtitle: true`），字幕和场景时间仍然精确，不需要另做对齐。
- `--style` 写进 `additions.context_texts`，用一句自然语言控制语气。默认：「像跟懂技术的朋友聊天一样，轻松自然，有好奇心，句子之间有呼吸感，不要播音腔」。按内容换：激动的发布会、冷静的复盘、讲故事都可以写。

## 写口播稿的规矩（比换音色更影响"真人感"）

- 口语句子：短句为主，允许"其实""对吧""你看"这类口头连接词，但一段里别超过一两个。
- 标点就是停顿：逗号短停、句号长停、问号会上扬。需要更长停顿用 `[停 0.6]`。
- 数字、版本号、命令、文件名改成能念的写法：「6.4.0」→「六点四版本」、「.NET」→「点 NET」、「cat-engine.js」→「动画引擎」。
- 每个场景以 `# NN 标题` 开头（tts.py 用它切场景、出 scenes.json）。
- 合成前检查多音字（如「调用」「一行」「重启」「给」）：扩成无歧义的词或换说法；装了 verysmallwoods-video skill 的话可以用它的 `scan-heteronyms.sh` 自动扫描。

## 音色

只有 `_uranus_bigtts` 结尾的是 2.0 音色（资源 `seed-tts-2.0`）；`_mars_bigtts` 是 1.0，需要另外开通 `seed-tts-1.0`。2026-10 实测可用的男声（以你账号实际开通为准）：

| 音色 ID | 名字 | 适合 |
|---|---|---|
| `zh_male_yuanboxiaoshu_uranus_bigtts` | 渊博小叔 | 知识讲解、技术科普（默认） |
| `zh_male_kailangxuezhang_uranus_bigtts` | 开朗学长 | 轻松教程、工具推荐 |
| `zh_male_yangguangqingnian_uranus_bigtts` | 阳光青年 | 节奏快的资讯、发布 |
| `zh_male_qingshuangnanda_uranus_bigtts` | 清爽男大 | 年轻化、校园感 |
| `zh_male_ruyayichen_uranus_bigtts` | 儒雅逸辰 | 深度分析、人文 |
| `zh_male_wennuanahu_uranus_bigtts` | 温暖阿虎 | 亲和、故事 |
| `zh_male_m191_uranus_bigtts` | 通用男声 | 中性稳重 |
| `zh_male_taocheng_uranus_bigtts` / `zh_male_dayi_uranus_bigtts` / `zh_male_liufei_uranus_bigtts` / `zh_male_shaonianzixin_uranus_bigtts` | — | 可用，未细试 |

女声：`zh_female_vv_uranus_bigtts`、`zh_female_xiaohe_uranus_bigtts`。音色名单会变，拿不准就用一句话探测：返回 `resource ID is mismatched with speaker` 即不可用。

## 用自己的克隆声音

1. 火山引擎控制台 → 豆包语音 → **声音复刻**：上传 10 秒以上、安静环境、正常语速的录音（建议 30 秒–1 分钟，内容和视频口吻接近），训练完成后得到 `S_` 开头的音色 ID。
2. 直接传给脚本：`--voice S_xxxxxxxx`。`tts.py` 看到 `S_` 会自动用资源 `seed-icl-2.0`（声音复刻 2.0；需要在控制台开通，`seed-icl-1.0` 是旧版）。
3. `--style` 对克隆声音同样有效（复刻 2.0 支持情感演绎）。
4. 只用你本人或已获授权的声音。

## 换声音重配

文字不变时，换音色 / 克隆声音 / 语气后用 `scripts/retime.py` 把场景、角色剧本、终端演示的时间点自动搬到新旁白上（逐字对齐，对齐率低于 90% 会拒绝执行）。样例：同一期 REA 视频从通用男声换成克隆声音，时长 4:02 → 4:17，场景代码一行没改。

## 自录

用户自己录音时：给口播稿 → 用户录音 + 提供 SRT → 用 SRT 生成 `scenes.json`（按 `#` 场景对应句子），其余流程不变。
