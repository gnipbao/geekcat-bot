// 在视频里均匀取 N 帧，用 Vision 找最大的人脸框，输出中位数（0–1，左上原点）。prep.py 首次用时自动编译。
// 用法：face <video> [N]
import AVFoundation
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count > 1 else { print("{\"found\":0}"); exit(0) }
let n = args.count > 2 ? (Int(args[2]) ?? 11) : 11
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let dur = CMTimeGetSeconds(asset.duration)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
var xs: [Double] = [], ys: [Double] = [], ws: [Double] = [], hs: [Double] = []
for i in 0..<n {
    let t = CMTime(seconds: dur * (Double(i) + 0.5) / Double(n), preferredTimescale: 600)
    guard let img = try? gen.copyCGImage(at: t, actualTime: nil) else { continue }
    let req = VNDetectFaceRectanglesRequest()
    try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
    guard let faces = req.results, let f = faces.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else { continue }
    let b = f.boundingBox
    xs.append(Double(b.midX)); ys.append(1 - Double(b.midY)); ws.append(Double(b.width)); hs.append(Double(b.height))
}
func med(_ a: [Double]) -> Double { let s = a.sorted(); return s.isEmpty ? -1 : s[s.count / 2] }
print("{\"found\": \(xs.count), \"x\": \(med(xs)), \"y\": \(med(ys)), \"w\": \(med(ws)), \"h\": \(med(hs))}")
