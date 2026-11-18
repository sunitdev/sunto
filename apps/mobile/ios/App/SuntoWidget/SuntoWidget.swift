import AppIntents
import SwiftUI
import WidgetKit

// The large Home Screen widget: Today's Goal, whose to-dos are ticked off in
// place. Tapping anywhere else opens the goal in the app.

// A day as the app keys it, 'YYYY-MM-DD' in local time.
func dayKey(_ date: Date) -> String {
  let day = Calendar.current.dateComponents([.year, .month, .day], from: date)
  return String(format: "%04d-%02d-%02d", day.year ?? 0, day.month ?? 0, day.day ?? 0)
}
let accent = Color(
  UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(red: 0x4b / 255, green: 0xa1 / 255, blue: 1, alpha: 1)
      : UIColor(red: 0x0a / 255, green: 0x6c / 255, blue: 0xf0 / 255, alpha: 1)
  })
let good = Color(
  UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(red: 0x32 / 255, green: 0xd7 / 255, blue: 0x4b / 255, alpha: 1)
      : UIColor(red: 0x24 / 255, green: 0x8a / 255, blue: 0x3d / 255, alpha: 1)
  })

struct ToggleGoalTodo: AppIntent {
  static var title: LocalizedStringResource = "Complete To-Do"
  static var isDiscoverable = false
  @Parameter(title: "To-Do") var id: String
  @Parameter(title: "Completed") var completed: Bool
  init() {}
  init(id: String, completed: Bool) {
    self.id = id
    self.completed = completed
  }
  func perform() async throws -> some IntentResult {
    try SharedGoal.tick(id, completed: completed)
    return .result()
  }
}

struct GoalEntry: TimelineEntry {
  let date: Date
  let goal: Goal?
}
extension Goal {
  // What the widget gallery shows before a day is planned.
  static var sample: Goal {
    let today = dayKey(Date())
    let todos = [
      ("Review the design draft", "Work", true),
      ("Book the dentist", "Inbox", true),
      ("Write the weekly update", "Work", false),
      ("Plan the weekend trip", "Home", false),
      ("Water the plants", "Home", false),
    ]
    return Goal(
      goal: todos.enumerated().map { k, todo in
        GoalItem(
          id: String(k), title: todo.0, list: todo.1, planned: today, completed: todo.2,
          completedAt: Double(k))
      }, due: [])
  }
}
struct GoalProvider: TimelineProvider {
  func placeholder(in context: Context) -> GoalEntry { GoalEntry(date: Date(), goal: .sample) }
  func getSnapshot(in context: Context, completion: @escaping (GoalEntry) -> Void) {
    let goal = try? SharedGoal.load()
    let planned = goal?.goal.contains { $0.planned == dayKey(Date()) } ?? false
    completion(GoalEntry(date: Date(), goal: context.isPreview && !planned ? .sample : goal))
  }
  // Today's goal now, and the next day's from midnight. The app reloads the
  // widget whenever the goal changes.
  func getTimeline(in context: Context, completion: @escaping (Timeline<GoalEntry>) -> Void) {
    let goal = try? SharedGoal.load()
    let now = Date()
    let calendar = Calendar.current
    let midnight =
      calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
      ?? now.addingTimeInterval(86400)
    completion(
      Timeline(
        entries: [GoalEntry(date: now, goal: goal), GoalEntry(date: midnight, goal: goal)],
        policy: .atEnd))
  }
}

