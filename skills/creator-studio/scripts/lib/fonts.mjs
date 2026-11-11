// 字体：全部是 OFL，渲染不依赖系统字体和网络。工程 assets/fonts 优先，其次本机缓存（只下载一次）。
// 命令行：node fonts.mjs fetch <工程的 assets/fonts 目录>   → 缺的先下到缓存，再拷进工程
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GH = 'https://cdn.jsdelivr.net/gh'
// [字体名, 文件, 字重, 下载地址]
export const FONTS = [
  ['Noto Sans SC', 'NotoSansSC-Regular.otf', 400, `${GH}/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf`],
  ['Noto Sans SC', 'NotoSansSC-Bold.otf', 700, `${GH}/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf`],
  ['Noto Sans SC', 'NotoSansSC-Black.otf', 900, `${GH}/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Black.otf`],
  ['Space Grotesk', 'SpaceGrotesk-Variable.ttf', '300 700', `${GH}/google/fonts@main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf`],
  ['Inter', 'Inter-Variable.ttf', '100 900', `${GH}/google/fonts@main/ofl/inter/Inter%5Bopsz,wght%5D.ttf`],
  ['Inter Tight', 'InterTight-Variable.ttf', '100 900', `${GH}/google/fonts@main/ofl/intertight/InterTight%5Bwght%5D.ttf`],
  ['JetBrains Mono', 'JetBrainsMono-Variable.ttf', '100 800', `${GH}/google/fonts@main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf`],
  ['Caveat', 'Caveat-Variable.ttf', '400 700', `${GH}/google/fonts@main/ofl/caveat/Caveat%5Bwght%5D.ttf`],
  ['Long Cang', 'LongCang-Regular.ttf', 400, `${GH}/google/fonts@main/ofl/longcang/LongCang-Regular.ttf`],
  ['Geist', 'Geist-Variable.ttf', '100 900', `${GH}/google/fonts@main/ofl/geist/Geist%5Bwght%5D.ttf`],
  ['Smiley Sans', 'SmileySans-Oblique.ttf', 400, 'https://cdn.jsdelivr.net/npm/@fontpkg/smiley-sans@2.0.4/SmileySans-Oblique.ttf'],   // 得意黑，OFL
]
const LICENSE = ['OFL.txt', `${GH}/notofonts/noto-cjk@main/Sans/LICENSE`]

// 本机缓存：新名字优先；ip-explainer-video 时代的缓存和环境变量继续认
export function cacheDirs() {
  return [process.env.CREATOR_STUDIO_FONT_CACHE, path.join(os.homedir(), '.cache/creator-studio/fonts'),
    process.env.IP_EXPLAINER_FONT_CACHE, path.join(os.homedir(), '.cache/ip-explainer-video/fonts')].filter(Boolean)
}
export function fontDirs(root) { return [root && path.join(root, 'assets/fonts'), ...cacheDirs()].filter(Boolean) }
export function findFont(file, root) {
  for (const d of fontDirs(root)) { const f = path.join(d, file); if (fs.existsSync(f) && fs.statSync(f).size > 1000) return f }
  return null
}

// @font-face 规则。base：相对地址前缀（子合成用 '../'，根用 ''）；不传 base 时用 file:// 绝对路径（封面、对比图截图用）
export function fontFaceCSS({ root, base } = {}) {
  return FONTS.map(([fam, file, w]) => {
    const local = root && path.join(root, 'assets/fonts', file)
    if (base != null) return local && fs.existsSync(local) ? `@font-face { font-family: "${fam}"; src: url("${base}assets/fonts/${file}"); font-weight: ${w}; font-style: normal; }` : ''
    const f = findFont(file, root)
    return f ? `@font-face { font-family: "${fam}"; src: url("file://${f}"); font-weight: ${w}; font-style: normal; }` : ''
  }).filter(Boolean).join('\n')
}

// 缺的字体先下到缓存，再拷进工程（init 时调用）
export function fetchFonts(dest) {
  const cache = cacheDirs()[0] || path.join(os.homedir(), '.cache/creator-studio/fonts')
  fs.mkdirSync(cache, { recursive: true }); if (dest) fs.mkdirSync(dest, { recursive: true })
  const failed = []
  for (const [, file, , url] of [...FONTS, [null, ...LICENSE.slice(0, 1), null, LICENSE[1]]]) {
    let src = findFont(file)
    if (!src) {
      const out = path.join(cache, file)
      try { execFileSync('curl', ['-sSL', '--fail', '--retry', '4', '--retry-all-errors', '--retry-delay', '2', '-o', out, url], { stdio: 'ignore' }); src = out }
      catch { fs.rmSync(out, { force: true }); failed.push(file); continue }
    }
    if (dest && !fs.existsSync(path.join(dest, file))) fs.copyFileSync(src, path.join(dest, file))
  }
  return { cache, failed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, dest] = process.argv.slice(2)
  if (cmd !== 'fetch') { console.error('用法：node fonts.mjs fetch [assets/fonts 目录]'); process.exit(1) }
  const r = fetchFonts(dest && path.resolve(dest))
  if (r.failed.length) console.error(`! 字体下载失败：${r.failed.join(', ')}（稍后重跑，或手动放进 ${r.cache}）`)
  console.log(JSON.stringify({ ok: !r.failed.length, cache: r.cache, failed: r.failed }))
}
