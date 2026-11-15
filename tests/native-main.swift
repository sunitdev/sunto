import Foundation

let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer { try? FileManager.default.removeItem(at: root) }
let a = try StorageCore(root: root.appendingPathComponent("a"))
let b = try StorageCore(root: root.appendingPathComponent("b"))
let folder = root.appendingPathComponent("cloud")
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
try a.select(folder)
try b.select(folder)
let payload = "{\"version\":1,\"changes\":{},\"notes\":\"Unicode ☘️ and ' quotes\"}"
_ = try a.request("save", data: payload)
let restarted = try StorageCore(root: a.root)
let loaded = try restarted.database()
assert(loaded == payload)
let id = UUID().uuidString
let json =
  "[{\"version\":1,\"id\":\"\(id)\",\"task\":\"task\",\"device\":\"a\",\"revision\":1,\"patch\":{\"title\":\"From A\"}}]"
let sent = try a.request("exchange", data: json)
assert((sent["files"] as? [String])?.count == 1)
let received = try b.request("exchange", data: "[]")
assert((received["files"] as? [String])?.count == 1)
_ = try a.request("exchange", data: json)  // Retry does not overwrite or duplicate.
let conflicting = json.replacingOccurrences(of: "From A", with: "Conflict")
do {
  _ = try b.request("exchange", data: conflicting)
  fatalError("Must reject conflicting ID")
} catch {}
_ = try a.request("disconnect", data: nil)
let disconnected = try a.folder()
assert(disconnected == nil)
let retained = try a.database()
assert(retained == payload)
print("SQLite restart, Unicode, bookmark, exchange, retry, collision and disconnect passed")
