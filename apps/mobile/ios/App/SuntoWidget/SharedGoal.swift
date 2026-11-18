import Foundation

// Today's Goal as the app last saved it, for the widget to show, and the to-dos
// ticked in the widget since, which the app applies when it next opens. Both
// live in the container the app shares with its widget.
struct GoalItem: Codable {
  let id: String
  let title: String
  let list: String
  let planned: String
  var completed: Bool
  var completedAt: Double
}
// `due` holds the day each open to-do is due, to count those due on a day.
struct Goal: Codable {
  var goal: [GoalItem]
  var due: [String]
}
// A to-do completed or opened again in the widget, and when (ms).
struct Tick: Codable {
  let id: String
  let completed: Bool
  let at: Double
}
enum SharedGoal {
  static func failure(_ message: String) -> NSError {
    NSError(domain: "SuntoWidget", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  static func file(_ name: String) throws -> URL {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "SuntoAppGroup") as? String,
      let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { throw failure("The widget's shared container is unavailable") }
    return url.appendingPathComponent(name)
  }
  // Runs `work` on the file `name` while neither the app nor the widget
  // changes it.
  static func coordinate<T>(_ name: String, writing: Bool, _ work: (URL) throws -> T) throws -> T {
    let url = try file(name)
    var coordinationError: NSError?
    var result: Result<T, Error> = .failure(failure("Cannot open \(name)"))
    let coordinator = NSFileCoordinator()
    if writing {
      coordinator.coordinate(writingItemAt: url, options: [], error: &coordinationError) {
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
  static func decode<T: Decodable>(_ type: T.Type, at url: URL) throws -> T? {
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return try JSONDecoder().decode(type, from: Data(contentsOf: url))
  }
  // The goal the app saved, with the widget's ticks since. Nil until the app
  // first saves it.
  static func load() throws -> Goal? {
    guard var goal = try coordinate("goal.json", writing: false, { try decode(Goal.self, at: $0) })
    else { return nil }
    for tick in try ticks() {
      for k in goal.goal.indices where goal.goal[k].id == tick.id {
        goal.goal[k].completed = tick.completed
        goal.goal[k].completedAt = tick.completed ? tick.at : 0
      }
    }
    return goal
  }
  static func save(_ json: String) throws {
    _ = try JSONDecoder().decode(Goal.self, from: Data(json.utf8))
    try coordinate("goal.json", writing: true) {
      try Data(json.utf8).write(to: $0, options: .atomic)
    }
  }
  static func ticks() throws -> [Tick] {
    try coordinate("ticks.json", writing: false) { try decode([Tick].self, at: $0) } ?? []
  }
  static func tick(_ id: String, completed: Bool) throws {
    try coordinate("ticks.json", writing: true) { url in
      let ticks =
        (try decode([Tick].self, at: url) ?? [])
        + [Tick(id: id, completed: completed, at: (Date().timeIntervalSince1970 * 1000).rounded())]
      try JSONEncoder().encode(ticks).write(to: url, options: .atomic)
    }
  }
  // Forgets the first `count` ticks, which the app has applied. Later ones
  // stay for it to apply next time.
  static func clear(_ count: Int) throws {
    try coordinate("ticks.json", writing: true) { url in
      let ticks = try decode([Tick].self, at: url) ?? []
      try JSONEncoder().encode(Array(ticks.dropFirst(count))).write(to: url, options: .atomic)
    }
  }
}
