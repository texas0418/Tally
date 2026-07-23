// Renders a branded Tally Pro paywall screenshot (1242x2688) for the App Store
// Connect IAP review screenshot slot. Representative placeholder — swap for a
// real device screenshot before final app submission.
import AppKit

let W = 1242, H = 2688
let img = NSImage(size: NSSize(width: W, height: H))
img.lockFocus()

func rgb(_ hex: UInt32) -> NSColor {
  NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
          green: CGFloat((hex >> 8) & 0xff) / 255,
          blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}

// background (warm paper)
rgb(0xF7F5F0).setFill()
NSRect(x: 0, y: 0, width: W, height: H).fill()

let ctx = NSGraphicsContext.current!.cgContext

// rounded-rect helper
func roundRect(_ r: NSRect, _ radius: CGFloat, _ color: NSColor) {
  let p = NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius)
  color.setFill(); p.fill()
}

// --- tally mark near top (y is bottom-left origin) ---
let strokeColors: [UInt32] = [0x534AB7, 0x1D9E75, 0xD85A30, 0xD4537E]
let markCX = CGFloat(W) / 2, markTop = CGFloat(H) - 300
let sw: CGFloat = 30, sh: CGFloat = 180, gap: CGFloat = 28
let totalW = CGFloat(strokeColors.count) * sw + CGFloat(strokeColors.count - 1) * gap
var sx = markCX - totalW / 2
for c in strokeColors {
  roundRect(NSRect(x: sx, y: markTop - sh, width: sw, height: sh), sw / 2, rgb(c))
  sx += sw + gap
}
// ink slash
ctx.saveGState()
ctx.translateBy(x: markCX, y: markTop - sh / 2)
ctx.rotate(by: -14 * .pi / 180)
roundRect(NSRect(x: -totalW / 2 - 40, y: -17, width: totalW + 80, height: 34), 17, rgb(0x1A1A18))
ctx.restoreGState()

// --- text ---
func draw(_ s: String, size: CGFloat, weight: NSFont.Weight, color: NSColor,
          topFromTop: CGFloat, tracking: CGFloat = 0) {
  let para = NSMutableParagraphStyle(); para.alignment = .center
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: size, weight: weight),
    .foregroundColor: color,
    .paragraphStyle: para,
    .kern: tracking,
  ]
  let str = NSAttributedString(string: s, attributes: attrs)
  let lh = str.size().height
  str.draw(in: NSRect(x: 60, y: CGFloat(H) - topFromTop - lh, width: CGFloat(W) - 120, height: lh + 8))
}

draw("Tally Pro", size: 132, weight: .bold, color: rgb(0x1A1A18), topFromTop: 560, tracking: -1)
draw("Unlimited receipt scans", size: 60, weight: .medium, color: rgb(0x534AB7), topFromTop: 750)

let bullets = [
  "Scan any receipt — no limit",
  "Split by exactly who ordered what",
  "Tip and tax shared fairly, to the cent",
  "Everything stays on your phone",
]
var by: CGFloat = 1010
for b in bullets {
  draw("•   " + b, size: 46, weight: .regular, color: rgb(0x44443F), topFromTop: by)
  by += 108
}

// price + button near lower third
roundRect(NSRect(x: 130, y: CGFloat(H) - 1740, width: CGFloat(W) - 260, height: 150), 24, rgb(0x534AB7))
draw("Unlock unlimited scans — $4.99", size: 48, weight: .semibold, color: .white, topFromTop: 1636)
draw("One-time purchase · restores on any device", size: 38, weight: .regular,
     color: rgb(0x8A8A84), topFromTop: 1820)

img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("wrote \(CommandLine.arguments[1]) — \(W)x\(H)")
