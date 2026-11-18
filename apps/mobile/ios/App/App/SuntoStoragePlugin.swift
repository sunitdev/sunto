import Capacitor
import Foundation
import UIKit
import UniformTypeIdentifiers
import WidgetKit

@objc(SuntoStoragePlugin)
public class SuntoStoragePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
  public let identifier = "SuntoStoragePlugin"
  public let jsName = "SuntoStorage"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
  ]
  private let storageQueue = DispatchQueue(label: "com.sunto.storage")
  private var pickerCall: CAPPluginCall?
  private func core() throws -> StorageCore {
    let root = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    ).appendingPathComponent("Sunto", isDirectory: true)
    return try StorageCore(root: root)
  }
  @objc func request(_ call: CAPPluginCall) {
    guard let command = call.getString("command") else {
      call.reject("Missing storage command")
      return
    }
    if command == "choose" {
      DispatchQueue.main.async {
        guard self.pickerCall == nil else {
          call.reject("Folder picker is already open")
          return
        }
        self.pickerCall = call
        let picker = UIDocumentPickerViewController(
          forOpeningContentTypes: [.folder], asCopy: false)
        picker.delegate = self
        self.bridge?.viewController?.present(picker, animated: true)
      }
      return
    }
    storageQueue.async {
      do {
        call.resolve(
          try self.widget(command, data: call.getString("data"))
            ?? self.core().request(command, data: call.getString("data")))
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }
  // The widget's copy of Today's Goal, and the to-dos ticked in it, or nil
  // for a command the storage core handles.
  func widget(_ command: String, data: String?) throws -> [String: Any]? {
    switch command {
    case "widget":
      guard let data = data else { throw SharedGoal.failure("Invalid widget request") }
      try SharedGoal.save(data)
      WidgetCenter.shared.reloadAllTimelines()
      return [:]
    case "widget-ticks":
      let ticks = try SharedGoal.ticks()
      return ticks.isEmpty
        ? [:] : ["data": String(decoding: try JSONEncoder().encode(ticks), as: UTF8.self)]
    case "widget-clear":
      guard let count = data.flatMap({ Int($0) }), count >= 0 else {
        throw SharedGoal.failure("Invalid widget request")
      }
      try SharedGoal.clear(count)
      WidgetCenter.shared.reloadAllTimelines()
      return [:]
    default: return nil
    }
  }
  // Asks the web app to show `view`, once it listens if it does not yet.
  func open(_ view: String) {
    notifyListeners("open", data: ["view": view], retainUntilConsumed: true)
  }
  public func documentPicker(
    _ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]
  ) {
    guard let call = pickerCall else { return }
    pickerCall = nil
    guard let url = urls.first else {
      call.resolve()
      return
    }
    storageQueue.async {
      do {
        try self.core().select(url)
        call.resolve(["folder": url.lastPathComponent])
      } catch { call.reject(error.localizedDescription) }
    }
  }
  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pickerCall?.resolve()
    pickerCall = nil
  }
}
