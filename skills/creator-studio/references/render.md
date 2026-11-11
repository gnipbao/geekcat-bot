# 渲染

`scripts/render.mjs` 优先用 **FrameVelo**（作者自己的渲染加速器：WebCodecs 硬件编码，走 HyperFrames 官方管线，只替换采集和编码；1080p 约快 2 倍、4K 约快 3.8 倍，画面与 `hyperframes render` 一致，编码前逐段和原生截图比对），没装或失败时自动回退 `npx hyperframes render`（工程 package.json 里钉住的版本）。

```bash
node <skill>/scripts/render.mjs <工程> --platform bilibili --preview 30,6     # 先出 6 秒（30 秒处开始）看效果
node <skill>/scripts/render.mjs <工程> --platform bilibili,youtube,douyin,x --fps 60
node <skill>/scripts/render.mjs <工程> --variant vertical --quality draft      # 按变体渲染；draft 最快
node <skill>/scripts/render.mjs <工程> --engine hyperframes                    # 强制用 HyperFrames
```

- 输出 `renders/<slug>-<平台或变体>[-preview].mp4`；同一变体的多个平台（如 bilibili + x）只渲一次再复制；youtube 另复制一份 `.srt`。
- 成片检查（最后一行 JSON 里）：时长和合成是否一致、有没有音轨、整体响度（-20 ~ -11 LUFS 以外会提示）、首中尾三帧 `renders/<名字>.check/*.png`——**打开这三帧看一眼再交付**。
- 预览只有 FrameVelo 支持（`--start` / `--duration`）；HyperFrames 回退时会渲整片。
- 帧率：角色动作多、录屏推近多用 60；纯图文 30。4K：FrameVelo 加 `--scale 2`（直接调用 `framevelo render <根目录> -o out.mp4 --scale 2 --quality high`），HyperFrames 用 `--resolution landscape-4k`。
- 安装：`npm install -g github:gnipbao/framevelo @hyperframes/producer@<版本> @hyperframes/engine@<版本> && framevelo browser install`，两个 HyperFrames 包的版本以 FrameVelo `package.json` 的 `peerDependencies` 为准（0.6.0 的 0.9 分支要求 `>=0.9.33 <0.10.0`，更早的构建要求 0.8.x）；从本地源码装：在仓库里 `npm run build && npm pack`，再 `npm install -g <生成的 .tgz> @hyperframes/producer@0.9.33 @hyperframes/engine@0.9.33`。`framevelo doctor` 自检（浏览器、drawElementImage、硬件编码器、FFmpeg、HyperFrames）。只支持 macOS / Windows；Linux 上自动走 HyperFrames。
- **版本要对上**：全局 `framevelo` 和全局 `@hyperframes/producer` / `engine` 必须符合 FrameVelo 的 peerDependencies，对不上会报 `api.distributed.plan is not a function`（`framevelo doctor` 能看到版本）。从源码仓库升级 FrameVelo 以后要重新 `npm run build && npm i -g .` 并把两个 HyperFrames 包装到它要求的版本；或者不动全局，设 `FRAMEVELO_BIN="node --disable-warning=ExperimentalWarning <仓库>/src/cli.ts"` 直接跑源码。出错时 render.mjs 会提示；整片自动回退 HyperFrames，`--preview` 直接报错（HyperFrames 不能只渲一段）。
- **转场和滤镜的代价**：`blur` 转场给整屏场景加模糊滤镜，渲染慢约 3 倍（同一段 14 秒预览：fade 16 秒、blur 46 秒），和角色描边光（`mascotFilter`）叠在一起时 FrameVelo 会加载超时。所以深浅色科技风主题默认用 `fade`；`blur` 只在个别场景（收尾）手动指定。
- 录屏 / 摄像头为主的工程，FrameVelo 不一定更快（每个新视频帧都要解码注入）。2026-11 在 M3 Pro 上实测：教程样例（录屏 + 摄像头两路视频，39.4 秒 30fps）FrameVelo 83 秒、`--engine hyperframes` 68 秒；讲解类（纯动效 + 角色）FrameVelo 明显更快。赶时间的教程可以直接 `--engine hyperframes`；FrameVelo 的好处是 CPU 占用低，渲染时还能干别的。
