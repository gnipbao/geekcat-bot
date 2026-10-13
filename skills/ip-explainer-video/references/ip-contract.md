# IP 角色接入约定

这套流程不认识任何具体角色，只读工程根目录的 `ip.json`。换角色 = 换这个文件（以及角色自己的仓库），口播、场景、构建、封面流程都不变。默认实现是知识猫：`templates/ip/geekcat.ip.json`。

## ip.json 字段

| 字段 | 必需 | 作用 |
|---|---|---|
| `id` | 是 | HyperFrames 图层的 composition id，也是 `video.json.ip.id` |
| `name` | 是 | 角色名（日志、文档里用） |
| `selfName` | 是 | **口播里角色怎么称呼自己**。知识猫是「知识猫」；写口播稿时只用这个称呼 |
| `persona` | 建议 | 性格一句话，决定口播口吻和动作选择 |
| `repo` | 是 | 角色仓库路径，命令模板里的 `{repo}` |
| `setup` | 否 | 首次使用要执行的安装命令 |
| `commands.list` | 是 | 输出可用动作 / 场景 / 配饰目录（JSON） |
| `commands.validate` | 是 | 校验角色剧本：`{script}` |
| `commands.layer` | 是 | 剧本 → HyperFrames 子合成：`{script}` `{out}` `{id}` |
| `commands.still` | 是 | 剧本某一时刻的透明 PNG（封面用）：`{script}` `{at}` `{dir}`，最后一行输出 `{"files":[...]}` |
| `scriptSchema` / `guide` | 建议 | 角色剧本 schema 和角色自己的说明（写剧本前读） |
| `zones` | 建议 | 角色在画面里的常用站位（host / side / peek / center），场景排版据此留空 |

调用方式统一走适配层：`node <skill>/scripts/ip.mjs <list|validate|layer|still|info> --script mascot/script.json`。

## 角色剧本（mascot/script.json）

剧本格式由角色定义（知识猫见 `{repo}/render/script.schema.json`）。流程对剧本只有四个要求：

1. `width` / `height` / `duration` 与主合成一致（`duration` = `video.json` 的 total）。
2. `lipsync` 指向 `../narration/narration-full.mp3`，嘴型跟旁白走（角色支持的话）。
3. 时间点用旁白的真实时间（`narration/scenes.json` 里每句的 `t`），动作切在句首前约 0.2 秒。
4. 站位随内容变化：讲解密集时退到角落，高光时刻回到中间；站位变化用角色支持的移动字段（知识猫：timeline 条目里的 `"cat": {x, y, scale, duration}`）。

## 接入一个新 IP 的最低实现

新角色只要提供两条命令就能进流水线：

- **layer**：输出一个 HyperFrames 子合成文件——`<template>` 包裹，根节点 `data-composition-id="{id}"`，注册一条暂停的 GSAP 时间轴 `window.__timelines["{id}"]`，画面是时间的纯函数（不用 `Date.now()` / 随机数 / 网络）。最简单的写法：一个代理补间 `tl.fromTo(proxy,{t:0},{t:D,duration:D,ease:'none',onUpdate:()=>draw(proxy.t)})`。舞台节点加 `data-layout-ignore`。
- **still**：渲染某一时刻的透明 PNG。

只有序列帧 / Lottie / 透明视频的角色也可以：`layer` 生成一个包住 `<video>`（WebM VP9 alpha）或 Lottie 播放器的子合成；做不到原生图层时，退回后期叠加——HyperFrames 先出无角色成片，再用 ffmpeg overlay 合成透明 MOV（geekcat 的 `composite` 命令就是这个做法）。

## 角色与画面排版的约定

- 场景内容避开 `zones` 里当前站位的区域：主讲站位留出右侧 ~35%，角落探头留出右下 360×300。
- 页码牌等固定元素放左下角，不放右下。
- 角色是画面里唯一的"人"，场景里不要再出现另一个吉祥物。
