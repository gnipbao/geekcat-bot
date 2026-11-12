#!/usr/bin/env python3
"""底部字幕：narration/scenes.json + words.json → narration/captions.json（每屏 ≤ N 字，逐字时间）

用法：python3 captions.py <project> [--max 18] [--out 另存的 json]（竖版用 --max 12；给了 --out 就不改工程里的 captions.json / .srt）

- 句子文本来自 tts.py 的逐句字幕，逐字时间来自接口的逐字时间戳，两者同源，逐字精确。
- 长句优先在标点处断开，其次只在词和词之间断（macOS 用系统分词 footage/segment.swift，别的系统按虚词规则避开"的了吗"开头、"一把在"结尾），几屏尽量一样长；行尾的 ，。、；： 去掉，？！ 保留（中文字幕惯例）。
- 每屏带一个 br：逐词弹跳字幕（captionStyle.look = "pop"）把一屏拆成两行时从哪个字开始是第二行。
- 英文按单词不拆开，宽度按半个汉字计。
build.mjs 发现 narration/captions.json 且 video.json 没有关闭 captions 时，会生成字幕图层。
"""
import argparse, json, math, os, re, shutil, subprocess, sys

BREAK = set('，。！？、；：,.!?;:')
DROP_TAIL = set('，。、；：,.;:')

def is_cjk(ch): return '⺀' <= ch <= '鿿' or '豈' <= ch <= '﫿'
def width(s): return sum(1 if is_cjk(c) else (0.5 if c.strip() else 0.3) for c in s)

HERE = os.path.dirname(os.path.abspath(__file__))
TAIL_BIND = set('的了着过吗呢吧啊么们得地')                       # 不能放在一屏开头的字
HEAD_BIND = set('一二两三四五六七八九十百千万亿几每这那把被和与在是不没很就都也从再给让跟对')   # 后面还跟着东西的字，尽量不放在一屏末尾

def word_starts(texts):
    """每句话里"一个词的开头"在第几个字（只数字母数字汉字）。macOS 用系统分词（footage/segment.swift）；没有就返回 None"""
    src = os.path.join(HERE, 'footage', 'segment.swift')
    if sys.platform != 'darwin' or not shutil.which('swift') or not os.path.exists(src) or not texts: return None
    try:
        r = subprocess.run(['swift', src, *texts], capture_output=True, text=True, timeout=180)
    except Exception: return None
    lines = r.stdout.split('\n')
    if r.returncode or len(lines) < len(texts): return None
    out = []
    for text, line in zip(texts, lines):
        pos, k = set(), 0
        for tok in line.split('\x1f'):
            pos.add(k); k += sum(1 for c in tok if c.isalnum())
        out.append(pos if k == sum(1 for c in text if c.isalnum()) else None)   # 对不上就不用
    return out

def break_penalty(chars, i, starts):
    """在 chars[i] 前面断开要付的代价；None = 不能在这里断"""
    prev, nxt = chars[i - 1][0], chars[i][0]
    if nxt in BREAK or not nxt.strip(): return None                 # 一屏开头不放标点、空白
    if prev in BREAK: return -2.0                                   # 标点后面断最自然
    if prev.isascii() and prev.isalnum() and nxt.isascii() and nxt.isalnum(): return None   # 不拆英文单词、数字
    if starts is not None and nxt.isalnum() and sum(1 for c in chars[:i] if c[0].isalnum()) not in starts: return None   # 不在词中间断
    return (2.5 if nxt in TAIL_BIND else 0.0) + (1.2 if prev in HEAD_BIND else 0.0)

def shown(chars):
    a = [c[0] for c in chars]
    while a and (a[-1] in DROP_TAIL or not a[-1].strip()): a.pop()
    while a and (not a[0].strip() or a[0] in BREAK): a.pop(0)
    return ''.join(a)

def split_cue(chars, maxw, starts):
    """把一句话切成每屏 ≤ maxw 的几段：只在词之间断，标点处优先，几段差不多长。返回切点列表"""
    n, total = len(chars), width(shown(chars))
    pens = {i: break_penalty(chars, i, starts) for i in range(1, n)}
    if total <= maxw:                                               # 放得下：只有标点两边都够长才断开
        cuts = [i for i in range(1, n) if pens[i] == -2.0 and width(shown(chars[:i])) >= maxw * 0.45 and width(shown(chars[i:])) >= maxw * 0.45]
        return cuts[:1]
    target = total / math.ceil(total / maxw)
    def solve(strict):
        best = {0: (0.0, None)}
        for j in range(1, n + 1):
            pj = 0.0 if j == n else pens[j]
            if pj is None:
                if strict: continue
                pj = 6.0
            for i in sorted(best):
                if i >= j: break
                w = width(shown(chars[i:j]))
                if w > maxw or w == 0: continue
                cost = best[i][0] + ((w - target) / target) ** 2 * 2 + pj + (1.5 if w < 2 else 0)
                if j not in best or cost < best[j][0]: best[j] = (cost, i)
        return best
    best = solve(True)
    if n not in best: best = solve(False)
    if n not in best: return [i for i in range(1, n) if width(shown(chars[:i])) % maxw < 1][:0]   # 实在切不了就整句
    cuts, j = [], n
    while best[j][1] is not None:
        j = best[j][1]
        if j: cuts.append(j)
    return sorted(cuts)

