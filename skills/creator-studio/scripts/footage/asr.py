"""转写与对齐（只用标准库 + ffmpeg + whisper-cli）。大部分移植自同一作者的 scrapbook-koubo skill：
whisper 调用与半截 UTF-8 修复、稿子对齐（含重说识别）、按真实有声段校正字时间；另加多轨音频对齐（包络互相关）。"""
import difflib, json, os, re, subprocess, sys, unicodedata
from array import array
from pathlib import Path

PUNCT = set('，。、：；！？,.:;!?…—–“”"\'‘’「」『』（）()《》【】[]~～·')
CJK_RE = re.compile(r'[㐀-鿿豈-﫿぀-ヿ가-힯]')
ZH_UNIT_RE = re.compile(r"[A-Za-z0-9]+(?:['’.\-+][A-Za-z0-9]+)*|\S")
SENT_END = set('。！？!?；;')


def is_cjk(s): return bool(CJK_RE.search(s))
def is_break(p): return any(ch in p for ch in '，。、：；！？,.:;!?…—')
def norm(s):
    s = unicodedata.normalize('NFKC', s).lower()
    return ''.join(ch for ch in s if not ch.isspace() and ch not in PUNCT)


def split_units(text, lang):
    """文字 → [(显示文字, 后缀标点)]。中文：一个汉字一个单位，连续英文/数字算一个词；英文：按词。"""
    out = []
    if lang == 'zh':
        for m in ZH_UNIT_RE.finditer(text):
            tok = m.group(0)
            if all(ch in PUNCT for ch in tok):
                if out: out[-1] = (out[-1][0], out[-1][1] + tok)
                continue
            out.append((tok, ''))
    else:
        P = ''.join(PUNCT)
        for w in text.split():
            core = w.strip(P)
            if not core:
                if out: out[-1] = (out[-1][0], out[-1][1] + w)
                continue
            out.append((core, w[len(w.rstrip(P)):]))
    return out


MODEL_CANDIDATES = [
    '~/models/ggml-large-v3-turbo-q5_0.bin', '~/models/ggml-large-v3-turbo.bin', '~/models/ggml-medium-q5_0.bin',
    '~/models/ggml-medium.bin', '~/.cache/whisper/ggml-large-v3-turbo.bin', '~/.cache/whisper/ggml-medium.bin',
    '~/Library/Application Support/Murmur/models/ggml-medium-q5_0.bin',
    '~/.cache/hyperframes/whisper/models/ggml-small.bin', '~/models/ggml-small.bin', '~/.cache/whisper/ggml-small.bin',
    '~/models/ggml-base.bin',
]


def find_model(arg=None):
    for p in [arg, os.environ.get('WHISPER_MODEL')] + MODEL_CANDIDATES:
        if p and os.path.exists(os.path.expanduser(p)):
            return os.path.expanduser(p)
    sys.exit('没找到 whisper 模型：下载 ggml-large-v3-turbo-q5_0.bin（或 medium / small）放到 ~/models/，'
             '或 export WHISPER_MODEL=模型路径。国内可从 https://hf-mirror.com/ggerganov/whisper.cpp 下载')


def ff(*args):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], capture_output=True, text=True)
    if r.returncode: sys.exit('ffmpeg 失败：\n' + r.stderr[-1500:])


def to_wav(src, dst, rate=16000, stream=None):
    ff('-i', src, *(['-map', stream] if stream else []), '-vn', '-ar', rate, '-ac', 1, dst)


def whisper(wav16, out_base, lang, model):
    cmd = ['whisper-cli', '-m', model, '-l', lang, '-ml', '1', '-oj', '-of', str(out_base), '-f', str(wav16)]
    cmd += ['--prompt', '以下是普通话的句子。'] if lang == 'zh' else ['-sow']   # 中性提示偏简体；别把原文塞进 prompt
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: sys.exit('whisper-cli 失败：\n' + r.stderr[-1500:])
    return parse(str(out_base) + '.json', lang)


def _valid(b):
    try: b.decode('utf-8'); return True
    except UnicodeDecodeError: return False


