#!/usr/bin/env python3
"""素材先行：录屏 / 摄像头 / 麦克风 → 多轨对齐 → 转写 → 粗剪 → 时间轴契约文件（和 tts.py 的产物同一格式）。

用法：
  python3 ingest.py <工程> --screen 录屏.mov [--camera 摄像头.mp4] [--mic 人声.wav] [--script 稿子.txt]
        [--lang zh] [--model ggml-xxx.bin] [--sync auto|none] [--offset camera=0.42,screen=0]
        [--gap 0.25] [--idle 4] [--speedup 4] [--fps 30] [--no-cut] [--reasr] [--noise -35]
  python3 ingest.py <工程> --screen 录屏.mov --no-voice      # 无声录屏、事后用 TTS 配音：只转成固定帧率，配合 screen.json 的 segments

人声来源：--mic > 摄像头的声音 > 录屏的声音。各轨不是同时开始录的，用 --sync auto（默认）按声音自动对齐，或 --offset 手动给秒数
（offset = 该轨 0 秒落在人声时间轴上的位置）。

粗剪规则（可在工程根目录 cuts.json 里改）：
  - 说话之间的停顿压到约 --gap 秒；开头留 0.3 秒、结尾留 0.5 秒
  - 有录屏时，超过 --idle 秒没说话（多半在等安装、等加载）改成加速播放（至少 --speedup 倍，最长占 3 秒），画面上自动出"⏩ N×"角标
  - cuts.json：{"drop": ["说错的那句", "重复的话#2", [12.3, 14.0]], "dropExtras": true, "fillers": ["嗯", "呃"], "keep": [[a, b]]}
    dropExtras：给了稿子时，删掉稿子里没有的字（重说的前一遍、口误、即兴）；keep：这段时间不压停顿、不加速

产出：
  footage/screen.cut.mp4、footage/camera.cut.mp4   无声、固定帧率、每秒一个关键帧（逐帧 seek 快）
  footage/camera.cut.face.json                       人脸框（macOS Vision），主讲小窗按它居中
  narration/narration-full.mp3                       人声，-16 LUFS
  narration/words.json · scenes.json · captions.json / .srt · transcript.txt（⟨⟩ = 稿子外的字）
  footage/cutlist.json                               剪辑表（源时间 → 成片时间、加速段）
  没有的话顺手写 presenter.json（camera）和 screen.json
"""
import argparse, concurrent.futures as cf, json, os, re, subprocess, sys, wave
from array import array
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'footage'))
from asr import SENT_END, align, ff, find_model, find_phrase, fit_islands, is_break, parse, silences, split_units, sync_offset, to_wav, whisper  # noqa: E402

CACHE = Path.home() / '.cache' / 'creator-studio'


def probe(f):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,width,height', '-of', 'json', str(f)],
                                  capture_output=True, text=True).stdout or '{}')
    st = j.get('streams', [])
    v = next((s for s in st if s['codec_type'] == 'video'), None)
    return dict(path=str(f), dur=float(j.get('format', {}).get('duration', 0)), video=bool(v), audio=any(s['codec_type'] == 'audio' for s in st),
                w=v and v.get('width'), h=v and v.get('height'))


def wav_dur(p):
    with wave.open(str(p)) as w: return w.getnframes() / w.getframerate()


def even(x): return int(x) // 2 * 2


def encode_segment(src, out, ta, src_len, speed, n_frames, fps, scale):
    """源素材 [ta, ta+src_len) → 恰好 n_frames 帧（加速、补帧都在这里），保证每段时长对齐帧网格，多段拼起来不漂"""
    pre = max(0.0, -ta); ta = max(0.0, ta)
    vf = [f'tpad=start_mode=clone:start_duration={pre:.4f}'] if pre > 0 else []
    vf += [f'setpts=(PTS-STARTPTS)/{speed}', f'fps={fps}', 'tpad=stop_mode=clone:stop_duration=3', scale, 'format=yuv420p']
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{ta:.4f}', '-t', f'{max(0.05, src_len - pre):.4f}', '-i', src,
           '-vf', ','.join(vf), '-frames:v', str(n_frames), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-g', str(fps), '-r', str(fps), str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-800:])
    return out


