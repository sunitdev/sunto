import Foundation
import SQLite3

final class StorageCore {
    let root: URL
    init(root: URL) throws {
        self.root = root
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    func failure(_ message: String) -> NSError { NSError(domain: "SuntoStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    func database(_ data: String? = nil) throws -> String? {
        var db: OpaquePointer?
        guard sqlite3_open(root.appendingPathComponent("tasks.sqlite").path, &db) == SQLITE_OK else { throw failure("Cannot open local SQLite database") }
        defer { sqlite3_close(db) }
        sqlite3_busy_timeout(db, 5000)
        func execute(_ sql: String) throws {
            guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw failure(String(cString: sqlite3_errmsg(db))) }
        }
        var version: OpaquePointer?
        sqlite3_prepare_v2(db, "PRAGMA user_version", -1, &version, nil)
        defer { sqlite3_finalize(version) }
        guard sqlite3_step(version) == SQLITE_ROW, sqlite3_column_int(version, 0) <= 1 else { throw failure("Database was created by a newer Sunto version") }
        try execute("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); PRAGMA user_version=1;")
        var stmt: OpaquePointer?
        defer { sqlite3_finalize(stmt) }
        if let data = data {
            try execute("BEGIN IMMEDIATE")
            do {
                guard sqlite3_prepare_v2(db, "INSERT INTO app_state VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", -1, &stmt, nil) == SQLITE_OK else { throw failure("Cannot prepare save") }
                let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                guard sqlite3_bind_text(stmt, 1, data, -1, transient) == SQLITE_OK, sqlite3_step(stmt) == SQLITE_DONE else { throw failure("Cannot save tasks: \(String(cString: sqlite3_errmsg(db)))") }
                try execute("COMMIT")
            } catch { try? execute("ROLLBACK"); throw error }
            return nil
        }
        guard sqlite3_prepare_v2(db, "SELECT payload FROM app_state WHERE id=1", -1, &stmt, nil) == SQLITE_OK else { throw failure("Cannot read tasks") }
        let status = sqlite3_step(stmt)
        if status == SQLITE_DONE { return nil }
        guard status == SQLITE_ROW, let text = sqlite3_column_text(stmt, 0) else { throw failure("Cannot read tasks") }
        return String(cString: text)
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
        try url.bookmarkData(options: options, includingResourceValuesForKeys: nil, relativeTo: nil).write(to: bookmarkURL, options: .atomic)
    }
    func folder() throws -> URL? {
        guard FileManager.default.fileExists(atPath: bookmarkURL.path) else { return nil }
        var stale = false
        #if os(macOS)
        let options: URL.BookmarkResolutionOptions = [.withSecurityScope, .withoutUI]
        #else
        let options: URL.BookmarkResolutionOptions = [.withoutUI]
        #endif
        let url = try URL(resolvingBookmarkData: Data(contentsOf: bookmarkURL), options: options, relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale { try select(url) }
        return url
    }
    func request(_ command: String, data: String?) throws -> [String: Any] {
        switch command {
        case "load":
            var result: [String: Any] = [:]
            if let data = try database() { result["data"] = data }
            // A broken bookmark must not prevent loading local tasks.
            if FileManager.default.fileExists(atPath: bookmarkURL.path) { result["folder"] = (try? folder()?.lastPathComponent) ?? "Reselect sync folder" }
            return result
        case "save":
            guard let data = data, let parsed = try JSONSerialization.jsonObject(with: Data(data.utf8)) as? [String: Any], parsed["version"] as? Int == 1 else { throw failure("Invalid save request") }
            _ = try database(data); return [:]
        case "disconnect":
            if FileManager.default.fileExists(atPath: bookmarkURL.path) { try FileManager.default.removeItem(at: bookmarkURL) }; return [:]
        case "exchange":
            guard let url = try folder() else { throw failure("Choose your iCloud Drive/Sunto folder") }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let dir = url.appendingPathComponent("sunto-changes-v1", isDirectory: true)
            guard let data = data, let changes = try JSONSerialization.jsonObject(with: Data(data.utf8)) as? [[String: Any]] else { throw failure("Invalid sync request") }
            var coordinationError: NSError?
            var workError: Error?
            var files: [String] = []
            NSFileCoordinator().coordinate(writingItemAt: dir, options: .forMerging, error: &coordinationError) { target in
                do {
                    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
                    for change in changes {
                        guard let id = change["id"] as? String, UUID(uuidString: id) != nil else { throw self.failure("Invalid change ID") }
                        let file = target.appendingPathComponent(id + ".json")
                        let bytes = try JSONSerialization.data(withJSONObject: change, options: [.sortedKeys])
                        if FileManager.default.fileExists(atPath: file.path) {
                            let existing = try Data(contentsOf: file)
                            guard let old = try JSONSerialization.jsonObject(with: existing) as? NSDictionary, old.isEqual(to: change) else { throw self.failure("Conflicting sync file: \(id)") }
                        } else {
                            let placeholder = target.appendingPathComponent("." + id + ".json.icloud")
                            if FileManager.default.fileExists(atPath: placeholder.path) {
                                try? FileManager.default.startDownloadingUbiquitousItem(at: file)
                                throw self.failure("Waiting for iCloud to download a change. Retry shortly.")
                            }
                            try bytes.write(to: file, options: .atomic)
                        }
                    }
                    for file in try FileManager.default.contentsOfDirectory(at: target, includingPropertiesForKeys: [.isUbiquitousItemKey], options: [.skipsHiddenFiles]) {
                        if file.pathExtension == "icloud" { try? FileManager.default.startDownloadingUbiquitousItem(at: file); continue }
                        guard file.pathExtension == "json" else { continue }
                        let values = try file.resourceValues(forKeys: [.isUbiquitousItemKey])
                        if values.isUbiquitousItem == true { try? FileManager.default.startDownloadingUbiquitousItem(at: file) }
                        files.append(try String(contentsOf: file, encoding: .utf8))
                    }
                } catch { workError = error }
            }
            if let error = coordinationError { throw error }
            if let error = workError { throw error }
            return ["files": files]
        default: throw failure("Unknown storage command")
        }
    }
}