def parse(path, lang):
    """whisper.cpp 偶尔把一个汉字拆成两个 token 写出半截 UTF-8：按 latin-1 读、按字节拼回去再解码。"""
    d = json.loads(Path(path).read_bytes().decode('latin-1'))
    merged = []
    for k, t in enumerate(d['transcription']):
        raw = t['text'].encode('latin-1')
        a, b = t['offsets']['from'] / 1000, t['offsets']['to'] / 1000
        if merged and not _valid(merged[-1][0]):
            merged[-1][0] += raw; merged[-1][2] = b
        else:
            merged.append([raw, a, b, k])
    units = []
    for raw, a, b, k in merged:
        txt = raw.decode('utf-8', 'replace').strip()
        if not txt or re.fullmatch(r'[\[(（【].*[\])）】]', txt): continue
        us = split_units(txt, lang)
        if not us:
            if units: units[-1]['p'] += txt
            continue
        L, acc = sum(len(u) for u, _ in us), 0
        for u, p in us:
            s = a + (b - a) * acc / L; acc += len(u)
            units.append(dict(t=u, p=p, s=round(s, 3), e=round(a + (b - a) * acc / L, 3), tok=k))
    return units


def align(expect, asr):
    """期望文字（[{t,p,sc}]）对上 whisper 的字（带时间）：equal 用稿子的字 + whisper 的时间；replace 听错了，稿子的字铺在那段时间上；
    delete 短的补时间、长的当没念跳过；insert 稿子外的字保留并标 ins。重说：稿子外的一串和前面一串一样 → 保留后一遍。sc（场景号）跟着稿子走。"""
    A, B = [norm(u['t']) for u in expect], [norm(u['t']) for u in asr]
    sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
    out, skipped = [], []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                e = expect[i1 + k]; out.append(dict(asr[j1 + k], t=e['t'], p=e.get('p', ''), sc=e.get('sc')))
        elif tag == 'replace':
            s0, e0, n = asr[j1]['s'], asr[j2 - 1]['e'], i2 - i1
            for k in range(n):
                e = expect[i1 + k]
                out.append(dict(t=e['t'], p=e.get('p', ''), sc=e.get('sc'), tok=None, s=round(s0 + (e0 - s0) * k / n, 3), e=round(s0 + (e0 - s0) * (k + 1) / n, 3)))
        elif tag == 'delete':
            if i2 - i1 <= 4:
                for k in range(i1, i2):
                    e = expect[k]; out.append(dict(t=e['t'], p=e.get('p', ''), sc=e.get('sc'), tok=None, s=None, e=None, miss=True))
            else:
                skipped.append(''.join(u['t'] + u.get('p', '') for u in expect[i1:i2]))
        else:
            for k in range(j1, j2): out.append(dict(asr[k], extra=True, sc=None))
    i = 0
    while i < len(out):
        if out[i].get('extra'):
            j = i
            while j < len(out) and out[j].get('extra'): j += 1
            n = j - i
            if i - n >= 0 and not any(u.get('extra') for u in out[i - n:i]) and \
                    [norm(u['t']) for u in out[i - n:i]] == [norm(u['t']) for u in out[i:j]] and all(u['s'] is not None for u in out[i - n:j]):
                for k in range(n):
                    a, b = out[i - n + k], out[i + k]
                    out[i - n + k] = dict(a, extra=True)
                    out[i + k] = dict(b, t=a['t'], p=a.get('p', ''), sc=a.get('sc'), extra=False)
            i = j
        i += 1
    i = 0
    while i < len(out):                       # 没有时间的夹在前后之间均分
        if out[i]['s'] is None:
            j = i
            while j < len(out) and out[j]['s'] is None: j += 1
            a = out[i - 1]['e'] if i > 0 else (out[j]['s'] if j < len(out) else 0.0)
            b = out[j]['s'] if j < len(out) else a + 0.2 * (j - i)
            for k in range(i, j):
                out[k]['s'] = round(a + (b - a) * (k - i) / (j - i), 3); out[k]['e'] = round(a + (b - a) * (k - i + 1) / (j - i), 3)
            i = j
        i += 1
    last = None
    for u in out:                              # 稿子外的字归到前一个字的场景
        if u.pop('extra', False): u['ins'] = True
        if u.get('sc') is None: u['sc'] = last
        last = u['sc']
    return out, skipped


def silences(wav, noise=-35, d=0.2):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(wav), '-af', f'silencedetect=noise={noise}dB:d={d}', '-f', 'null', '-'], capture_output=True, text=True)
    out, st = [], None
    for line in r.stderr.splitlines():
        m = re.search(r'silence_start: (-?[\d.]+)', line)
        if m: st = max(0.0, float(m.group(1)))
        m = re.search(r'silence_end: ([\d.]+)', line)
        if m and st is not None: out.append([round(st, 3), round(float(m.group(1)), 3)]); st = None
    return out


