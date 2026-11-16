import Foundation
import SQLite3

final class StorageCore {
  let root: URL
  init(root: URL) throws {
    self.root = root
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  }
  func failure(_ message: String) -> NSError {
    NSError(domain: "SuntoStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  func database(_ data: String? = nil) throws -> String? {
    var db: OpaquePointer?
    guard sqlite3_open(root.appendingPathComponent("tasks.sqlite").path, &db) == SQLITE_OK else {
      throw failure("Cannot open local SQLite database")
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 5000)
    func execute(_ sql: String) throws {
      guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
        throw failure(String(cString: sqlite3_errmsg(db)))
      }
    }
    var version: OpaquePointer?
    sqlite3_prepare_v2(db, "PRAGMA user_version", -1, &version, nil)
    defer { sqlite3_finalize(version) }
    guard sqlite3_step(version) == SQLITE_ROW, sqlite3_column_int(version, 0) <= 1 else {
      throw failure("Database was created by a newer Sunto version")
    }
    try execute(
      "PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); PRAGMA user_version=1;"
    )
    var stmt: OpaquePointer?
    defer { sqlite3_finalize(stmt) }
    if let data = data {
      try execute("BEGIN IMMEDIATE")
      do {
        guard
          sqlite3_prepare_v2(
            db,
            "INSERT INTO app_state VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            -1, &stmt, nil) == SQLITE_OK
        else { throw failure("Cannot prepare save") }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        guard sqlite3_bind_text(stmt, 1, data, -1, transient) == SQLITE_OK,
          sqlite3_step(stmt) == SQLITE_DONE
        else { throw failure("Cannot save tasks: \(String(cString: sqlite3_errmsg(db)))") }
        try execute("COMMIT")
      } catch {
        try? execute("ROLLBACK")
        throw error
      }
      return nil
    }
    guard
      sqlite3_prepare_v2(db, "SELECT payload FROM app_state WHERE id=1", -1, &stmt, nil)
        == SQLITE_OK
    else { throw failure("Cannot read tasks") }
    let status = sqlite3_step(stmt)
    if status == SQLITE_DONE { return nil }
    guard status == SQLITE_ROW, let text = sqlite3_column_text(stmt, 0) else {
      throw failure("Cannot read tasks")
    }
    return String(cString: text)
  }
  // Keeps a copy of a version 1 database before it is first saved as
  // version 2, since that save drops its change history.
  func backupLegacyDatabase() throws {
    let backup = root.appendingPathComponent("tasks-v1-backup.sqlite")
    guard !FileManager.default.fileExists(atPath: backup.path),
      let current = try database(),
      let parsed = try? JSONSerialization.jsonObject(with: Data(current.utf8)) as? [String: Any],
      parsed["version"] as? Int == 1
    else { return }
    try FileManager.default.copyItem(at: root.appendingPathComponent("tasks.sqlite"), to: backup)
  }
  var bookmarkURL: URL { root.appendingPathComponent("sync-folder.bookmark") }
  func select(_ url: URL) throws {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    #if os(macOS)
      let options: URL.BookmarkCreationOptions = [.withSecurityScope]
    #else
      let options: URL.BookmarkCreationOptions = [.minimalBookmark]
    #endif
    try url.bookmarkData(options: options, includingResourceValuesForKeys: nil, relativeTo: nil)
      .write(to: bookmarkURL, options: .atomic)
  }
  func folder() throws -> URL? {
    guard FileManager.default.fileExists(atPath: bookmarkURL.path) else { return nil }
    var stale = false
    #if os(macOS)
      let options: URL.BookmarkResolutionOptions = [.withSecurityScope, .withoutUI]
    #else
      let options: URL.BookmarkResolutionOptions = [.withoutUI]
    #endif
    let url = try URL(
      resolvingBookmarkData: Data(contentsOf: bookmarkURL), options: options, relativeTo: nil,
      bookmarkDataIsStale: &stale)
    if stale { try select(url) }
    return url
  }
  // Each device writes only its own file here, so iCloud never has to merge.
  let devicesFolder = "sunto-devices-v2"
  // Version 1 kept one file per change; they are imported, then removed.
  let legacyFolder = "sunto-changes-v1"
  func coordinate(writing: Bool, _ work: (URL) throws -> [String: Any]) throws -> [String: Any] {
    guard let url = try folder() else { throw failure("Choose your iCloud Drive/Sunto folder") }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    var coordinationError: NSError?
    var result: Result<[String: Any], Error> = .success([:])
    let coordinator = NSFileCoordinator()
    if writing {
      coordinator.coordinate(writingItemAt: url, options: .forMerging, error: &coordinationError) {
        target in result = Result { try work(target) }
      }
    } else {
      coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) {
        target in result = Result { try work(target) }
      }
    }
    if let error = coordinationError { throw error }
    return try result.get()
  }
  // The JSON files in `dir`, other than `except`. Files iCloud has not fully
  // downloaded yet are requested and set `pending`.
  func read(_ dir: URL, except: String?, pending: inout Bool) throws -> [String] {
    guard FileManager.default.fileExists(atPath: dir.path) else { return [] }
    var files: [String] = []
    for file in try FileManager.default.contentsOfDirectory(
      at: dir, includingPropertiesForKeys: [.ubiquitousItemDownloadingStatusKey])
    {
      let name = file.lastPathComponent
      // iCloud shows a file it has not downloaded as ".<name>.icloud".
      if name.hasPrefix("."), name.hasSuffix(".json.icloud") {
        try? FileManager.default.startDownloadingUbiquitousItem(
          at: dir.appendingPathComponent(String(name.dropFirst().dropLast(7))))
        pending = true
        continue
      }
      guard !name.hasPrefix("."), file.pathExtension == "json", name != except else { continue }
      let status = try file.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
        .ubiquitousItemDownloadingStatus
      if let status = status, status != .current {
        try? FileManager.default.startDownloadingUbiquitousItem(at: file)
        pending = true
        if status == .notDownloaded { continue }
      }
      files.append(try String(contentsOf: file, encoding: .utf8))
    }
    return files
  }
  func request(_ command: String, data: String?) throws -> [String: Any] {
    switch command {
    case "load":
      var result: [String: Any] = [:]
      if let data = try database() { result["data"] = data }
      // A broken bookmark must not prevent loading local tasks.
      if FileManager.default.fileExists(atPath: bookmarkURL.path) {
        result["folder"] = (try? folder()?.lastPathComponent) ?? "Reselect sync folder"
      }
      return result
    case "save":
      guard let data = data,
        let parsed = try JSONSerialization.jsonObject(with: Data(data.utf8)) as? [String: Any],
        parsed["version"] as? Int == 2
      else { throw failure("Invalid save request") }
      try backupLegacyDatabase()
      _ = try database(data)
      return [:]
    case "disconnect":
      if FileManager.default.fileExists(atPath: bookmarkURL.path) {
        try FileManager.default.removeItem(at: bookmarkURL)
      }
      return [:]
    case "pull":
      guard let device = data, UUID(uuidString: device) != nil else {
        throw failure("Invalid sync request")
      }
      return try coordinate(writing: false) { url in
        var pending = false
        let files = try self.read(
          url.appendingPathComponent(self.devicesFolder), except: device + ".json",
          pending: &pending)
        let legacy = try self.read(
          url.appendingPathComponent(self.legacyFolder), except: nil, pending: &pending)
        return ["files": files, "legacy": legacy, "pending": pending]
      }
    case "push":
      guard let data = data,
        let request = try JSONSerialization.jsonObject(with: Data(data.utf8)) as? [String: Any],
        let device = request["device"] as? String, UUID(uuidString: device) != nil,
        let snapshot = request["snapshot"] as? String,
        let retired = request["retired"] as? [String],
        let legacy = request["legacy"] as? [String],
        (retired + legacy).allSatisfy({ UUID(uuidString: $0) != nil }), !retired.contains(device)
      else { throw failure("Invalid sync request") }
      return try coordinate(writing: true) { url in
        let devices = url.appendingPathComponent(self.devicesFolder, isDirectory: true)
        try FileManager.default.createDirectory(at: devices, withIntermediateDirectories: true)
        try Data(snapshot.utf8).write(
          to: devices.appendingPathComponent(device + ".json"), options: .atomic)
        for id in retired {
          try? FileManager.default.removeItem(at: devices.appendingPathComponent(id + ".json"))
        }
        let old = url.appendingPathComponent(self.legacyFolder, isDirectory: true)
        for id in legacy {
          try? FileManager.default.removeItem(at: old.appendingPathComponent(id + ".json"))
        }
        if (try? FileManager.default.contentsOfDirectory(atPath: old.path))?.isEmpty == true {
          try? FileManager.default.removeItem(at: old)
        }
        return [:]
      }
    default: throw failure("Unknown storage command")
    }
  }
}
