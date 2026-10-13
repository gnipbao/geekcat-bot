#!/usr/bin/env python3
"""豆包语音 2.0 整段合成：口播稿 → 旁白音频 + 逐句字幕 + 场景时间轴

和逐句合成相比，整段（按场景）送进模型，语气、重音、停顿是连贯的，更像真人。
时间轴来自接口返回的逐字时间戳（audio_params.enable_subtitle），不需要另做对齐。

用法：
  DOUBAO_TTS_TOKEN=... python3 tts.py narration/narration.txt narration/ \\
      --voice zh_male_yuanboxiaoshu_uranus_bigtts \\
      --style "像跟懂技术的朋友聊天一样，轻松自然，有好奇心，不要播音腔" [--speed 1.0]

口播稿格式：
  # 01 开场            ← 场景分隔（必须），编号 + 标题
  大家好，我是知识猫。  ← 场景内的句子；同一场景整段合成
  [停 0.6]             ← 可选：场景内插入静音

音色：
  - 官方 2.0 音色（*_uranus_bigtts）→ 资源 seed-tts-2.0
  - 你的复刻声音（S_ 开头）       → 资源 seed-icl-2.0（自动判断，也可 --resource 指定）
  - *_mars_bigtts 是 1.0 音色，需要单独开通 seed-tts-1.0

产物：narration-full.mp3 · narration.srt（逐句）· words.json（逐字）· scenes.json（场景起止 + 句子）
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, tempfile, time, uuid, urllib.error, urllib.request

API = os.environ.get('DOUBAO_API_URL', 'https://openspeech.bytedance.com/api/v3/tts/unidirectional')
SCENE_GAP = 0.6        # 场景之间的静音（秒）
MAX_CHARS = 280        # 单次请求的文本上限；超过按句号切开（仍按段落语气合成）


def resource_for(voice, override=None):
    if override: return override
    if voice.startswith('S_'): return 'seed-icl-2.0'
    if voice.endswith('_mars_bigtts'): return 'seed-tts-1.0'
    return 'seed-tts-2.0'


def synth(text, voice, resource, token, style=None, speed=1.0, retries=3):
    """一次请求 → (mp3 bytes, [sentence{text, words[{word,startTime,endTime}]}])"""
    params = {'text': text, 'speaker': voice, 'audio_params': {'format': 'mp3', 'sample_rate': 24000, 'enable_subtitle': True}}
    if speed != 1.0: params['audio_params']['speech_rate'] = int(round((speed - 1.0) * 100))  # -50..100
    if style: params['additions'] = json.dumps({'context_texts': [style]}, ensure_ascii=False)
    body = json.dumps({'user': {'uid': 'ip-explainer-video'}, 'req_params': params}).encode()
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(API, data=body, method='POST', headers={
            'Content-Type': 'application/json', 'X-Api-Key': token, 'X-Api-Resource-Id': resource, 'X-Api-Request-Id': str(uuid.uuid4())})
        try:
            audio, sents = b'', []
            with urllib.request.urlopen(req, timeout=120) as r:  # 证书校验保持开启
                for line in r.read().decode('utf-8', 'replace').splitlines():
                    line = line.strip()
                    if not line: continue
                    j = json.loads(line)
                    code = j.get('code', 0)
                    if code not in (0, 20000000):
                        raise RuntimeError(f"code={code} {j.get('message')}")
                    if j.get('data'): audio += base64.b64decode(j['data'])
                    if j.get('sentence') and j['sentence'].get('words'): sents.append(j['sentence'])
            if not audio: raise RuntimeError('接口没有返回音频')
            return audio, sents
        except urllib.error.HTTPError as e:
            last = RuntimeError(f'HTTP {e.code}: {e.read().decode("utf-8", "replace")[:300]}')
            if e.code in (401, 403): break
        except Exception as e:
            last = e
            if 'mismatched' in str(e): break   # 音色和资源不匹配：重试没有意义
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'豆包 TTS 失败（音色 {voice} / 资源 {resource}）：{last}')


def parse_script(path):
    scenes, cur = [], None
    for raw in open(path, encoding='utf-8'):
        s = raw.strip()
        if not s: continue
        if s.startswith('#'):
            title = s.lstrip('#').strip()
            m = re.match(r'(\d+)\s*(.*)', title)
            cur = {'id': m.group(1) if m else str(len(scenes) + 1).zfill(2), 'title': title, 'parts': []}
            scenes.append(cur); continue
        if cur is None: raise SystemExit('口播稿需要以 "# 01 标题" 这样的场景行开头')
        for piece in re.split(r'(\[(?:停|pause)\s*[\d.]+s?\])', s, flags=re.I):
            piece = piece.strip()
            if not piece: continue
            m = re.match(r'\[(?:停|pause)\s*([\d.]+)s?\]', piece, re.I)
            if m: cur['parts'].append({'pause': float(m.group(1))})
            elif cur['parts'] and 'text' in cur['parts'][-1]: cur['parts'][-1]['text'] += piece
            else: cur['parts'].append({'text': piece})
    return scenes


def chunks(text):
    """把一段文字切成 ≤ MAX_CHARS 的块，只在句末标点处切"""
    out, buf = [], ''
    for sent in re.split(r'(?<=[。！？!?])', text):
        if buf and len(buf) + len(sent) > MAX_CHARS: out.append(buf); buf = ''
        buf += sent
    if buf.strip(): out.append(buf)
    return out


def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True, stdin=subprocess.DEVNULL)


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip())


def ts(sec):
    ms = int(round(max(0, sec) * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def main():
    ap = argparse.ArgumentParser(description='豆包语音 2.0 整段合成')
    ap.add_argument('script'); ap.add_argument('outdir')
    ap.add_argument('--voice', default=os.environ.get('DOUBAO_VOICE', 'zh_male_yuanboxiaoshu_uranus_bigtts'))
    ap.add_argument('--resource', default=os.environ.get('DOUBAO_RESOURCE_ID'))
    ap.add_argument('--style', default=os.environ.get('DOUBAO_STYLE', '像跟懂技术的朋友聊天一样，轻松自然，有好奇心，句子之间有呼吸感，不要播音腔'))
    ap.add_argument('--speed', type=float, default=1.0, help='语速倍率，模型原生调节（1.15 = 快 15%%）。克隆声音偏慢时常用 1.1–1.2')
    ap.add_argument('--lufs', type=float, default=-16.0, help='响度标准化目标（LUFS），0 = 不处理。YouTube 约 -14，默认 -16')
    ap.add_argument('--lead', type=float, default=0.6, help='片头静音（秒）')
    a = ap.parse_args()
    token = os.environ.get('DOUBAO_TTS_TOKEN') or os.environ.get('DOUBAO_API_KEY') or os.environ.get('VOLCENGINE_ACCESS_TOKEN')
    if not token: sys.exit('缺少 DOUBAO_TTS_TOKEN（火山引擎控制台 → 语音技术 → API Key）')
    if not shutil.which('ffmpeg'): sys.exit('需要 ffmpeg')
    resource = resource_for(a.voice, a.resource)
    scenes = parse_script(a.script)
    os.makedirs(a.outdir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='tts-')
    pieces, t = [], 0.0

    def silence(sec):
        nonlocal t
        p = os.path.join(tmp, f'sil_{len(pieces):04d}.wav')
        ff('-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', f'{sec:.3f}', p)
        pieces.append(p); t += sec

    print(f'[TTS] 音色 {a.voice} · 资源 {resource} · 语速 {a.speed}x · 响度 {a.lufs or "不处理"} LUFS · {len(scenes)} 个场景 · 语气：{a.style or "（无）"}')
    silence(a.lead)
    cues, words_all, scene_out = [], [], []
    for si, sc in enumerate(scenes):
        if si: silence(SCENE_GAP)
        start, sc_cues = t, []
        for part in sc['parts']:
            if 'pause' in part: silence(part['pause']); continue
            for block in chunks(part['text']):
                audio, sents = synth(block, a.voice, resource, token, a.style, a.speed)
                mp3 = os.path.join(tmp, f'seg_{len(pieces):04d}.mp3'); wav = mp3[:-4] + '.wav'
                open(mp3, 'wb').write(audio); ff('-i', mp3, '-ar', '24000', '-ac', '1', wav)
                for s in sents:
                    w = s['words']
                    cue = {'t': round(t + w[0]['startTime'], 3), 'e': round(t + w[-1]['endTime'], 3), 'text': s['text'].strip()}
                    sc_cues.append(cue); cues.append(cue)
                    words_all += [{'w': x['word'], 't': round(t + x['startTime'], 3), 'e': round(t + x['endTime'], 3)} for x in w]
                pieces.append(wav); t += duration(wav)
                print(f'  [{sc["id"]}] {block[:28]}… → {len(sents)} 句')
        scene_out.append({'id': sc['id'], 'title': sc['title'], 'start': round(start, 3), 'cues': sc_cues})
    for i, s in enumerate(scene_out):
        s['start'] = 0.0 if i == 0 else s['start']
        s['end'] = scene_out[i + 1]['start'] if i + 1 < len(scene_out) else round(t + 0.6, 3)
        s['dur'] = round(s['end'] - s['start'], 3)

    lst = os.path.join(tmp, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in pieces))
    full = os.path.join(a.outdir, 'narration-full.mp3')
    norm = ['-af', f'loudnorm=I={a.lufs}:TP=-1.5:LRA=11', '-ar', '48000'] if a.lufs else []  # 只改音量，不改时间轴
    ff('-f', 'concat', '-safe', '0', '-i', lst, *norm, '-c:a', 'libmp3lame', '-b:a', '192k', full)
    with open(os.path.join(a.outdir, 'narration.srt'), 'w', encoding='utf-8') as f:
        for i, c in enumerate(cues, 1): f.write(f"{i}\n{ts(c['t'])} --> {ts(c['e'])}\n{c['text']}\n\n")
    json.dump(words_all, open(os.path.join(a.outdir, 'words.json'), 'w'), ensure_ascii=False)
    json.dump(scene_out, open(os.path.join(a.outdir, 'scenes.json'), 'w'), ensure_ascii=False, indent=1)
    shutil.rmtree(tmp, ignore_errors=True)
    print(json.dumps({'ok': True, 'audio': full, 'duration': round(duration(full), 3), 'cues': len(cues), 'scenes': len(scene_out), 'voice': a.voice, 'resource': resource}, ensure_ascii=False))


if __name__ == '__main__':
    main()
