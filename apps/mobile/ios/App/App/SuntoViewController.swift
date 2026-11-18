import Capacitor

class SuntoViewController: CAPBridgeViewController {
  let storage = SuntoStoragePlugin()
  override func capacitorDidLoad() { bridge?.registerPluginInstance(storage) }
}
