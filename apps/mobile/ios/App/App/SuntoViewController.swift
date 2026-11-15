import Capacitor
class SuntoViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(SuntoStoragePlugin()) }
}
