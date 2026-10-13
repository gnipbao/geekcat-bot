#!/usr/bin/env bash
# 新建一期 IP 主讲讲解视频工程
# 用法：init-project.sh <videos-dir> <slug> [ip.json]
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:?用法：init-project.sh <videos-dir> <slug> [ip.json]}"; SLUG="${2:?缺少 slug}"; IP="${3:-$SKILL/templates/ip/geekcat.ip.json}"
NAME="$(date +%Y%m%d)-$SLUG"; P="$DIR/$NAME"
mkdir -p "$DIR"
( cd "$DIR" && npx --yes hyperframes init "$NAME" --non-interactive --example=blank --skill=general-video >/dev/null )
mkdir -p "$P"/{build/scenes,narration,mascot,terminal,assets/fonts,covers,renders}
cp "$SKILL/templates/project/video.json" "$SKILL/templates/project/cover.json" "$P/"
cp "$IP" "$P/ip.json"
# 字体：Noto Sans SC 400/700/900 + Space Grotesk（OFL），渲染不依赖系统字体和网络。先查本机缓存，只下载一次
F="$P/assets/fonts"; CACHE="${IP_EXPLAINER_FONT_CACHE:-$HOME/.cache/ip-explainer-video/fonts}"; CDN="https://cdn.jsdelivr.net/gh"
mkdir -p "$CACHE"
fetch() { [ -s "$CACHE/$1" ] || curl -sSL --fail --retry 4 --retry-all-errors --retry-delay 2 -o "$CACHE/$1" "$2" || { rm -f "$CACHE/$1"; echo "! 字体下载失败：$1（稍后重跑 init-project.sh 或手动放进 $CACHE）" >&2; return 0; }; }
for w in Regular Bold Black; do fetch "NotoSansSC-$w.otf" "$CDN/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-$w.otf"; done
fetch "SpaceGrotesk-Variable.ttf" "$CDN/google/fonts@main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf"
fetch "OFL.txt" "$CDN/notofonts/noto-cjk@main/Sans/LICENSE"
cp "$CACHE"/* "$F"/ 2>/dev/null || true
# IP 角色依赖（首次使用时安装）
node "$SKILL/scripts/ip.mjs" setup --ip "$P/ip.json" >/dev/null || echo "! IP 角色依赖安装失败，见 ip.json 的 setup" >&2
echo "{\"ok\":true,\"project\":\"$P\",\"ip\":\"$(python3 -c "import json;print(json.load(open('$P/ip.json'))['name'])")\"}"
