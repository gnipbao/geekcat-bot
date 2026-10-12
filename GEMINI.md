# GEMINI.md

本仓库的 agent 操作手册在 AGENTS.md，所有规则和流程以它为准：

@AGENTS.md

Gemini CLI 提示：所有命令在仓库根目录用 shell 工具执行；每条命令最后一行输出 JSON，先看 `"ok"` 字段再继续。需要目视检查时，用 `still` 命令渲染 PNG，再用 read_file 读取图片。
