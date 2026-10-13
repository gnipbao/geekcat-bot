#!/usr/bin/env python3
"""换声音 / 重新配音后，把整个工程的时间点搬到新旁白上（不用改场景代码）

用法：
  python3 retime.py <project> --old-srt narration/v1/narration.srt [--dry-run]

原理：旧字幕（逐句起止）和新旁白的逐字时间戳（narration/words.json，tts.py 生成）按文字逐字对齐，
得到一条单调的"旧时间 → 新时间"映射，然后改写：
  - build/scenes/*.html 里所有 c(<秒>)
  - mascot/script.json 的 timeline[].at 和 duration
  - terminal/runbook.json 的 plan（打字 / 输出的开始时间；时长保留，必要时顺延避免重叠）
  - video.json 的 total（删除，让 build.mjs 按新 scenes.json 计算）
口播稿文字必须和旧版一致（只换声音、语气或语速）；改过文字请重新编排，不要用这个工具。
"""
import argparse, bisect, difflib, json, os, re, shutil, sys

def norm_chars(s):
    return [ch.lower() for ch in s if ch.isalnum()]

def parse_srt(path):
    def ts(x):
        h, m, r = x.strip().split(':'); s, ms = r.split(','); return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000
    out = []
    for block in open(path, encoding='utf-8').read().strip().split('\n\n'):
        lines = block.strip().split('\n')
        if len(lines) < 3 or '-->' not in lines[1]: continue
        a, b = lines[1].split('-->'); out.append((ts(a), ts(b), ''.join(lines[2:])))
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('project'); ap.add_argument('--old-srt', required=True); ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args(); P = os.path.abspath(a.project)
    old = parse_srt(os.path.join(P, a.old_srt) if not os.path.isabs(a.old_srt) else a.old_srt)
    words = json.load(open(os.path.join(P, 'narration/words.json')))
    scenes_new = json.load(open(os.path.join(P, 'narration/scenes.json')))

    # 旧：每个字的起止（句内线性插值）
    o_chars, o_t = [], []
    for s, e, text in old:
        cs = norm_chars(text); n = max(1, len(cs))
        for i, ch in enumerate(cs): o_chars.append(ch); o_t.append((s + (e - s) * i / n, s + (e - s) * (i + 1) / n))
    # 新：接口给的逐字（英文单词按字母均分）
    n_chars, n_t = [], []
    for w in words:
        cs = norm_chars(w['w']); n = max(1, len(cs))
        for i, ch in enumerate(cs): n_chars.append(ch); n_t.append((w['t'] + (w['e'] - w['t']) * i / n, w['t'] + (w['e'] - w['t']) * (i + 1) / n))
    sm = difflib.SequenceMatcher(None, o_chars, n_chars, autojunk=False)
    match = sum(b.size for b in sm.get_matching_blocks())
    ratio = match / max(1, len(o_chars))
    if ratio < 0.9: sys.exit(f'✗ 新旧口播只对上 {ratio:.0%} 的字，文字改动太大，请重新编排而不是 retime')
    anchors = {}
    for b in sm.get_matching_blocks():
        for k in range(b.size):
            i, j = b.a + k, b.b + k
            anchors[o_t[i][0]] = n_t[j][0]; anchors[o_t[i][1]] = n_t[j][1]
    xs = sorted(anchors); ys = [anchors[x] for x in xs]
    for k in range(1, len(ys)): ys[k] = max(ys[k], ys[k - 1])  # 保证单调
    end_old, end_new = old[-1][1], words[-1]['e']

    def warp(t):
        if t <= xs[0]: return max(0.0, t - xs[0] + ys[0]) if t > 0 else t
        if t >= xs[-1]: return t - xs[-1] + ys[-1]
        i = bisect.bisect_right(xs, t) - 1
        x0, x1, y0, y1 = xs[i], xs[i + 1], ys[i], ys[i + 1]
        return y0 + (y1 - y0) * (t - x0) / (x1 - x0) if x1 > x0 else y0
    r3 = lambda v: round(v, 2)
    changes = {}

    # 场景源：c(<秒>)
    sdir = os.path.join(P, 'build/scenes')
    for f in sorted(os.listdir(sdir)) if os.path.isdir(sdir) else []:
        if not f.endswith('.html'): continue
        p = os.path.join(sdir, f); s = open(p, encoding='utf-8').read()
        n = [0]
        def rep(m):
            n[0] += 1; return f'c({r3(warp(float(m.group(1))))})'
        s2 = re.sub(r'\bc\((\d+(?:\.\d+)?)\)', rep, s)
        changes[f'build/scenes/{f}'] = n[0]
        if not a.dry_run: open(p, 'w', encoding='utf-8').write(s2)

    total_new = round(scenes_new[-1]['end'] + 0.6, 3)
    # 角色剧本
    mp = os.path.join(P, 'mascot/script.json')
    if os.path.exists(mp):
        m = json.load(open(mp)); k = 0
        for e in m.get('timeline', []):
            if 'at' in e and e['at'] > 0: e['at'] = r3(warp(e['at'])); k += 1
        # 结尾动作（退场）不能超过新时长
        for e in m.get('timeline', []):
            if e.get('at', 0) > total_new - 0.4: e['at'] = r3(total_new - 0.9)
        m['duration'] = total_new; changes['mascot/script.json'] = k
        if not a.dry_run: json.dump(m, open(mp, 'w'), ensure_ascii=False, indent=2)
    # 终端演示计划
    rp = os.path.join(P, 'terminal/runbook.json')
    if os.path.exists(rp):
        rb = json.load(open(rp)); plan, last = [], -1
        for ty, td, os_, od in rb.get('plan', []):
            nty = max(r3(warp(ty)), last + 0.2); nos = max(r3(warp(os_)), nty + td + 0.2)
            plan.append([r3(nty), td, r3(nos), od]); last = nos + od
        rb['plan'] = plan; changes['terminal/runbook.json'] = len(plan)
        if not a.dry_run: json.dump(rb, open(rp, 'w'), ensure_ascii=False, indent=2)
    # 工程总时长交给 build.mjs 计算
    vp = os.path.join(P, 'video.json')
    if os.path.exists(vp):
        v = json.load(open(vp))
        if 'total' in v:
            v.pop('total'); changes['video.json'] = 'total → auto'
            if not a.dry_run: json.dump(v, open(vp, 'w'), ensure_ascii=False, indent=2)
    print(json.dumps({'ok': True, 'matched': f'{ratio:.1%}', 'old_end': r3(end_old), 'new_end': r3(end_new), 'new_total': total_new,
                      'sample': {str(t): r3(warp(t)) for t in (3.25, 60.0, 124.1, 200.0)}, 'changes': changes, 'dry_run': a.dry_run}, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main()
