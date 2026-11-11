#!/usr/bin/env python3
"""口播节奏：把旁白里的停顿压紧（可选再整体提一点速），让 TTS 听起来像博主对着镜头说话，而不是朗读。

用法：python3 tighten.py <工程> [--sentence 0.28] [--comma 0.16] [--scene 0.4] [--lead 0.25] [--long 1.2] [--speed 1.0]

- 只动"没有声音的空档"：句号 / 问号后的停顿压到 --sentence 秒，逗号后压到 --comma 秒，场景之间压到 --scene 秒，开头留 --lead 秒。
  只剪真正没声音的那一段（按实际音量找静音，不只信时间戳），两头各留 30 毫秒，不会剪到字尾和起音；比这些值短的停顿原样不动。
- 超过 --long 秒的停顿当作故意留的（等演示、卖关子），默认不动；--long 0 表示全部都压。
- --speed：整体变速（保持音调）。克隆声音偏慢时 1.05–1.12 比较自然；已经在 tts.py 里用 --speed 调过就不要再叠。
- 原始文件备份在 narration/raw/，重复运行总是从 raw 重新算（改参数重跑不会越压越紧）。
- 产物：narration-full.mp3、words.json、scenes.json、narration.srt 全部换成新时间轴。之后重跑 captions.py；
  如果场景已经按旧时间写好了，再跑 retime.py <工程> --old-srt narration/raw/narration.srt 把场景时间搬过来。
"""
import argparse, json, os, shutil, subprocess, sys, wave
from array import array

SENT, COMMA = set('。！？!?；;…'), set('，、：,:')


def run(*a):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, a)], capture_output=True, text=True)
    if r.returncode: sys.exit('✗ ffmpeg 失败：\n' + r.stderr[-1200:])


