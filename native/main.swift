import AppKit
import Foundation

let input = FileHandle.standardInput.readDataToEndOfFile()
do {
  guard CommandLine.arguments.count == 2,
    let options = try JSONSerialization.jsonObject(with: input) as? [String: Any],
    let command = options["command"] as? String
  else { throw NSError(domain: "Sunto", code: 1) }
  let core = try StorageCore(
    root: URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true))
  let result: [String: Any]
  if command == "choose" {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    app.activate(ignoringOtherApps: true)
    let panel = NSOpenPanel()
    panel.title = "Choose the same iCloud Drive/Sunto folder on both devices"
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    if panel.runModal() == .OK, let url = panel.url {
      try core.select(url)
      result = ["folder": url.lastPathComponent]
    } else {
      result = [:]
    }
  } else {
    result = try core.request(command, data: options["data"] as? String)
  }
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
} catch {
  FileHandle.standardError.write(Data(error.localizedDescription.utf8))
  exit(1)
}
