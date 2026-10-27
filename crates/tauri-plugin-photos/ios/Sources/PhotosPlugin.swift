import Foundation
import Photos
import SwiftRs
import Tauri

private struct SavePhotoArgs: Decodable {
    let data: String
}

final class PhotosPlugin: Plugin {
    @objc public func savePhoto(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SavePhotoArgs.self)
        guard let data = Data(base64Encoded: args.data), !data.isEmpty else {
            invoke.reject("Invalid image data")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                invoke.reject("Photos access was denied. Enable Add Photos access in Settings.")
                return
            }
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: nil)
            } completionHandler: { saved, error in
                if saved {
                    invoke.resolve([:])
                } else {
                    invoke.reject(error?.localizedDescription ?? "Could not save the photo to Photos.")
                }
            }
        }
    }
}

@_cdecl("init_plugin_photos")
public func initPlugin() -> Plugin {
    PhotosPlugin()
}