def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project'); ap.add_argument('--sentence', type=float, default=0.28); ap.add_argument('--comma', type=float, default=0.16)
    ap.add_argument('--scene', type=float, default=0.4); ap.add_argument('--lead', type=float, default=0.25); ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--long', type=float, default=1.2)
    a = ap.parse_args()
    NA = os.path.join(os.path.abspath(a.project), 'narration'); RAW = os.path.join(NA, 'raw')
    names = ['narration-full.mp3', 'words.json', 'scenes.json', 'narration.srt']
    if not os.path.exists(os.path.join(RAW, 'words.json')):
        os.makedirs(RAW, exist_ok=True)
        for n in names:
            if os.path.exists(os.path.join(NA, n)): shutil.copy2(os.path.join(NA, n), os.path.join(RAW, n))
    words = json.load(open(os.path.join(RAW, 'words.json'))); scenes = json.load(open(os.path.join(RAW, 'scenes.json')))
    if not words: sys.exit('✗ words.json 是空的')
    wav = os.path.join(RAW, 'voice.wav'); run('-i', os.path.join(RAW, 'narration-full.mp3'), '-ac', 1, '-ar', 48000, wav)
    with wave.open(wav) as w: sr = w.getframerate(); pcm = array('h'); pcm.frombytes(w.readframes(w.getnframes()))
    D = len(pcm) / sr
    scene_starts = sorted(s['start'] for s in scenes[1:])

    # 每个空档：[上一个字结束, 下一个字开始]，按它后面的标点 / 是否跨场景决定压到多长
    # 10 毫秒一格的音量，用来找真正的静音
    hop = sr // 100
    rms = [(sum(v * v for v in pcm[i:i + hop]) / hop) ** 0.5 for i in range(0, len(pcm) - hop + 1, hop)]
    thr = max(60.0, sorted(rms)[int(len(rms) * 0.9)] * 0.035)      # 比响的部分低约 29 dB 算静音

    def quiet(x, y):
        """[x, y] 附近最长的一段静音（秒）"""
        i0, i1 = max(0, int((x - 0.06) * 100)), min(len(rms), int((y + 0.06) * 100))
        best, st = (0, 0), None
        for i in range(i0, i1 + 1):
            if i < i1 and rms[i] < thr:
                if st is None: st = i
            elif st is not None:
                if i - st > best[1] - best[0]: best = (st, i)
                st = None
        return best[0] / 100, best[1] / 100

    keep, cur, kept_long = [], max(0.0, words[0]['t'] - a.lead), 0
    for i in range(len(words) - 1):
        x, y = words[i]['e'], words[i + 1]['t']; g = y - x
        if g <= 0.02: continue
        if a.long and g >= a.long: kept_long += 1; continue
        tail = words[i]['w'][-1:] if words[i]['w'] else ''
        target = a.scene if any(x - 0.05 <= s <= y + 0.05 for s in scene_starts) else a.sentence if tail in SENT else a.comma if tail in COMMA else min(g, 0.12)
        if g <= target + 0.04: continue
        qx, qy = quiet(x, y)
        room = (qy - qx) - 0.06                              # 静音两头各留 30 毫秒
        cut = min(g - target, room)
        if cut < 0.04: continue
        c0 = qx + 0.03 + (room - cut) * 0.45                 # 剪掉的那段放在静音中间偏前：前面留尾音，后面留气口
        keep.append((cur, c0)); cur = c0 + cut
    keep.append((cur, min(D, words[-1]['e'] + 0.5)))

    out, segs, t = array('h'), [], 0.0
    fade = int(sr * 0.004)
    for x, y in keep:
        i0, i1 = int(x * sr), int(y * sr); chunk = pcm[i0:i1]
        for k in range(min(fade, len(chunk) // 2)):          # 4 毫秒淡入淡出，接缝不"噗"
            chunk[k] = int(chunk[k] * k / fade); chunk[-1 - k] = int(chunk[-1 - k] * k / fade)
        segs.append((x, y, t)); out.extend(chunk); t += len(chunk) / sr
    cut = os.path.join(RAW, 'voice.tight.wav')
    with wave.open(cut, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(out.tobytes())
    sp = a.speed
    run('-i', cut, *(['-af', f'atempo={sp}'] if abs(sp - 1) > 1e-3 else []), '-ar', 48000, '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(NA, 'narration-full.mp3'))
    for f in (wav, cut): os.remove(f)

    def m(x):
        for a0, b0, o in segs:
            if x <= b0: return round((o + max(0.0, x - a0)) / sp, 3)
        a0, b0, o = segs[-1]; return round((o + (b0 - a0)) / sp, 3)
    total = round(t / sp, 3)
    for w_ in words: w_['t'], w_['e'] = m(w_['t']), m(w_['e'])
    for i, s in enumerate(scenes):
        for c in s.get('cues', []): c['t'], c['e'] = m(c['t']), m(c['e'])
        s['start'] = 0.0 if i == 0 and s['start'] <= 0.01 else m(s['start'])
    for i, s in enumerate(scenes):
        s['end'] = scenes[i + 1]['start'] if i + 1 < len(scenes) else (m(s['end']) if 'end' in s else total)
        s['dur'] = round(s['end'] - s['start'], 3)
    json.dump(words, open(os.path.join(NA, 'words.json'), 'w'), ensure_ascii=False)
    json.dump(scenes, open(os.path.join(NA, 'scenes.json'), 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(NA, 'narration.srt'), 'w', encoding='utf-8') as f:
        n = 0
        for s in scenes:
            for c in s.get('cues', []): n += 1; f.write(f"{n}\n{ts(c['t'])} --> {ts(c['e'])}\n{c['text']}\n\n")
    chars = sum(len([ch for ch in w_['w'] if ch.isalnum()]) for w_ in words)
    print(json.dumps({'ok': True, 'before': round(D, 2), 'after': total, 'pauses_cut': len(keep) - 1, 'long_pauses_kept': kept_long, 'seconds_saved': round(D - total, 2), 'speed': sp,
                      'chars_per_min': round(chars / total * 60), 'next': ['captions.py', 'retime.py --old-srt narration/raw/narration.srt（场景已经写好时）']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
