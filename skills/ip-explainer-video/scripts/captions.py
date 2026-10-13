#!/usr/bin/env python3
"""底部字幕：narration/scenes.json + words.json → narration/captions.json（每屏 ≤ N 字，逐字时间）

用法：python3 captions.py <project> [--max 18]

- 句子文本来自 tts.py 的逐句字幕，逐字时间来自接口的逐字时间戳，两者同源，逐字精确。
- 长句优先在标点处断开；行尾的 ，。、；： 去掉，？！ 保留（中文字幕惯例）。
- 英文按单词不拆开，宽度按半个汉字计。
build.mjs 发现 narration/captions.json 且 video.json 没有关闭 captions 时，会生成字幕图层。
"""
import argparse, json, os, re

BREAK = set('，。！？、；：,.!?;:')
DROP_TAIL = set('，。、；：,.;:')

def is_cjk(ch): return '⺀' <= ch <= '鿿' or '豈' <= ch <= '﫿'
def width(s): return sum(1 if is_cjk(c) else (0.5 if c.strip() else 0.3) for c in s)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('project'); ap.add_argument('--max', type=float, default=18)
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
    for sc in scenes:
        for cue in sc['cues']:
            # 显示字符 → 时间（标点没有时间）
            chars = []
            for c in cue['text'].strip():
                if c.isalnum():
                    # 容错：跳过时间线里对不上的字
                    while k < len(tl) and tl[k][0] != c.lower(): k += 1
                    if k < len(tl): chars.append([c, tl[k][1], tl[k][2]]); k += 1
                    else: chars.append([c, None, None])
                else: chars.append([c, None, None])
            # 切成每屏 ≤ max：优先标点处，其次英文单词边界
            lines, cur = [], []
            def flush():
                while cur and cur[-1][0] in DROP_TAIL or (cur and not cur[-1][0].strip()): cur.pop()
                while cur and not cur[0][0].strip(): cur.pop(0)
                if any(x[1] is not None for x in cur): lines.append(list(cur))
                cur.clear()
            for i, ch in enumerate(chars):
                cur.append(ch)
                text = ''.join(x[0] for x in cur)
                if ch[0] in BREAK and width(text) >= a.max * 0.45: flush(); continue
                if width(text) >= a.max:
                    # 回退到最近的标点或空格，避免把英文单词拆开
                    puncts = [j for j, x in enumerate(cur) if x[0] in BREAK]
                    cut = max(puncts) if puncts else max([j for j, x in enumerate(cur) if x[0] == ' '] or [-1])   # 优先标点，其次空格
                    if 0 < cut < len(cur) - 1:
                        rest = cur[cut + 1:]; del cur[cut + 1:]; flush(); cur.extend(rest)
                    else: flush()
            flush()
            for ln in lines:
                timed = [x for x in ln if x[1] is not None]
                segs.append({'t': round(timed[0][1], 3), 'e': round(timed[-1][2], 3), 'text': ''.join(x[0] for x in ln),
                             'chars': [[x[0], None if x[1] is None else round(x[1], 3)] for x in ln]})
    # 每屏停留到下一屏开始前（最多多留 0.6 秒），避免字幕闪烁
    for i, s in enumerate(segs):
        nxt = segs[i + 1]['t'] if i + 1 < len(segs) else s['e'] + 0.6
        s['hold'] = round(min(nxt, s['e'] + 0.6), 3)
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
