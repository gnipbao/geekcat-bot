// 无头 Chrome 截图（封面、主题对比图用）。优先 puppeteer / HyperFrames 自带的 chrome-headless-shell，其次系统 Chrome
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

function findShell() {
  const base = path.join(os.homedir(), '.cache/puppeteer/chrome-headless-shell')
  if (!fs.existsSync(base)) return null
  for (const v of fs.readdirSync(base).sort().reverse()) {
    const dir = path.join(base, v)
    for (const sub of fs.readdirSync(dir)) {
      for (const exe of ['chrome-headless-shell', 'chrome-headless-shell.exe']) { const f = path.join(dir, sub, exe); if (fs.existsSync(f)) return f }
    }
  }
  return null
}
export function findChrome() {
  return process.env.CHROME || findShell() || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p)) || null
}
/** HTML 文件 → PNG（W×H）。截图写出来就算成功（个别 Chrome 截完不退出） */
export function screenshot(htmlPath, png, W, H) {
  const chrome = findChrome()
  if (!chrome) throw new Error('找不到 Chrome；设置环境变量 CHROME=/path/to/chrome')
  fs.rmSync(png, { force: true })
  const shell = /headless-shell/.test(chrome)
  try {
    execFileSync(chrome, [...(shell ? [] : ['--headless=new']), '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=3000', `--window-size=${W},${H}`, `--screenshot=${png}`, `file://${htmlPath}`], { stdio: 'ignore', timeout: 60000 })
  } catch (e) { if (!fs.existsSync(png)) throw e }
  return png
}
