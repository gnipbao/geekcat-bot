// 主题：kit/base.css（结构 + 默认变量）+ themes/<name>/theme.css（变量 + 覆盖）+ theme.json（底色序列、字幕、主讲边框、封面版式）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const THEMES = fs.readdirSync(path.join(SKILL, 'themes')).filter(n => fs.existsSync(path.join(SKILL, 'themes', n, 'theme.json'))).sort()

export function loadTheme(name = 'pop') {
  if (!THEMES.includes(name)) throw new Error(`未知主题 "${name}"，可用：${THEMES.join('、')}`)
  const dir = path.join(SKILL, 'themes', name)
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'))
  const base = fs.readFileSync(path.join(SKILL, 'kit/base.css'), 'utf8')
  const own = fs.readFileSync(path.join(dir, 'theme.css'), 'utf8')
  return {
    name, json,
    /** 基础原子 + 主题，作用域换成某个图层根节点（'#s03'、'#screen'…） */
    css: scope => (base + '\n' + own).replaceAll('SCOPE', scope),
    /** 第 i 个场景的默认底色 */
    ground: i => json.grounds[i % json.grounds.length],
    /** video.json 里的底色写法：颜色 / 主题命名色 / "none"（透明，露出下面的录屏、人像）/ "invert"（反白） */
    resolveGround(spec, i) {
      if (spec == null) return { color: json.grounds[i % json.grounds.length] }
      if (spec === 'none') return { none: true }
      if (spec === 'invert') return { invert: true }
      const named = json.named && json.named[spec]
      if (named) return { color: named }
      if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(spec) || /^(rgb|hsl)a?\(/i.test(spec)) return { color: spec }
      console.error(`! 底色 "${spec}" 不是颜色，也不是 ${name} 主题的命名色（${Object.keys(json.named || {}).join('、')}），改用默认`)
      return { color: json.grounds[i % json.grounds.length] }
    },
  }
}

/** 卡拉 OK 字幕的外观（结构由 build.mjs 写，外观来自 theme.json.captions） */
export function captionCSS(theme, size, look = 'card') {
  const c = theme.json.captions
  if (look === 'bare') {       // 口播字幕：白字黑描边、没有底板，正在念的字换成主题的花字色
    const b = c.bare || {}, ink = b.color || '#FFFFFF'
    return `#cap-card { display: none; padding: 0 14px; font-family: "Noto Sans SC", sans-serif; font-weight: 900; font-size: ${size}px; line-height: 1.25; letter-spacing: 0.02em; white-space: nowrap; transform-origin: 50% 100%;
          color: ${ink}; -webkit-text-stroke: ${Math.round(size * 0.2)}px ${b.stroke || '#000000'}; paint-order: stroke fill; text-shadow: 0 6px 18px rgba(0,0,0,.45); }
        #cap-card span { color: ${ink}; }
        #cap-card span.s { color: ${ink}; }
        #cap-card span.a { color: ${b.active || '#FFD700'}; }`
  }
  if (look === 'pop') {        // 逐词弹跳字幕：一屏两行，上一行白色、下一行更大并换成强调色，按语音一行一行蹦出来（短视频口播常见的那种）
    const b = c.pop || c.bare || {}, ink = b.color || '#FFFFFF', st = b.stroke || '#000000'
    return `#cap-card { display: none; text-align: center; font-family: "Noto Sans SC", sans-serif; font-weight: 900; white-space: nowrap; letter-spacing: -0.02em; }
        #cap-card div { transform-origin: 50% 70%; line-height: 1.12; paint-order: stroke fill; }
        #cap-card .l1 { font-size: ${Math.round(size * 0.72)}px; color: ${ink}; -webkit-text-stroke: ${Math.round(size * 0.115)}px ${st}; }
        #cap-card .l2 { font-size: ${size}px; color: ${b.active || '#FFE600'}; -webkit-text-stroke: ${Math.round(size * 0.14)}px ${st}; filter: drop-shadow(0 ${Math.round(size * 0.065)}px 0 rgba(0,0,0,.35)); }`
  }
  return `#cap-card { display: none; ${c.card} font-size: ${size}px; line-height: 1.25; letter-spacing: 0.01em; white-space: nowrap; transform-origin: 50% 100%; }
        #cap-card span { ${c.dim} }   /* 未念的字：观众会提前读，不能太淡 */
        #cap-card span.s { ${c.spoken} }
        #cap-card span.a { ${c.active} }`
}
