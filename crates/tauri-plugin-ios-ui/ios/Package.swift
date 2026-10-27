// swift-tools-version:5.5
import PackageDescription
let package = Package(
    name: "tauri-plugin-ios-ui",
    platforms: [.iOS(.v15)],
    products: [.library(name: "tauri-plugin-ios-ui", type: .static, targets: ["tauri-plugin-ios-ui"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "tauri-plugin-ios-ui", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
