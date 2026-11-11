#!/usr/bin/env python3
"""record-terminal Gate 3：PTY 捕获 → 回放账本（场景用 reducer 按时间渲染）

用法：python3 terminal_ledger.py terminal/runbook.json terminal/capture.json terminal/ledger.json

演示时间来自 runbook.plan：每条命令 [开始打字, 打字时长, 输出开始, 输出时长]（旁白绝对秒）。
内容与先后顺序完全来自捕获，只压缩等待；校验失败会直接报错。
"""
import json, re, sys

rb, cap = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); out = sys.argv[3]
plan = rb['plan']
assert len(plan) == len(cap['commands']), 'runbook.plan 要和 commands 一一对应'
PROMPT_RE = re.compile(re.escape(f"\x1b[32m{cap['user']}\x1b[0m \x1b[34m{cap['path']}\x1b[0m \x1b[35m❯\x1b[0m "))
COLORS = {'32': '#57e35a', '34': '#6f8cff', '35': '#df5ac8', '31': '#ff6b6b', '33': '#f5d76e', '36': '#2bd4d4',
          '1;31': '#ff6b6b', '1;32': '#57e35a', '1;33': '#f5d76e', '1;34': '#7aa2ff', '1;35': '#df5ac8', '1;36': '#2bd4d4',
          '1;39': '#f4f4f5', '0;39': '#e7e9ed', '0;32': '#57e35a', '0;33': '#f5d76e'}

stream, times = '', []
for e in cap['events']:
    if e['dir'] != 'out': continue
    d = e['data'].replace('\x1b[?1034h', '')     # bash meta-key 开关：无可见效果
    stream += d; times += [e['t']] * len(d)

def sgr_segments(text):
    segs, color, bold = [], None, False
    for part in re.split(r'(\x1b\[[0-9;]*m)', text):
        if not part: continue
        m = re.match(r'\x1b\[([0-9;]*)m', part)
        if m:
            code = m.group(1) or '0'
            if code in ('0', '00'): color, bold = None, False
            else: color = COLORS.get(code, color); bold = code.startswith('1;') or code == '1'
            continue
        part = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', part)  # 其余控制序列不产生可见文字
        if part: segs.append({'t': part, 'c': color, 'b': bold})
    return segs

prompts = list(PROMPT_RE.finditer(stream))
events, seq = [], 0
def add(**kw):
    global seq; seq += 1; kw.update(id=f'e{seq:03d}', seq=seq); events.append(kw)

add(cycle=0, type='shell_prompt_initial', evidenceTime=times[prompts[0].start()], reveal='instant', stream='stdout', payload=sgr_segments(prompts[0].group(0)), source='capture')
for i, cmd in enumerate(cap['commands']):
    p = prompts[i]; body_end = prompts[i + 1].start() if i + 1 < len(prompts) else len(stream)
    body = stream[p.end():body_end]
    echo_end = body.index('\r\n') + 2
    echo = re.sub(r' \r(?!\n)', '', body[:echo_end - 2])     # readline 第 cols 列的折行填充 " \r"
    assert echo == cmd, f'回显与命令不一致：{echo!r} vs {cmd!r}'
    in_t = next(e['t'] for e in cap['events'] if e['dir'] == 'in' and e['data'].startswith(cmd))
    add(cycle=i + 1, type='input_chunk', evidenceTime=in_t, reveal='typed-prefix', stream='input', payload=[{'t': cmd, 'c': '#f4f4f5', 'b': False}], source='capture')
    add(cycle=i + 1, type='input_submitted', evidenceTime=in_t, reveal='instant', stream='input', payload=[{'t': '\n', 'c': None, 'b': False}], source='capture')
    out_txt, start, cs = body[echo_end:], p.end() + echo_end, 0
    for k in range(1, len(out_txt) + 1):
        if k == len(out_txt) or times[start + k] != times[start + cs]:
            piece = out_txt[cs:k].replace('\r\n', '\n')
            if piece: add(cycle=i + 1, type='output_chunk', evidenceTime=times[start + cs], reveal='stream-prefix', stream='stdout', payload=sgr_segments(piece), source='capture')
            cs = k
    add(cycle=i + 1, type='command_completed', evidenceTime=times[body_end - 1], reveal='instant', stream='terminal-control', payload={'exit': 0}, source='capture')
    if i + 1 < len(prompts):
        add(cycle=i + 1, type='shell_prompt_returned', evidenceTime=times[prompts[i + 1].start()], reveal='instant', stream='stdout', payload=sgr_segments(prompts[i + 1].group(0)), source='capture')

events[0]['presentationStart'], events[0]['presentationDuration'] = plan[0][0] - 0.3, 0
for i, (ty, td, os_, od) in enumerate(plan, 1):
    cyc = [e for e in events if e['cycle'] == i]
    outs = [e for e in cyc if e['type'] == 'output_chunk']
    t_first, t_last = (outs[0]['evidenceTime'], outs[-1]['evidenceTime']) if outs else (0, 0)
    span = max(1e-6, t_last - t_first)
    for e in cyc:
        if e['type'] == 'input_chunk': e['presentationStart'], e['presentationDuration'] = ty, td
        elif e['type'] == 'input_submitted': e['presentationStart'], e['presentationDuration'] = round(ty + td + 0.1, 3), 0
        elif e['type'] == 'output_chunk':
            k = (e['evidenceTime'] - t_first) / span if len(outs) > 1 else 0
            e['presentationStart'] = round(os_ + k * od * 0.9, 3)
            e['presentationDuration'] = round(max(0.05, od * 0.1 if len(outs) > 1 else od), 3)
        elif e['type'] == 'command_completed': e['presentationStart'], e['presentationDuration'] = round(os_ + od, 3), 0
        elif e['type'] == 'shell_prompt_returned': e['presentationStart'], e['presentationDuration'] = round(os_ + od + 0.05, 3), 0

for i in range(1, len(cap['commands'])):
    assert sum(1 for e in events if e['cycle'] == i and e['type'] == 'shell_prompt_returned') == 1, f'周期 {i} 必须恰好回到提示符一次'
starts = [e['presentationStart'] for e in events]
assert starts == sorted(starts), 'plan 的时间必须递增，且每条命令的输出结束早于下一条开始打字'
json.dump({'cols': cap['cols'], 'rows': cap['rows'], 'events': events,
           'redactions': [{'kind': 'readline-autowrap', 'effect': 'none — wrap reproduced by column layout'}]}, open(out, 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'ok': True, 'events': len(events), 'cycles': len(cap['commands']), 'output': out}))
