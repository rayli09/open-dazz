import Tauri
import UIKit
import WebKit

final class IOSUIPlugin: Plugin {
    public override func load(webview: WKWebView) {
        // The web layout owns safe-area padding. UIKit must not inset it again.
        webview.scrollView.contentInsetAdjustmentBehavior = .never
        let background = UIColor(red: 0x29 / 255, green: 0x2f / 255, blue: 0x32 / 255, alpha: 1)
        webview.isOpaque = false
        webview.backgroundColor = background
        webview.scrollView.backgroundColor = background
        webview.superview?.backgroundColor = background
    }
}

@_cdecl("init_plugin_ios_ui")
public func initPlugin() -> Plugin { IOSUIPlugin() }