def cut_video(track, segs, off, fps, out, work, max_long):
    """按剪辑表剪一条视频轨：track 的 0 秒在人声时间轴上的 off 秒处"""
    w, h = track['w'] or 1920, track['h'] or 1080
    k = min(1.0, max_long / max(w, h))
    scale = f'scale={even(w * k)}:{even(h * k)}:flags=lanczos' if k < 1 else 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
    tmp = work / ('seg-' + Path(out).stem); tmp.mkdir(exist_ok=True)
    for f in tmp.glob('*.mp4'): f.unlink()
    jobs = []
    with cf.ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 4) // 2)) as ex:
        for i, s in enumerate(segs):
            a, b = s['src']; n = s['frames']
            jobs.append(ex.submit(encode_segment, track['path'], tmp / f'{i:05d}.mp4', a - off, b - a, s['speed'], n, fps, scale))
        files = [j.result() for j in jobs]
    lst = tmp / 'list.txt'; lst.write_text(''.join(f"file '{f}'\n" for f in files))
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', out)
    for f in files: Path(f).unlink()


def loudnorm(src, dst, target=-16):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(src), '-af', f'loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)
    if not m: ff('-i', src, '-af', f'loudnorm=I={target}:TP=-1.5:LRA=11', '-ar', 48000, '-c:a', 'libmp3lame', '-b:a', '192k', dst); return None
    j = json.loads(m.group(0))
    af = (f"loudnorm=I={target}:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
          f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    ff('-i', src, '-af', af, '-ar', 48000, '-c:a', 'libmp3lame', '-b:a', '192k', dst)
    return float(j['input_i'])


def face_box(video):
    exe, src = CACHE / 'face', HERE / 'footage' / 'face.swift'
    try:
        if not exe.exists() or exe.stat().st_mtime < src.stat().st_mtime:
            CACHE.mkdir(parents=True, exist_ok=True)
            subprocess.run(['swiftc', '-O', '-o', str(exe), str(src)], capture_output=True, check=True, timeout=300)
        return json.loads(subprocess.run([str(exe), str(video), '15'], capture_output=True, text=True, timeout=300).stdout)
    except Exception:
        return {'found': 0}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project'); ap.add_argument('--screen'); ap.add_argument('--camera'); ap.add_argument('--mic'); ap.add_argument('--script')
    ap.add_argument('--lang', default='zh'); ap.add_argument('--model'); ap.add_argument('--sync', default='auto'); ap.add_argument('--offset', default='')
    ap.add_argument('--gap', type=float, default=0.25); ap.add_argument('--idle', type=float, default=4.0); ap.add_argument('--speedup', type=float, default=4.0)
    ap.add_argument('--fps', type=int, default=30); ap.add_argument('--no-cut', action='store_true'); ap.add_argument('--reasr', action='store_true')
    ap.add_argument('--noise', type=float, default=-35); ap.add_argument('--no-voice', action='store_true')
    a = ap.parse_args()
    P = Path(a.project).resolve(); FT, NA, WK = P / 'footage', P / 'narration', P / 'footage' / 'work'
    for d in (FT, NA, WK): d.mkdir(parents=True, exist_ok=True)
    tracks = {n: probe(Path(getattr(a, n)).expanduser().resolve()) for n in ('screen', 'camera', 'mic') if getattr(a, n)}
    for n, t in tracks.items():
        if not t['dur']: sys.exit(f'✗ 读不了 --{n}：{t["path"]}')
    if not ({'screen', 'camera'} & set(tracks)): sys.exit('✗ 至少给 --screen 或 --camera')
    warns = []

    if a.no_voice:   # 无声录屏：只转成固定帧率，时间轴来自 tts.py，screen.json 用 segments 对到场景
        t = tracks['screen']; out = FT / 'screen.mp4'
        cut_video(t, [{'src': [0, t['dur']], 'speed': 1, 'frames': int(t['dur'] * a.fps)}], 0, a.fps, out, WK, 2560)
        if not (P / 'screen.json').exists(): (P / 'screen.json').write_text(json.dumps({'src': 'footage/screen.mp4', 'frame': 'window', 'title': '', 'focus': [], 'segments': []}, ensure_ascii=False, indent=2))
        print(json.dumps({'ok': True, 'screen': str(out), 'duration': t['dur'], 'next': 'tts.py 配音后在 screen.json 写 segments'}, ensure_ascii=False)); return

    voice = 'mic' if 'mic' in tracks else ('camera' if tracks.get('camera', {}).get('audio') else 'screen')
    if not tracks.get(voice, {}).get('audio'): sys.exit('✗ 没有可用的人声：给 --mic，或者录屏 / 摄像头要带声音')
    manual = dict((k, float(v)) for k, v in (x.split('=') for x in a.offset.split(',') if '=' in x))
    offsets, sync = {voice: 0.0}, {}
    for n, t in tracks.items():
        if n == voice: continue
        if n in manual: offsets[n] = manual[n]
        elif a.sync == 'auto' and t['audio']:
            off, score = sync_offset(tracks[voice]['path'], t['path']); offsets[n] = off; sync[n] = score
            if score < 0.3: warns.append(f'{n} 和人声自动对齐把握不大（相关 {score}），不对的话用 --offset {n}=秒数')
        else: offsets[n] = 0.0

    # 转写（结果缓存在 footage/work/asr.json，改稿子、改 cuts.json 重跑不会重新转写）
    wav16, wav48 = WK / 'voice16.wav', WK / 'voice48.wav'
    if a.reasr or not wav16.exists(): to_wav(tracks[voice]['path'], wav16, 16000); to_wav(tracks[voice]['path'], wav48, 48000)
    model = find_model(a.model)
    if re.search(r'(small|base|tiny)', Path(model).name): warns.append(f'在用 {Path(model).name}，中文错字会多；建议下载 ggml-large-v3-turbo-q5_0.bin 放到 ~/models/')
    units = whisper(wav16, WK / 'asr', a.lang, model) if (a.reasr or not (WK / 'asr.json').exists()) else parse(WK / 'asr.json', a.lang)
    D = wav_dur(wav16)
    sil = silences(wav16, a.noise)
    units = fit_islands(units, sil, D)

    titles, skipped = {}, []
    if a.script:
        expect, cur = [], None
        for line in Path(a.script).read_text(encoding='utf-8').splitlines():
            s = line.strip()
            m = re.match(r'^#\s*(\d+)\s*(.*)$', s)
            if m: cur = int(m.group(1)); titles[cur] = f'{m.group(1)} {m.group(2)}'.strip(); continue
            if not s or s.startswith('[停'): continue
            expect += [dict(t=t, p=p, sc=cur) for t, p in split_units(s, a.lang)]
        units, skipped = align(expect, units)
        first = next((u['sc'] for u in units if u.get('sc') is not None), None)   # 开头稿子外的字（试音、口头禅）归到第一场
        for u in units:
            if u.get('sc') is not None: break
            u['sc'] = first
        if skipped: warns.append('稿子里这些没念（已跳过）：' + ' / '.join(x[:20] for x in skipped))
    for i, u in enumerate(units): u['i'] = i

    # 删除：cuts.json + 稿子外的字 + 前后有停顿的语气词
    cuts = json.loads((P / 'cuts.json').read_text(encoding='utf-8')) if (P / 'cuts.json').exists() else {}
    dropped, drop_ranges = set(), []
    for d in cuts.get('drop', []):
        if isinstance(d, list): drop_ranges.append((float(d[0]), float(d[1]))); continue
        m = re.fullmatch(r'(.*)#(\d+)', d); body, n = (m.group(1), int(m.group(2))) if m else (d, 1)
        hit = find_phrase(units, body, n, a.lang)
        if hit is None: warns.append(f'cuts.json 里的「{d}」在转写里找不到，先看 narration/transcript.txt 实际怎么说的'); continue
        dropped.update(range(hit[0], hit[1] + 1))
    if cuts.get('dropExtras'): dropped.update(u['i'] for u in units if u.get('ins'))
    fillers = set(cuts.get('fillers', ['嗯', '呃', '额']))
    for k, u in enumerate(units):
        if u['t'] in fillers and (k == 0 or units[k - 1]['e'] < u['s'] - 0.15) and (k + 1 == len(units) or units[k + 1]['s'] > u['e'] + 0.15): dropped.add(u['i'])
    for (x, y) in drop_ranges: dropped.update(u['i'] for u in units if u['s'] >= x - 0.05 and u['e'] <= y + 0.05)
    keep_ranges = [tuple(map(float, r)) for r in cuts.get('keep', [])]
    in_keep = lambda x, y: any(x >= k0 - 0.01 and y <= k1 + 0.01 for k0, k1 in keep_ranges)

    # 剪辑表（人声时间轴）：说话段 + 压短的停顿 + 加速的长空档
    F = a.fps
    if a.no_cut:
        raw = [{'src': [0.0, D], 'speed': 1}]
    else:
        islands, cur_i, last = [], None, None
        for u in units:
            if u['i'] in dropped: cur_i = None; continue
            if cur_i is not None and u['s'] - last['e'] <= 0.45 and not any(x[0] < u['s'] and x[1] > last['e'] for x in drop_ranges): cur_i[1] = u['e']
            else: cur_i = [u['s'], u['e']]; islands.append(cur_i)
            last = u
        for x, y in keep_ranges: islands.append([x, y])
        islands.sort(); merged = []
        for x, y in islands:
            if merged and x <= merged[-1][1] + 0.01: merged[-1][1] = max(merged[-1][1], y)
            else: merged.append([x, y])
        raw = []
        if merged: raw.append({'src': [max(0.0, merged[0][0] - 0.3), merged[0][0]], 'speed': 1})
        for k, (x, y) in enumerate(merged):
            raw.append({'src': [x, y], 'speed': 1})
            nx = merged[k + 1][0] if k + 1 < len(merged) else None
            if nx is None: raw.append({'src': [y, min(D, y + 0.5)], 'speed': 1}); break
            g = nx - y
            if g <= a.gap or in_keep(y, nx): raw.append({'src': [y, nx], 'speed': 1}); continue
            if 'screen' in tracks and g >= a.idle:
                sp = max(a.speedup, round(g / 3.0)); raw.append({'src': [y, nx], 'speed': float(sp)})
            else:
                raw.append({'src': [y, y + a.gap * 0.6], 'speed': 1}); raw.append({'src': [nx - a.gap * 0.4, nx], 'speed': 1})
    # 合并相邻同速段；每段输出长度对齐到帧网格（多段拼接不漂）
    segs, t_out = [], 0.0
    for s in raw:
        x, y = s['src']
        if y - x < 1e-3: continue
        if segs and segs[-1]['speed'] == s['speed'] and abs(segs[-1]['src'][1] - x) < 1e-3: segs[-1]['src'][1] = y; continue
        segs.append({'src': [x, y], 'speed': s['speed']})
    for s in segs:
        x, y = s['src']; n = max(1, round((y - x) / s['speed'] * F)); s['frames'] = n
        s['src'][1] = round(x + n / F * s['speed'], 4); s['out'] = [round(t_out, 4), round(t_out + n / F, 4)]; t_out = s['out'][1]
    T = t_out
    def to_out(t):
        for s in segs:
            if s['src'][0] - 1e-3 <= t <= s['src'][1] + 1e-3: return round(s['out'][0] + (min(max(t, s['src'][0]), s['src'][1]) - s['src'][0]) / s['speed'], 3)
        for s in segs:   # 段尾对齐帧网格时可能削掉几毫秒：落在段边上 0.15 秒内的字贴到段边
            if 0 < t - s['src'][1] <= 0.15: return s['out'][1]
            if 0 < s['src'][0] - t <= 0.15: return s['out'][0]
        return None

    # 视频轨
    jobs = {}
    if 'screen' in tracks: jobs['screen'] = (tracks['screen'], FT / 'screen.cut.mp4', 2560)
    if 'camera' in tracks: jobs['camera'] = (tracks['camera'], FT / 'camera.cut.mp4', 1920)
    for n, (t, out, mx) in jobs.items(): cut_video(t, segs, offsets.get(n, 0.0), F, out, WK, mx)
    # 人声：按剪辑表拼采样（加速段是静音），再做两遍响度标准化
    with wave.open(str(wav48)) as w: sr = w.getframerate(); pcm = array('h'); pcm.frombytes(w.readframes(w.getnframes()))
    outpcm = array('h')
    for s in segs:
        n_out = round(s['frames'] / F * sr)
        if s['speed'] == 1:
            a0 = round(s['src'][0] * sr); chunk = pcm[a0:a0 + n_out]; outpcm.extend(chunk); outpcm.extend(array('h', bytes(2 * (n_out - len(chunk)))))
        else: outpcm.extend(array('h', bytes(2 * n_out)))
    cutwav = WK / 'voice.cut.wav'
    with wave.open(str(cutwav), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(outpcm.tobytes())
    lufs_in = loudnorm(cutwav, NA / 'narration-full.mp3')

    # 逐字时间 → 成片时间；句子 / 场景
    kept = [dict(u, s=to_out(u['s']), e=to_out(u['e'])) for u in units if u['i'] not in dropped]
    kept = [u for u in kept if u['s'] is not None and u['e'] is not None]
    sep = ' ' if a.lang == 'en' else ''
    join = lambda us: ''.join((sep if k and a.lang == 'en' else '') + u['t'] + u.get('p', '') for k, u in enumerate(us)).strip()
    words = [{'w': u['t'] + u.get('p', ''), 't': u['s'], 'e': u['e']} for u in kept]
    sents, cur_s = [], []
    for k, u in enumerate(kept):
        cur_s.append(u)
        nxt = kept[k + 1] if k + 1 < len(kept) else None
        long_cut = (len(cur_s) >= 28 and is_break(u.get('p', ''))) or len(cur_s) >= 60   # 长句在逗号处断开，实在没标点才硬断
        if not nxt or any(c in u.get('p', '') for c in SENT_END) or nxt['s'] - u['e'] > 0.6 or long_cut or (a.script and nxt.get('sc') != u.get('sc')):
            sents.append(cur_s); cur_s = []
    groups = []
    if a.script and any(u.get('sc') is not None for u in kept):
        for snt in sents:
            sc = snt[0].get('sc')
            if groups and groups[-1][0] == sc: groups[-1][1].append(snt)
            else: groups.append([sc, [snt]])
    else:       # 没稿子：按长停顿（≥ 1.2 秒）和 ~45 秒一段自动分场景，之后在 scenes.json 里改标题、合并
        for snt in sents:
            if not groups: groups.append([1, [snt]]); continue
            prev = groups[-1][1][-1][-1]; dur = snt[0]['s'] - groups[-1][1][0][0]['s']
            orig_gap = units[snt[0]['i']]['s'] - units[prev['i']]['e']
            if (orig_gap >= 1.2 and dur >= 12) or dur >= 45: groups.append([groups[-1][0] + 1, [snt]])
            else: groups[-1][1].append(snt)
    scenes = []
    for k, (sc, ss) in enumerate(groups):
        sid = sc if sc is not None else k + 1
        if scenes and sid <= scenes[-1]['id']: sid = scenes[-1]['id'] + 1
        start = 0.0 if k == 0 else round(max(scenes[-1]['end'], ss[0][0]['s'] - 0.15), 3)
        end = round(ss[-1][-1]['e'] + 0.15, 3) if k + 1 < len(groups) else round(T, 3)
        cues = [{'t': s_[0]['s'], 'e': s_[-1]['e'], 'text': join(s_)} for s_ in ss]
        scenes.append({'id': sid, 'title': titles.get(sc) or f'{sid:02d} 第{sid}段', 'start': start, 'end': end, 'dur': round(end - start, 3), 'cues': cues})
    for k in range(len(scenes) - 1): scenes[k]['end'] = scenes[k + 1]['start']; scenes[k]['dur'] = round(scenes[k]['end'] - scenes[k]['start'], 3)
    json.dump(words, open(NA / 'words.json', 'w'), ensure_ascii=False)
    json.dump(scenes, open(NA / 'scenes.json', 'w'), ensure_ascii=False, indent=1)
    lines = []
    for sc in scenes:
        lines.append(f"# {sc['title']}  ({sc['start']:.1f}s)")
        for c in sc['cues']: lines.append(f"  {c['t']:7.2f}  {c['text']}")
    ins = [u for u in units if u.get('ins') and u['i'] not in dropped]
    if ins: lines.append('\n# 稿子外的字（重说 / 口误 / 即兴），要删就写进 cuts.json 的 drop，或 "dropExtras": true：\n  ' + ' '.join(f"⟨{u['t']}⟩@{u['s']:.1f}" for u in ins[:200]))
    (NA / 'transcript.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    json.dump({'voice': voice, 'offsets': offsets, 'sync': sync, 'fps': F, 'duration': {'raw': round(D, 3), 'cut': round(T, 3)},
               'segments': [{'src': s['src'], 'out': s['out'], 'speed': s['speed']} for s in segs]}, open(FT / 'cutlist.json', 'w'), ensure_ascii=False, indent=1)
    json.dump([dict((k, u[k]) for k in ('i', 't', 'p', 's', 'e', 'sc', 'ins', 'miss') if k in u) for u in units], open(WK / 'units.json', 'w'), ensure_ascii=False)

    face = None
    if 'camera' in jobs:
        face = face_box(FT / 'camera.cut.mp4')
        (FT / 'camera.cut.face.json').write_text(json.dumps(face))
        if not face.get('found'): warns.append('摄像头画面里没找到人脸（或不是 macOS），小窗按画面中间偏上裁切；可以在 presenter.json 写 "face": {x,y,w,h}')
        if not (P / 'presenter.json').exists():
            (P / 'presenter.json').write_text(json.dumps({'kind': 'camera', 'name': '主讲', 'selfName': '我', 'src': 'footage/camera.cut.mp4'}, ensure_ascii=False, indent=2))
    if 'screen' in jobs and not (P / 'screen.json').exists():
        (P / 'screen.json').write_text(json.dumps({'src': 'footage/screen.cut.mp4', 'frame': 'window', 'title': '', 'focus': []}, ensure_ascii=False, indent=2))
    r = subprocess.run([sys.executable, str(HERE / 'captions.py'), str(P)], capture_output=True, text=True)
    if r.returncode: warns.append('captions.py 失败：' + r.stderr[-300:])
    for w_ in warns: print('! ' + w_, file=sys.stderr)
    speed = [s for s in segs if s['speed'] > 1]
    print(json.dumps({'ok': True, 'voice': voice, 'offsets': offsets, 'sync': sync, 'model': Path(model).name, 'raw': round(D, 2), 'cut': round(T, 2),
                      'removed': round(D - sum(s['src'][1] - s['src'][0] for s in segs), 2), 'speedups': len(speed), 'segments': len(segs),
                      'scenes': len(scenes), 'words': len(words), 'loudness_in': lufs_in, 'face': face, 'outputs': [str(p.relative_to(P)) for p in (FT / 'screen.cut.mp4', FT / 'camera.cut.mp4', NA / 'narration-full.mp3') if p.exists()],
                      'warnings': warns}, ensure_ascii=False))


if __name__ == '__main__':
    main()
