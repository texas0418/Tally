// Renders the Tally app icon (option A: four person-colored tally strokes +
// ink slash on warm paper) at 1024x1024 using the 108-unit design grid.
import CoreGraphics
import ImageIO
import Foundation
import UniformTypeIdentifiers

let size = 1024
let s = CGFloat(size) / 108.0

let ctx = CGContext(
  data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
  space: CGColorSpace(name: CGColorSpace.sRGB)!,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!

// Flip to SVG-style y-down coordinates so the design grid maps 1:1.
ctx.translateBy(x: 0, y: CGFloat(size))
ctx.scaleBy(x: s, y: -s)

func rgb(_ hex: UInt32) -> CGColor {
  CGColor(
    red: CGFloat((hex >> 16) & 0xff) / 255,
    green: CGFloat((hex >> 8) & 0xff) / 255,
    blue: CGFloat(hex & 0xff) / 255, alpha: 1
  )
}

// Paper background
ctx.setFillColor(rgb(0xF7F5F0))
ctx.fill(CGRect(x: 0, y: 0, width: 108, height: 108))

// Four person-colored strokes
let strokeColors: [UInt32] = [0x534AB7, 0x1D9E75, 0xD85A30, 0xD4537E]
for (i, c) in strokeColors.enumerated() {
  let r = CGRect(x: 22 + CGFloat(i) * 19, y: 26, width: 9, height: 56)
  ctx.setFillColor(rgb(c))
  ctx.addPath(CGPath(roundedRect: r, cornerWidth: 4.5, cornerHeight: 4.5, transform: nil))
  ctx.fillPath()
}

// Ink slash, rotated -14 degrees about the canvas center
var t = CGAffineTransform(translationX: 54, y: 54)
  .rotated(by: -14 * .pi / 180)
  .translatedBy(x: -54, y: -54)
let slash = CGPath(
  roundedRect: CGRect(x: 8, y: 49.5, width: 92, height: 9),
  cornerWidth: 4.5, cornerHeight: 4.5, transform: &t
)
ctx.setFillColor(rgb(0x1A1A18))
ctx.addPath(slash)
ctx.fillPath()

let image = ctx.makeImage()!
let outURL = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print("wrote \(outURL.path)")
