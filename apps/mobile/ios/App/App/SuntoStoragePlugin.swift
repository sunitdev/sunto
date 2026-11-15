import Foundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

@objc(SuntoStoragePlugin)
public class SuntoStoragePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "SuntoStoragePlugin"
    public let jsName = "SuntoStorage"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)]
    private let storageQueue = DispatchQueue(label: "com.sunto.storage")
    private var pickerCall: CAPPluginCall?
    private func core() throws -> StorageCore {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Sunto", isDirectory: true)
        return try StorageCore(root: root)
    }
    @objc func request(_ call: CAPPluginCall) {
        guard let command = call.getString("command") else { call.reject("Missing storage command"); return }
        if command == "choose" {
            DispatchQueue.main.async {
                guard self.pickerCall == nil else { call.reject("Folder picker is already open"); return }
                self.pickerCall = call
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
                picker.delegate = self
                self.bridge?.viewController?.present(picker, animated: true)
            }
            return
        }
        storageQueue.async {
            do { call.resolve(try self.core().request(command, data: call.getString("data"))) }
            catch { call.reject(error.localizedDescription) }
        }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pickerCall else { return }
        pickerCall = nil
        guard let url = urls.first else { call.resolve(); return }
        storageQueue.async {
            do { try self.core().select(url); call.resolve(["folder": url.lastPathComponent]) }
            catch { call.reject(error.localizedDescription) }
        }
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { pickerCall?.resolve(); pickerCall = nil }
}
