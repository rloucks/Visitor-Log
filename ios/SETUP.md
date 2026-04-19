# Xcode Kiosk App Setup

A minimal WKWebView wrapper that gives true fullscreen, trusts the self-signed cert
in code (no profile install needed), and enables camera access natively.

## Requirements

- Mac with Xcode 15 or later
- Apple Developer account ($99/yr individual) — needed to install on a device
- iPad connected via USB

---

## Create the Xcode project

1. Open Xcode → **Create New Project**
2. Choose **iOS → App** → Next
3. Set:
   - **Product Name**: `VisitorKiosk`
   - **Interface**: `Storyboard`
   - **Language**: `Swift`
   - Uncheck **Include Tests**
4. Save it anywhere — the folder name doesn't matter

---

## Replace the default ViewController

1. In the project navigator, open `ViewController.swift`
2. Replace the entire contents with `ViewController.swift` from this folder
3. Change the `kioskURL` constant to your server's LAN IP:
   ```swift
   private let kioskURL = "https://192.168.1.55"
   ```

---

## Update Info.plist

Add these two entries to `Info.plist` (right-click → Open As → Source Code):

```xml
<!-- Camera permission — shown once when the app first requests the camera -->
<key>NSCameraUsageDescription</key>
<string>Used to take a photo of visitors during check-in.</string>

<!-- Hide status bar on launch -->
<key>UIStatusBarHidden</key>
<true/>

<key>UIViewControllerBasedStatusBarAppearance</key>
<true/>
```

---

## Remove the Main storyboard reference (optional but cleaner)

By default the app loads a blank white screen from the storyboard before the
ViewController appears. To skip it and go straight to your view:

1. Delete `Main.storyboard` from the project (Move to Trash)
2. In `Info.plist`, delete the entry `UIMainStoryboardFile` (or `Main storyboard file base name`)
3. Open `SceneDelegate.swift` and replace `willConnectTo` with:

```swift
func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
           options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    window = UIWindow(windowScene: windowScene)
    window?.rootViewController = ViewController()
    window?.makeKeyAndVisible()
}
```

---

## Signing & deployment

1. Click the top-level project in the navigator → **Signing & Capabilities**
2. Select your **Team** (your Apple Developer account)
3. Xcode will auto-manage the provisioning profile
4. Connect the iPad via USB → trust the Mac on the iPad when prompted
5. Select the iPad as the run destination (top bar)
6. Hit **Run** (▶)

The app installs and opens. On first launch iOS will ask for camera permission — tap Allow.

---

## Kiosk lockdown (optional)

To prevent anyone from leaving the app, enable **Guided Access**:

- Settings → Accessibility → Guided Access → On
- Open the Visitor Kiosk app
- Triple-click the side button → Start

To exit: triple-click side button → enter your passcode.

---

## Updating the app

The app just loads a URL — changes to the web app (Node.js server) appear
automatically without rebuilding the Xcode project. You only need to rebuild
if you change the server IP or other native settings.
