#!/usr/bin/env python3
"""record-terminal Gate 2：按 runbook 在真实 PTY 里执行命令，捕获原始字节与时间。

用法：python3 pty_capture.py terminal/runbook.json terminal/capture.json

runbook.json：
{
  "cwd": "/abs/path/where/commands/run",
  "user": "zhishimao",            # 提示符里显示的用户名（不必是真实用户名）
  "path": "~/demo",               # 提示符里显示的路径
  "cols": 118, "rows": 28,
  "commands": ["npx -y some-cli --json 2>&1 >ev.json | jq -rR 'fromjson?|.msg'", "jq .stats ev.json"],
  "timeout": 180,                 # 单条命令最长等待（秒）
  "cleanup": ["ev.json"],         # 结束后删除的临时文件（相对 cwd）
  "plan": [[120.2, 2.0, 122.5, 2.3], ...]   # terminal_ledger.py 用：每条命令 [开始打字, 打字时长, 输出开始, 输出时长]（旁白绝对秒）
}
注意：npx 一律加 -y（否则确认提示会被管道吞掉而卡住）；用 bash 而不是 zsh（zsh 的行编辑器会重绘出重复字符）。
"""
import os, pty, sys, time, json, select, struct, fcntl, termios

rb = json.load(open(sys.argv[1])); out = sys.argv[2]
COLS, ROWS = rb.get('cols', 118), rb.get('rows', 28)
GLYPH = '❯'
PS1 = f"\\[\\e[32m\\]{rb.get('user', 'cat')}\\[\\e[0m\\] \\[\\e[34m\\]{rb.get('path', '~')}\\[\\e[0m\\] \\[\\e[35m\\]{GLYPH}\\[\\e[0m\\] "
env = dict(os.environ, BASH_SILENCE_DEPRECATION_WARNING='1', PS1=PS1, TERM='xterm-256color', COLUMNS=str(COLS), LINES=str(ROWS))

pid, fd = pty.fork()
if pid == 0:
    os.chdir(rb['cwd'])
    os.execvpe('/bin/bash', ['/bin/bash', '--norc', '--noprofile', '-i'], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
t0 = time.monotonic(); events = []; buf = b''

def pump(timeout):
    global buf
    end = time.monotonic() + timeout
    while True:
        rem = end - time.monotonic()
        if rem <= 0: return
        r, _, _ = select.select([fd], [], [], rem)
        if not r: return
        try: data = os.read(fd, 65536)
        except OSError: return
        if not data: return
        events.append({'t': round(time.monotonic() - t0, 4), 'dir': 'out', 'data': data.decode('utf-8', 'replace')})
        buf += data

def wait_prompt(timeout):
    # 回到提示符 = 最后一行出现提示符字形，且 0.8 秒内没有新输出
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        n = len(events); pump(0.8)
        if len(events) == n and GLYPH.encode() in buf.split(b'\n')[-1]: return True
    return False

pump(1.5); wait_prompt(10)
for cmd in rb['commands']:
    buf = b''; time.sleep(0.6)
    events.append({'t': round(time.monotonic() - t0, 4), 'dir': 'in', 'data': cmd + '\r'})
    os.write(fd, (cmd + '\r').encode())
    pump(0.5)
    if not wait_prompt(rb.get('timeout', 180)):
        print(f'✗ 命令没有在 {rb.get("timeout", 180)} 秒内回到提示符：{cmd}', file=sys.stderr)
    pump(0.3)
events.append({'t': round(time.monotonic() - t0, 4), 'dir': 'in', 'data': 'exit\r'})
os.write(fd, b'exit\r'); pump(1.0)
_, status = os.waitpid(pid, 0)
for f in rb.get('cleanup', []):
    try: os.remove(os.path.join(rb['cwd'], f))
    except FileNotFoundError: pass
json.dump({'cols': COLS, 'rows': ROWS, 'shell': '/bin/bash --norc --noprofile -i', 'user': rb.get('user', 'cat'), 'path': rb.get('path', '~'),
           'commands': rb['commands'], 'exit_status': os.waitstatus_to_exitcode(status), 'events': events},
          open(out, 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'ok': True, 'events': len(events), 'exit': os.waitstatus_to_exitcode(status), 'output': out}))
