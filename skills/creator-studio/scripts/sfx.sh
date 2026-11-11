#!/bin/bash
# 用 ffmpeg 合成一套口播包装音效（无采样、无版权）：bash sfx.sh <输出目录>
# 峰值统一到 -6 dBFS，实际音量由 build.mjs 按事件类型给（比人声低 8–14 dB，听得到但不抢话）。合成表达式移植自 scrapbook-koubo。
set -e
O="${1:-assets/sfx}"; mkdir -p "$O"; TMP="$(mktemp -d)"
g() {   # g <名字> <aevalsrc 表达式> <时长> <滤镜>
  ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='$2':s=48000:d=$3" -af "$4" -ar 48000 -ac 2 "$TMP/$1.wav"
  local peak
  peak=$(ffmpeg -hide_banner -i "$TMP/$1.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p')
  ffmpeg -loglevel error -y -i "$TMP/$1.wav" -af "volume=$(echo "-6 - ($peak)" | bc -l)dB" "$O/$1.wav"
}
SOFT="lowpass=f=5200,highpass=f=90"
# pop：贴纸 / 卡片弹出
i=1; for F in 520 640 760; do
  g pop_$i "0.8*(1-exp(-400*t))*exp(-26*t)*(sin(2*PI*($F*t-1.6*$F*t*t))+0.25*sin(4*PI*($F*t-1.6*$F*t*t)))" 0.22 "lowpass=f=3600,highpass=f=120"; i=$((i+1)); done
# tick：数字、清单条目、抖动
i=1; for F in 1150 1450; do
  g tick_$i "exp(-55*t)*sin(2*PI*$F*t)*(1-exp(-900*t))" 0.1 "bandpass=f=$F:width_type=q:w=1.2,$SOFT"; i=$((i+1)); done
# hit：撞字（低频一下 + 一点咔）
i=1; for F in 78 96; do
  g hit_$i "0.9*exp(-28*t)*sin(2*PI*($F*t-30*t*t))+0.3*lt(t,0.006)*(random(0)*2-1)" 0.3 "lowpass=f=2400"; i=$((i+1)); done
# whoosh：换场、版式切换、滑入
i=1; for D in 0.45 0.55; do
  LP=$((1500 + i * 500))
  g whoosh_$i "(random(0)*2-1)*pow(sin(PI*t/$D),2.2)" $D "highpass=f=150,lowpass=f=$LP"; i=$((i+1)); done
# swish：闪白、划线
g swish_1 "(random(0)*2-1)*pow(sin(PI*t/0.3),1.2)*(1-0.6*t/0.3)" 0.3 "bandpass=f=2800:width_type=h:w=2400,lowpass=f=5500"
# type：打字
g type_1 "lt(mod(t*(1+0.2*sin(2*PI*2.1*t)),0.07),0.004)*(random(0)*2-1)" 0.6 "bandpass=f=2600:width_type=h:w=2800,lowpass=f=5500"
# ding、click：留给手动用（"sfx" 里没有自动映射）
g ding_1 "0.3*exp(-5*t)*sin(2*PI*1318.5*t)+0.22*gte(t,0.09)*exp(-5*(t-0.09))*sin(2*PI*1975.5*(t-0.09))" 1.0 "lowpass=f=6500"
g click_1 "0.9*exp(-1300*t)*sin(2*PI*2600*t)+0.6*gte(t,0.055)*exp(-1500*(t-0.055))*sin(2*PI*2100*(t-0.055))" 0.14 "lowpass=f=6000"
rm -rf "$TMP"
echo "{\"ok\":true,\"sfx\":$(ls "$O"/*_*.wav | wc -l | tr -d ' '),\"dir\":\"$O\"}"
