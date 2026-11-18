import Capacitor
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene, willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    window = UIWindow(windowScene: windowScene)
    // SuntoViewController registers the SuntoStorage plugin.
    window?.rootViewController = SuntoViewController()
    window?.makeKeyAndVisible()

    SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    open(connectionOptions.urlContexts)
  }

  func scene(_ scene: UIScene, openURLContexts urlContexts: Set<UIOpenURLContext>) {
    SceneDelegateProxy.shared.scene(scene, openURLContexts: urlContexts)
    open(urlContexts)
  }

  // A sunto:// link names the view to show, such as sunto://goal from the widget.
  func open(_ urlContexts: Set<UIOpenURLContext>) {
    for context in urlContexts where context.url.scheme == "sunto" {
      (window?.rootViewController as? SuntoViewController)?.storage.open(context.url.host ?? "")
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    SceneDelegateProxy.shared.scene(scene, continue: userActivity)
  }
}
