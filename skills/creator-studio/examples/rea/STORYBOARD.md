# STORYBOARD · REA 介绍（知识猫）

时间来自真实旁白（`narration/scenes.json`）。设计：BlockFrame。全片 241.8s，1920×1080，60fps。

## Frame 1 — 开场
- status: built
- src: compositions/s01.html
- time: 0.80s → 21.78s (21.0s)
- shape: kinetic-type-beats + logo-assemble-lockup
- visual: App 窗口里的好功能 → 光标点击 → "它是怎么做的？" → "没有源代码"印章；15.75s 起 REA / Reverse Engineer Anything / 逆向一切 三块倾斜色块依次弹出
- 知识猫: 右侧主讲：wave+气泡"我是知识猫" → curious → jump
- narration: 大家好，我是知识猫。 你有没有过这种时候：在别人的软件里看到一个特别好用的功能，很想知道它是怎么做出来的，可手里根本没有源代码。 今天聊的这个开源项目，就是专门干这件事的。 它叫 REA，全称 Reverse Engineer Anything，逆向一切。

## Frame 2 — 热度
- status: built
- src: compositions/s02.html
- time: 21.78s → 37.54s (15.8s)
- shape: grid-card-assemble + count-up
- visual: 时间线 2026.04→2026.10；三张倾斜数据卡（146,188 ★ / 33,901 forks 滚动计数，v6.4.0）；提交热力格子；MIT 印章
- 知识猫: 右下：surprised（星数）→ nod
- narration: 它今年四月才开源。 半年时间，拿到了十四万六千多颗星，三万三千多次复刻。 十月十一号刚发布六点四版本，几乎每天都有新提交，开源协议是 MIT。

## Frame 3 — 它是什么
- status: built
- src: compositions/s03.html
- time: 37.54s → 74.89s (37.3s)
- shape: spatial flow diagram (rules: svg draw, pop, typewriter)
- visual: 你 → AI 智能体（示例请求逐字打出）→ MCP 调用 → REA → 检查·追踪 → 目标软件；"发现 + 证据"回流 → 解释/实现/测试；终端卡片
- 知识猫: 角落探头 + 眼镜：shake → look → think（灯泡）
- narration: 一句话概括：REA 是一个专为 AI 智能体打造的逆向工程 MCP 服务器。 你不用自己去啃汇编，而是直接问你的智能体。 比如：帮我搞清楚某个笔记软件的搜索是怎么实现的，附上证据，再在我的项目里做一个类似的。 智能体通过 MCP 调用 REA，去检查目标、追踪相关代码。 REA 把发现连同证据一起交回来，智能体再基于这些去解释、去实现、去测试。 同一套能力，在终端里也能直接用。

## Frame 4 — 能分析什么
- status: built
- src: compositions/s04.html
- time: 74.89s → 110.17s (35.3s)
- shape: grid-card-assemble
- visual: 原生二进制卡（Hopper/Ghidra/IDA → 伪代码·汇编·字符串·调用关系）、JS/Electron 卡；10 个目标按旁白节奏弹出；"无需原生引擎"贴纸
- 知识猫: 角落探头：surprised → look → nod
- narration: 它覆盖的范围有点夸张。 原生二进制，可以接 Hopper、Ghidra 或者 IDA，拿到伪代码、汇编、字符串和调用关系。 JavaScript 和 Electron 应用，能还原模块、导入关系和进程间通信。 还有网站、抓包文件、点 NET 程序集、安卓安装包和真机、Go、WebAssembly、以太坊字节码、固件，甚至 Flutter 应用。 而静态的 JavaScript 和点 NET 分析，连原生分析引擎都不需要装。

## Frame 5 — 实测
- status: built
- src: compositions/s05.html
- time: 110.17s → 161.53s (51.4s)
- shape: agent-progress-theater + record-terminal replay
- visual: A：拿我自己开刀 + prototype 目录卡；B：真实终端回放（4 条命令，ledger 驱动）+ 顶部要点贴纸；C：终端缩小 + REA 自述局限中文卡 + 结论/证据/边界
- 知识猫: 中间炸毛 → cheer；终端时缩到角落：surprised → happy → curious → nod
- narration: 光说不练没意思，我们直接拿我自己开刀。 我，知识猫，就是一个用 JavaScript 画出来的网页角色。 在终端里敲一行命令，让 REA 分析我的原型目录。 六秒钟，它读完了五个相关文件，解析了两个 JavaScript 模块，遍历了一万四千多个语法树节点。 它认出了我的动画引擎和绘制模块，也找到了两个页面入口。 最让我喜欢的是最后这一段：它会主动告诉你，局限在哪里。 比如代码只是被当作静态文本解析，从来没有执行过；静态的导入关系，也不能证明运行时真的会走到。 结论、证据和边界放在一起，这对智能体特别重要，它就不会把猜测当成事实。

## Frame 6 — 官方案例
- status: built
- src: compositions/s06.html
- time: 161.53s → 198.10s (36.6s)
- shape: spatial cards + count-up
- visual: DX-Ball（伪代码→C，3,205 用例、63/63 字节）、Notion（剪贴板→预加载→IPC→主进程）、PC-98（子弹环）
- 知识猫: 右侧 + 学士帽：surprised（字节一致）
- narration: 官方还放了几个相当硬核的案例。 老游戏 DX-Ball：REA 顺着一次声音调用，找到计算声像位置的函数，把残缺的伪代码还原成 C 代码。 还原结果通过了三千两百多个原始 x86 测试用例，六十三个编译后的字节完全一致。 还有 Notion：从页面里的剪贴板接口出发，一路追到预加载脚本、进程间通信，再到主进程。 以及一款 PC-98 平台的原版游戏，恢复了十六位 DOS 时代的子弹环计算。

## Frame 7 — 上手
- status: built
- src: compositions/s07.html
- time: 198.10s → 219.51s (21.4s)
- shape: prompt-type-submit-generate (install CTA)
- visual: 三步上手：Node 22+、npx rea-agents setup 打字、四个智能体、确认改动→重启、"本地运行 不上传"徽章
- 知识猫: 右侧举牌"一行命令" → nod
- narration: 上手很简单。 装好 Node 二十二以上的版本，运行 npx rea-agents setup。 选择你用的智能体，Claude Code、Codex、Cursor、Gemini CLI 都支持，确认改动，再重启一下就可以了。 分析全部在本地运行，不会上传你的程序。

## Frame 8 — 提醒与结尾
- status: built
- src: compositions/s08.html
- time: 219.51s → 240.74s (21.2s)
- shape: close-frame (BlockFrame inverted closer)
- visual: 三张提醒卡（合法 / 影响 / 授权）→ 黑底白边黄阴影收尾卡 REA + github.com/morluto/rea + 我们下期见；末尾淡出
- 知识猫: shake → happy → wave+气泡"下期见！" → exit
- narration: 最后提醒两句。 逆向工具是把双刃剑，只分析你有权分析的软件。 运行时捕获会真的执行目标程序，要留意它的影响；IDA、Hopper 这类商业工具，也需要合法授权。 好了，这期就到这里。 我是知识猫，我们下期见。

## Layer — 知识猫（全片）
- src: compositions/mascot.html（由 `mascot/script.json` 生成，嘴型 = 旁白音量包络，30fps 采样）
- track: 20（最上层）
