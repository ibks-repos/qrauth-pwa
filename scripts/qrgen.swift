// Write a QR code (error correction M, like libqrencode in pam_qrauth) for a payload as a PNG.
// Usage: swift scripts/qrgen.swift PAYLOAD OUT.png [SCALE]

import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: qrgen PAYLOAD OUT.png [SCALE]\n".data(using: .utf8)!)
    exit(2)
}
let scale = args.count > 3 ? CGFloat(Double(args[3]) ?? 8) : 8
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(args[1].data(using: .ascii), forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
let image = filter.outputImage!.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
let context = CIContext()
let cg = context.createCGImage(image, from: image.extent)!
let url = URL(fileURLWithPath: args[2]) as CFURL
let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, cg, nil)
guard CGImageDestinationFinalize(dest) else { exit(1) }
