import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!

    // ── Change this to your server's LAN IP ──────────────────────────────────
    private let kioskURL = "https://192.168.1.55"
    // ─────────────────────────────────────────────────────────────────────────

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupWebView()
        loadKiosk()
    }

    // MARK: - Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // Required for camera capture (getUserMedia)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .black

        view.addSubview(webView)

        // Edge-to-edge — fills behind the status bar and home indicator
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func loadKiosk() {
        guard let url = URL(string: kioskURL) else { return }
        webView.load(URLRequest(url: url))
    }

    // MARK: - Full-screen

    // Hide the status bar completely
    override var prefersStatusBarHidden: Bool { true }

    // Hide the home indicator (bottom swipe bar)
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    // Use the full screen including notch/corners
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {

    // Trust the self-signed certificate — no manual cert install needed on the iPad
    func webView(
        _ webView: WKWebView,
        didReceiveAuthenticationChallenge challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard
            challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
            let serverTrust = challenge.protectionSpace.serverTrust
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
    }

    // Auto-retry if the server is temporarily unreachable (e.g. container restart)
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        scheduleReload()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        scheduleReload()
    }

    private func scheduleReload() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.loadKiosk()
        }
    }
}
