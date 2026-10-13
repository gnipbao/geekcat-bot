#!/usr/bin/env node
// IP 角色适配层：读取工程里的 ip.json，执行其中的命令模板。换 IP = 换 ip.json，流程不变。
// 用法：node ip.mjs <list|validate|layer|still|info> [--script mascot/script.json] [--out compositions/mascot.html] [--at 1.5] [--dir covers/ip]
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2), action = argv[0]
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1] }
const ipFile = path.resolve(opt('ip', 'ip.json'))
if (!fs.existsSync(ipFile)) { console.error(`✗ 找不到 ${ipFile}。从 <skill>/templates/ip/ 复制一份并改成你的角色`); process.exit(1) }
const ip = JSON.parse(fs.readFileSync(ipFile, 'utf8'))
// 角色仓库定位：ip.json 里写的路径存在就用它 → 环境变量（如 GEEKCAT_REPO）→ skill 所在的仓库（skill 放在角色仓库的 skills/ 下时）
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function resolveRepo() {
  const cands = [ip.repo, ip.repoEnv && process.env[ip.repoEnv], path.resolve(SKILL, '../..')].filter(Boolean)
  const probe = ip.repoProbe || ''
  const hit = cands.find(r => fs.existsSync(r) && (!probe || fs.existsSync(path.join(r, probe))))
  if (!hit) { console.error(`✗ 找不到 ${ip.name} 的仓库。在 ip.json 写 "repo"，或设置环境变量 ${ip.repoEnv || 'IP_REPO'}`); process.exit(1) }
  return hit
}
const vars = { repo: resolveRepo(), id: ip.id, script: path.resolve(opt('script', 'mascot/script.json')), out: path.resolve(opt('out', `compositions/${ip.id}.html`)), at: opt('at', '1'), dir: path.resolve(opt('dir', 'covers/ip')) }
const fill = s => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
if (action === 'info') { console.log(JSON.stringify({ ...ip, repo: vars.repo, scriptSchema: ip.scriptSchema && fill(ip.scriptSchema), guide: ip.guide && fill(ip.guide) }, null, 2)); process.exit(0) }
const tpl = action === 'setup' ? ip.setup : ip.commands && ip.commands[action]
if (!tpl) { console.error(`✗ ${ip.name} 的 ip.json 没有定义命令 "${action}"（可用：${Object.keys(ip.commands || {}).join(', ')}, info）`); process.exit(1) }
try { process.stdout.write(execSync(fill(tpl), { stdio: ['ignore', 'pipe', 'inherit'] })) }
catch (e) { console.error(`✗ ${ip.name} · ${action} 失败：${fill(tpl)}`); process.exit(1) }
