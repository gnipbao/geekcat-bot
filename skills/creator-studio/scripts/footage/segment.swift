// 中文分词（macOS 系统自带的 NaturalLanguage）：每个参数一句话，每行输出这句话的词，用 U+001F 分隔。
// captions.py 用它决定字幕在哪里断行（只在词和词之间断）。别的系统没有它，captions.py 会退回到按虚词规则断。
import Foundation
import NaturalLanguage
for text in CommandLine.arguments.dropFirst() {
    let tk = NLTokenizer(unit: .word); tk.string = text; tk.setLanguage(.simplifiedChinese)
    var out: [String] = []
    tk.enumerateTokens(in: text.startIndex..<text.endIndex) { r, _ in out.append(String(text[r])); return true }
    print(out.joined(separator: "\u{1f}"))
}