def fit_islands(units, sil, dur):
    """whisper 常把停顿前的最后一个字拖进静音里。按真实的"有声段"重新摆字。"""
    gaps = [(a, b) for a, b in sil if b - a >= 0.2]
    isl, t = [], 0.0
    for a, b in gaps:
        if a - t > 0.06: isl.append([t, a])
        t = max(t, b)
    if dur - t > 0.06: isl.append([t, dur])
    if not isl or not units: return units
    assign, cur = [], 0
    for i, u in enumerate(units):
        c = (u['s'] + u['e']) / 2; k = cur
        while k + 1 < len(isl) and isl[k + 1][0] <= c: k += 1
        if c > isl[k][1] and k + 1 < len(isl):
            dprev, dnext = c - isl[k][1], isl[k + 1][0] - c
            if is_break(u.get('p', '')): dprev *= 0.4
            if i > 0 and is_break(units[i - 1].get('p', '')): dnext *= 0.4
            if dnext < dprev: k += 1
        cur = max(cur, k); assign.append(cur)
    out = [dict(u) for u in units]
    groups = {}
    for i, k in enumerate(assign): groups.setdefault(k, []).append(i)
    for k, idx in groups.items():
        A, B = isl[k]
        S, E = min(units[i]['s'] for i in idx), max(units[i]['e'] for i in idx)
        if E - S < 0.5 * (B - A) and S >= A - 0.05 and E <= B + 0.05: continue
        if E - S < 0.5 * (B - A):
            sh = (A - S) if S < A else (B - E) if E > B else 0.0
            for i in idx: out[i]['s'], out[i]['e'] = round(units[i]['s'] + sh, 3), round(units[i]['e'] + sh, 3)
            continue
        sc = (B - A) / max(1e-3, E - S)
        for i in idx:
            out[i]['s'] = round(A + (units[i]['s'] - S) * sc, 3); out[i]['e'] = round(A + (units[i]['e'] - S) * sc, 3)
    return out


def find_phrase(units, phrase, n=1, lang='zh'):
    """在逐字时间轴上找短语第 n 次出现 → (首字下标, 末字下标)；找不到返回 None"""
    text, mp = '', []
    for i, u in enumerate(units):
        t = norm(u['t'])
        if lang == 'en' and text: text += ' '; mp.append(i)
        text += t; mp += [i] * len(t)
    q = norm(phrase)
    i, hit = text.find(q), 0
    while i >= 0 and q:
        hit += 1
        if hit == n: return mp[i], mp[i + len(q) - 1]
        i = text.find(q, i + 1)
    return None


# —— 多轨对齐：音量包络互相关（先 20 Hz 粗找，再 100 Hz 细找），纯 Python，不依赖 numpy ——
def envelope(src, rate, seconds=None, stream=None):
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(src), *(['-map', stream] if stream else []), '-vn', '-ac', '1', '-ar', '8000']
    if seconds: cmd += ['-t', str(seconds)]
    cmd += ['-f', 's16le', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    a = array('h'); a.frombytes(raw[: len(raw) // 2 * 2])
    hop = 8000 // rate
    env = [sum(abs(x) for x in a[i:i + hop]) / hop for i in range(0, len(a) - hop + 1, hop)]
    if not env: return []
    m = sum(env) / len(env); sd = (sum((x - m) ** 2 for x in env) / len(env)) ** 0.5 or 1
    return [(x - m) / sd for x in env]


def _xcorr(a, b, lags):
    best, bl = None, 0
    for lag in lags:            # b 向右挪 lag 个采样后和 a 的相关
        if lag >= 0: n = min(len(a) - lag, len(b)); s = sum(a[lag + i] * b[i] for i in range(0, n)) / max(1, n) if n > 0 else -1
        else: n = min(len(a), len(b) + lag); s = sum(a[i] * b[i - lag] for i in range(0, n)) / max(1, n) if n > 0 else -1
        if best is None or s > best: best, bl = s, lag
    return bl, best or 0


def sync_offset(ref, other, max_lag=30, seconds=240, ref_stream=None, other_stream=None):
    """other 的 0 秒落在 ref 时间轴上的位置（秒）：ref_t = other_t + offset。返回 (offset, 相关系数)"""
    a, b = envelope(ref, 20, seconds, ref_stream), envelope(other, 20, seconds, other_stream)
    if len(a) < 40 or len(b) < 40: return 0.0, 0.0
    L = int(max_lag * 20); lag, _ = _xcorr(a, b, range(-L, L + 1))
    a, b = envelope(ref, 100, seconds, ref_stream), envelope(other, 100, seconds, other_stream)
    lag2, score = _xcorr(a, b, range(lag * 5 - 8, lag * 5 + 9))
    return round(lag2 / 100, 3), round(score, 3)
