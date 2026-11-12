#!/usr/bin/env bash
# 新建一期视频工程：HyperFrames 骨架 + 字体（OFL，本机缓存只下载一次）+ video.json / cover.json / presenter.json 模板
# 用法：new.sh <videos-dir> <slug> [--format explainer|tutorial|talk] [--presenter mascot|camera|avatar|none]
#             [--theme lab|aurora|bento|volt|night|paper|pop|terminal|greenscreen|headline|markup|prompt|cinema] [--platforms bilibili,youtube,douyin,x] [--ip 角色.ip.json] [--vertical]
# 默认：讲解 + 墨墨 + lab；--format tutorial 时默认主题 night、主讲 camera；--format talk 时默认主讲 camera
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:?用法：new.sh <videos-dir> <slug> [--format …] [--presenter …] [--theme …] [--platforms …]}"; SLUG="${2:?缺少 slug}"; shift 2
FORMAT=explainer; PRESENTER=""; THEME=""; VERTICAL=""; PLATFORMS="bilibili,youtube,douyin"; IP="$SKILL/templates/ip/geekcat.ip.json"
while [ $# -gt 0 ]; do
  case "$1" in
    --format) FORMAT="$2"; shift 2;; --presenter) PRESENTER="$2"; shift 2;; --theme) THEME="$2"; shift 2;;
    --platforms) PLATFORMS="$2"; shift 2;; --ip) IP="$2"; shift 2;; --vertical) VERTICAL=1; shift;;
    *) echo "✗ 不认识的参数 $1" >&2; exit 1;;
  esac
done
case "$FORMAT" in explainer|tutorial|talk) ;; *) echo "✗ --format 只能是 explainer / tutorial / talk" >&2; exit 1;; esac
[ -n "$PRESENTER" ] || PRESENTER=$([ "$FORMAT" = explainer ] && echo mascot || echo camera)
case "$PRESENTER" in mascot|camera|avatar|none) ;; *) echo "✗ --presenter 只能是 mascot / camera / avatar / none" >&2; exit 1;; esac
[ -n "$THEME" ] || THEME=$([ "$FORMAT" = tutorial ] && echo night || echo lab)
[ -f "$SKILL/themes/$THEME/theme.json" ] || { echo "✗ 没有主题 $THEME（可用：$(ls "$SKILL/themes" | tr '\n' ' ')）" >&2; exit 1; }

NAME="$(date +%Y%m%d)-$SLUG"; P="$DIR/$NAME"
mkdir -p "$DIR"
( cd "$DIR" && npx --yes hyperframes init "$NAME" --non-interactive --example=blank --skill=general-video >/dev/null )
mkdir -p "$P"/{build/scenes,narration,presenter,covers,renders,assets/fonts}
[ "$FORMAT" = explainer ] || mkdir -p "$P/footage"
[ "$PRESENTER" = mascot ] && mkdir -p "$P/mascot"
cp "$SKILL/templates/project/cover.json" "$P/"
[ "$FORMAT" = tutorial ] && cp "$SKILL/templates/project/screen.json" "$P/screen.json.example"
[ "$PRESENTER" = camera ] || [ "$PRESENTER" = avatar ] && cp "$SKILL/templates/project/track.json" "$P/presenter/track.json.example"

# video.json 和 presenter.json
node - "$SKILL" "$P" "$FORMAT" "$THEME" "$PLATFORMS" "$PRESENTER" "$IP" "$VERTICAL" <<'EOF'
const fs = require('fs'), path = require('path')
const [SKILL, P, format, theme, platforms, presenter, ipFile, vertical] = process.argv.slice(2)
const v = JSON.parse(fs.readFileSync(path.join(SKILL, 'templates/project/video.json'), 'utf8'))
Object.assign(v, { format, theme, platforms: platforms.split(',').map(s => s.trim()).filter(Boolean) })
if (format !== 'explainer') v.fps = 30
// --vertical：竖版原生工程（1080×1920，场景直接按竖屏写；抖音 / 小红书是主战场时用，见 references/platforms.md）
if (vertical) Object.assign(v, { width: 1080, height: 1920, fps: 30, chapters: false })
let pr
if (presenter === 'mascot') {
  const ip = JSON.parse(fs.readFileSync(ipFile, 'utf8'))
  pr = { kind: 'mascot', ...ip }
  v.ip = { id: ip.id, src: `compositions/${ip.id}.html` }
  v.title = `<主题> — ${ip.name}`
} else if (presenter === 'none') pr = { kind: 'none' }
else pr = JSON.parse(fs.readFileSync(path.join(SKILL, `templates/presenter/${presenter}.json`), 'utf8'))
fs.writeFileSync(path.join(P, 'video.json'), JSON.stringify(v, null, 2) + '\n')
fs.writeFileSync(path.join(P, 'presenter.json'), JSON.stringify(pr, null, 2) + '\n')
EOF

# 字体（缺的先下到 ~/.cache/creator-studio/fonts，再拷进工程）
node "$SKILL/scripts/lib/fonts.mjs" fetch "$P/assets/fonts" >/dev/null || echo "! 部分字体下载失败，稍后重跑：node $SKILL/scripts/lib/fonts.mjs fetch $P/assets/fonts" >&2
# IP 角色依赖（首次使用时安装）
if [ "$PRESENTER" = mascot ]; then node "$SKILL/scripts/ip.mjs" setup --ip "$P/presenter.json" >/dev/null || echo "! IP 角色依赖安装失败，见 presenter.json 的 setup" >&2; fi
echo "{\"ok\":true,\"project\":\"$P\",\"format\":\"$FORMAT\",\"presenter\":\"$PRESENTER\",\"theme\":\"$THEME\",\"platforms\":\"$PLATFORMS\"}"