def two_line_break(chars, starts):
    """逐词弹跳字幕把一屏拆成两行：从哪个字开始是第二行（0 = 不拆）"""
    total = width(shown(chars))
    if total <= 4.5: return 0
    best, at = 1e9, 0
    for i in range(1, len(chars)):
        p = break_penalty(chars, i, starts)
        if p is None: continue
        cost = abs(width(shown(chars[:i])) - total / 2) / total * 4 + max(p, 0)
        if cost < best: best, at = cost, i
    return at

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('project'); ap.add_argument('--max', type=float, default=18); ap.add_argument('--out')
    a = ap.parse_args(); P = os.path.abspath(a.project)
    scenes = json.load(open(os.path.join(P, 'narration/scenes.json')))
    words = json.load(open(os.path.join(P, 'narration/words.json')))
    # 逐字时间线（只含字母数字汉字）
    tl = []
    for w in words:
        cs = [c for c in w['w'] if c.isalnum()]; n = max(1, len(cs))
        for i, c in enumerate(cs): tl.append((c.lower(), w['t'] + (w['e'] - w['t']) * i / n, w['t'] + (w['e'] - w['t']) * (i + 1) / n))
    k = 0
    segs = []
    cues = [cue for sc in scenes for cue in sc['cues']]
    starts_all = word_starts([cue['text'].strip() for cue in cues])
    for ci, cue in enumerate(cues):
        # 显示字符 → 时间（标点没有时间）
        chars = []
        for c in cue['text'].strip():
            if c.isalnum():
                # 容错：跳过时间线里对不上的字
                while k < len(tl) and tl[k][0] != c.lower(): k += 1
                if k < len(tl): chars.append([c, tl[k][1], tl[k][2]]); k += 1
                else: chars.append([c, None, None])
            else: chars.append([c, None, None])
        starts = starts_all[ci] if starts_all else None
        cuts = split_cue(chars, a.max, starts)
        for i, j in zip([0] + cuts, cuts + [len(chars)]):
            ln = list(chars[i:j])
            while ln and (ln[-1][0] in DROP_TAIL or not ln[-1][0].strip()): ln.pop()
            while ln and (not ln[0][0].strip() or ln[0][0] in BREAK): ln.pop(0)      # 行首不留空白和标点
            timed = [x for x in ln if x[1] is not None]
            if not timed: continue
            # 这一段在整句里的词边界（给两行拆分用）
            off = sum(1 for c in chars[:chars.index(ln[0])] if c[0].isalnum())
            sub = None if starts is None else {p - off for p in starts if p >= off}
            segs.append({'t': round(timed[0][1], 3), 'e': round(timed[-1][2], 3), 'text': ''.join(x[0] for x in ln),
                         'chars': [[x[0], None if x[1] is None else round(x[1], 3)] for x in ln], 'br': two_line_break(ln, sub)})
    # 每屏停留到下一屏开始前（最多多留 0.6 秒），避免字幕闪烁
    for i, s in enumerate(segs):
        nxt = segs[i + 1]['t'] if i + 1 < len(segs) else s['e'] + 0.6
        s['hold'] = round(min(nxt, s['e'] + 0.6), 3)
    if a.out:
        json.dump(segs, open(a.out, 'w'), ensure_ascii=False)
        print(json.dumps({'ok': True, 'captions': len(segs), 'output': [a.out]}, ensure_ascii=False)); return
    json.dump(segs, open(os.path.join(P, 'narration/captions.json'), 'w'), ensure_ascii=False, indent=1)
    # 同时导出短句版 SRT：YouTube 上传 CC 字幕用（画面不烧字幕的版本）
    def ts(x):
        ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s_, ms = divmod(ms, 1000)
        return f'{h:02d}:{m:02d}:{s_:02d},{ms:03d}'
    with open(os.path.join(P, 'narration/captions.srt'), 'w', encoding='utf-8') as f:
        for i, s in enumerate(segs, 1): f.write(f"{i}\n{ts(s['t'])} --> {ts(s['hold'])}\n{s['text']}\n\n")
    longest = max(segs, key=lambda s: width(s['text']))
    print(json.dumps({'ok': True, 'captions': len(segs), 'longest': longest['text'], 'output': ['narration/captions.json', 'narration/captions.srt']}, ensure_ascii=False))

if __name__ == '__main__':
    main()