struct Check: View {
  let on: Bool
  var body: some View {
    ZStack {
      if on {
        Circle().fill(accent).widgetAccentable()
        Image(systemName: "checkmark")
          .font(.system(size: 10, weight: .heavy))
          .foregroundStyle(.white)
      } else {
        Circle().strokeBorder(.secondary, lineWidth: 1.5)
      }
    }
    .frame(width: 20, height: 20)
    .frame(width: 28, height: 27)
    .contentShape(Rectangle())
  }
}
struct Row: View {
  let item: GoalItem
  var body: some View {
    HStack(spacing: 8) {
      Button(intent: ToggleGoalTodo(id: item.id, completed: !item.completed)) {
        Check(on: item.completed)
      }
      .buttonStyle(.plain)
      Text(item.title.isEmpty ? "New To-Do" : item.title)
        .font(.subheadline)
        .strikethrough(item.completed)
        .foregroundStyle(item.completed ? .secondary : .primary)
        .lineLimit(1)
        .layoutPriority(1)
      Spacer(minLength: 4)
      // A long title leaves the list's name a little room.
      Text(item.list)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .frame(minWidth: min(CGFloat(item.list.count) * 7, 72), alignment: .trailing)
    }
  }
}
struct Header: View {
  let progress: String
  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "target")
        .font(.headline)
        .foregroundStyle(accent)
        .widgetAccentable()
      Text("Today’s Goal").font(.headline)
      Spacer()
      Text(progress)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
  }
}
// The goal's progress as one slot per to-do, filled as they are completed.
struct Slots: View {
  let done: Int
  let count: Int
  var body: some View {
    HStack(spacing: 4) {
      ForEach(0..<count, id: \.self) { k in
        Capsule()
          .fill(k < done ? accent : Color.secondary.opacity(0.25))
          .frame(height: 5)
      }
    }
    .widgetAccentable()
  }
}
struct GoalView: View {
  let entry: GoalEntry
  // Rows that fit a large widget; when there are more, the last says so.
  let rows = 9
  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .containerBackground(.background, for: .widget)
      .widgetURL(URL(string: "sunto://goal"))
  }
  @ViewBuilder var content: some View {
    let today = dayKey(entry.date)
    if let goal = entry.goal {
      let picked = goal.goal.filter { $0.planned == today }
      // Open to-dos in the goal's order, then the completed ones as they
      // were completed, as in the app.
      let todos =
        picked.filter { !$0.completed }
        + picked.filter { $0.completed }.sorted { $0.completedAt < $1.completedAt }
      let done = picked.count - picked.filter { !$0.completed }.count
      if todos.isEmpty {
        plan(due: goal.due.filter { $0 <= today }.count)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          Header(
            progress: done == todos.count ? "All \(done) done" : "\(done) of \(todos.count) done")
          Slots(done: done, count: todos.count)
          if done == todos.count {
            Text("Goal complete. Anything else today is a bonus.")
              .font(.caption)
              .foregroundStyle(good)
          }
          VStack(alignment: .leading, spacing: 2) {
            let shown = todos.count > rows ? rows - 1 : rows
            ForEach(todos.prefix(shown), id: \.id) { Row(item: $0) }
            if todos.count > shown {
              Text("\(todos.count - shown) more")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.leading, 36)
                .padding(.top, 4)
            }
          }
        }
      }
    } else {
      message("Open Sunto", "Open the app once to show your goal here.")
    }
  }
  func plan(due: Int) -> some View {
    message(
      "Plan your day",
      due == 0
        ? "Nothing is due today or overdue. Tap to open Sunto."
        : "\(due == 1 ? "1 to-do is" : "\(due) to-dos are") due today or overdue. Tap to pick the ones you’ll finish."
    )
  }
  func message(_ title: String, _ text: String) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Header(progress: "")
      Spacer()
      VStack(spacing: 6) {
        Image(systemName: "target")
          .font(.system(size: 34))
          .foregroundStyle(accent)
          .widgetAccentable()
        Text(title).font(.headline)
        Text(text)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      Spacer()
    }
  }
}

@main
struct SuntoWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "goal", provider: GoalProvider()) { GoalView(entry: $0) }
      .configurationDisplayName("Today’s Goal")
      .description("The to-dos you picked to finish today. Tick them off right here.")
      .supportedFamilies([.systemLarge])
  }
}
