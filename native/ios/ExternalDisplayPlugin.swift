// StaffList — TV output for the iPad / iPhone app.
//
// When an AirPlay TV is connected (Control Center → Screen Mirroring), iOS offers it to the app
// as a second screen. This plugin puts a window on that screen with its own web view showing
// the presentation page (/present/<set>?tv=1), so the TV shows only the Now Showing slide while
// the iPad / iPhone keeps showing the controller. Without this, iOS mirrors the whole screen.
//
// JavaScript side: src/lib/externalDisplay.js  (plugin name "ExternalDisplay")
//   getStatus()        -> { connected, name }
//   show({ url })      -> show url on the TV now, or as soon as a TV connects
//   hide()             -> remove it (the TV goes back to mirroring)
//   send({ payload })  -> hand a control message to the TV page (window.staffListReceive)
//   event "change"     -> { connected, name } when a TV connects or disconnects
//
// The app does not use UIScenes (Capacitor's default), so the classic UIScreen API is used.

import Capacitor
import UIKit
import WebKit
import AVFoundation

@objc(ExternalDisplayPlugin)
public class ExternalDisplayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ExternalDisplayPlugin"
    public let jsName = "ExternalDisplay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
    ]

    private var tvWindow: UIWindow?
    private var tvWebView: WKWebView?
    private var url: URL?

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(screenDidConnect(_:)), name: UIScreen.didConnectNotification, object: nil)
        nc.addObserver(self, selector: #selector(screenDidDisconnect(_:)), name: UIScreen.didDisconnectNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    // MARK: - JavaScript API

    @objc func getStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.status()) }
    }

    @objc func show(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let u = URL(string: s) else {
            call.reject("A url is required"); return
        }
        DispatchQueue.main.async {
            self.url = u
            if let web = self.tvWebView {
                if web.url != u { web.load(URLRequest(url: u)) }
            } else if let screen = self.externalScreen() {
                self.attach(to: screen)
            }
            call.resolve(self.status())
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.url = nil
            self.detach()
            call.resolve()
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        let payload = call.getObject("payload") ?? [:]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("Payload must be JSON"); return
        }
        DispatchQueue.main.async {
            self.tvWebView?.evaluateJavaScript("window.staffListReceive && window.staffListReceive(\(json))", completionHandler: nil)
            call.resolve()
        }
    }

    // MARK: - Screens

    @objc private func screenDidConnect(_ note: Notification) {
        guard let screen = note.object as? UIScreen else { return }
        DispatchQueue.main.async {
            if self.url != nil && self.tvWindow == nil { self.attach(to: screen) }
            self.notifyListeners("change", data: self.status(connected: true))
        }
    }

    @objc private func screenDidDisconnect(_ note: Notification) {
        DispatchQueue.main.async {
            self.detach()
            self.notifyListeners("change", data: self.status(connected: false))
        }
    }

    private func externalScreen() -> UIScreen? {
        UIScreen.screens.first { $0 != UIScreen.main }
    }

    private func attach(to screen: UIScreen) {
        guard let url = url else { return }
        detach()

        // Share the app's cookies / storage so the TV page is signed in like the controller.
        let config = WKWebViewConfiguration()
        if let main = bridge?.webView?.configuration {
            config.processPool = main.processPool
            config.websiteDataStore = main.websiteDataStore
        }
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addUserScript(WKUserScript(
            source: "window.__STAFFLIST_TV__ = true;",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let web = WKWebView(frame: screen.bounds, configuration: config)
        web.isOpaque = true
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.load(URLRequest(url: url))

        let vc = UIViewController()
        vc.view.backgroundColor = .black
        vc.view.addSubview(web)
        web.frame = vc.view.bounds

        let window = UIWindow(frame: screen.bounds)
        window.screen = screen
        window.rootViewController = vc
        window.backgroundColor = .black
        window.isHidden = false

        tvWindow = window
        tvWebView = web
    }

    private func detach() {
        tvWebView?.stopLoading()
        tvWindow?.isHidden = true
        tvWindow = nil
        tvWebView = nil
    }

    private func status(connected: Bool? = nil) -> [String: Any] {
        let isConnected = connected ?? (externalScreen() != nil)
        var out: [String: Any] = ["connected": isConnected]
        if isConnected, let name = airPlayName() { out["name"] = name }
        return out
    }

    // The AirPlay device's name ("Sanctuary TV"), when iOS reports one.
    private func airPlayName() -> String? {
        AVAudioSession.sharedInstance().currentRoute.outputs.first { $0.portType == .airPlay }?.portName
    }
}
