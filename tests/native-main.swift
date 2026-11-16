import Foundation

let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
defer { try? FileManager.default.removeItem(at: root) }
let a = try StorageCore(root: root.appendingPathComponent("a"))
let b = try StorageCore(root: root.appendingPathComponent("b"))
let folder = root.appendingPathComponent("cloud")
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
try a.select(folder)
try b.select(folder)
let legacyPayload = "{\"version\":1,\"device\":\"a\",\"changes\":{}}"
_ = try a.database(legacyPayload)  // As saved by version 1.
let payload = "{\"version\":2,\"seen\":{},\"notes\":\"Unicode ☘️ and ' quotes\"}"
_ = try a.request("save", data: payload)
let backup = a.root.appendingPathComponent("tasks-v1-backup.sqlite")
assert(FileManager.default.fileExists(atPath: backup.path))
let restarted = try StorageCore(root: a.root)
let loaded = try restarted.database()
assert(loaded == payload)
do {
  _ = try a.request("save", data: legacyPayload)
  fatalError("Must reject version 1 saves")
} catch {}

let deviceA = UUID().uuidString
let deviceB = UUID().uuidString
let gone = UUID().uuidString
let legacyID = UUID().uuidString
let devices = folder.appendingPathComponent("sunto-devices-v2")
let legacy = folder.appendingPathComponent("sunto-changes-v1")
try FileManager.default.createDirectory(at: devices, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: legacy, withIntermediateDirectories: true)
try "{\"from\":\"gone\"}".write(
  to: devices.appendingPathComponent(gone + ".json"), atomically: true, encoding: .utf8)
try "{\"legacy\":true}".write(
  to: legacy.appendingPathComponent(legacyID + ".json"), atomically: true, encoding: .utf8)
try "".write(
  to: legacy.appendingPathComponent(".\(UUID().uuidString).json.icloud"), atomically: true,
  encoding: .utf8)

func push(
  _ core: StorageCore, _ device: String, _ body: String, retired: [String] = [],
  legacy: [String] = []
)
  throws
{
  let request: [String: Any] = [
    "device": device, "snapshot": body, "retired": retired, "legacy": legacy,
  ]
  let data = try JSONSerialization.data(withJSONObject: request)
  _ = try core.request("push", data: String(decoding: data, as: UTF8.self))
}
var pulled = try a.request("pull", data: deviceA)
assert(pulled["files"] as? [String] == ["{\"from\":\"gone\"}"])
assert(pulled["legacy"] as? [String] == ["{\"legacy\":true}"])
assert(pulled["pending"] as? Bool == true)  // The undownloaded placeholder.

try push(a, deviceA, "{\"from\":\"A ☘️\"}", retired: [gone], legacy: [legacyID])
pulled = try b.request("pull", data: deviceB)
assert(pulled["files"] as? [String] == ["{\"from\":\"A ☘️\"}"])
assert((pulled["legacy"] as? [String])?.isEmpty == true)
assert(!FileManager.default.fileExists(atPath: devices.appendingPathComponent(gone + ".json").path))

try push(b, deviceB, "{\"from\":\"B\"}")
try push(a, deviceA, "{\"from\":\"A again\"}")  // Rewrites in place.
let count = try FileManager.default.contentsOfDirectory(atPath: devices.path).count
assert(count == 2)
let fromB = try a.request("pull", data: deviceA)["files"] as? [String]
assert(fromB == ["{\"from\":\"B\"}"])
let fromA = try b.request("pull", data: deviceB)["files"] as? [String]
assert(fromA == ["{\"from\":\"A again\"}"])

// The legacy folder goes once its last file is imported.
for name in try FileManager.default.contentsOfDirectory(atPath: legacy.path) {
  try FileManager.default.removeItem(at: legacy.appendingPathComponent(name))
}
let last = UUID().uuidString
try "{}".write(to: legacy.appendingPathComponent(last + ".json"), atomically: true, encoding: .utf8)
try push(a, deviceA, "{}", legacy: [last])
assert(!FileManager.default.fileExists(atPath: legacy.path))

for bad in [
  "{\"device\":\"not-a-uuid\",\"snapshot\":\"{}\",\"retired\":[],\"legacy\":[]}",
  "{\"device\":\"\(deviceA)\",\"snapshot\":\"{}\",\"retired\":[\"../x\"],\"legacy\":[]}",
  "{\"device\":\"\(deviceA)\",\"snapshot\":\"{}\",\"retired\":[\"\(deviceA)\"],\"legacy\":[]}",
] {
  do {
    _ = try a.request("push", data: bad)
    fatalError("Must reject invalid push")
  } catch {}
}
do {
  _ = try a.request("pull", data: "../escape")
  fatalError("Must reject invalid device")
} catch {}

_ = try a.request("disconnect", data: nil)
let disconnected = try a.folder()
assert(disconnected == nil)
let retained = try a.database()
assert(retained == payload)
print(
  "SQLite restart, v1 backup, Unicode, bookmark, pull, push, retire, legacy cleanup and disconnect passed"
)
