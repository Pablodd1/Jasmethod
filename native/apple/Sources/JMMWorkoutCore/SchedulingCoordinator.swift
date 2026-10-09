import Foundation

public struct ScheduleIntent: Codable, Equatable, Sendable {
    public let workout: WorkoutEnvelope
    public let location: WorkoutLocation
    public init(workout: WorkoutEnvelope, location: WorkoutLocation) {
        self.workout = workout; self.location = location
    }
    public var planId: UUID { workout.planId }
    public func digest() throws -> String { try workout.contentDigest(location: location) }
}
public struct SchedulerReadback: Sendable {
    public let totalCount: Int
    public let matchingIdentityCount: Int
    public let exactContentAndDateCount: Int
    public let anyMatchingCompleted: Bool
    public init(totalCount: Int, matchingIdentityCount: Int, exactContentAndDateCount: Int, anyMatchingCompleted: Bool) {
        self.totalCount = totalCount; self.matchingIdentityCount = matchingIdentityCount
        self.exactContentAndDateCount = exactContentAndDateCount; self.anyMatchingCompleted = anyMatchingCompleted
    }
}
public protocol SchedulerPort: Sendable {
    func isAuthorized() async -> Bool
    func capacity() async -> Int
    func validate(_ intent: ScheduleIntent) async throws
    func readback(_ intent: ScheduleIntent) async throws -> SchedulerReadback
    func schedule(_ intent: ScheduleIntent) async throws
    func removeAllInstances(of intent: ScheduleIntent) async throws
}
public struct ScheduleLedgerEntry: Codable, Sendable {
    public enum State: String, Codable, Sendable { case pendingSchedule, scheduledLocally, pendingRemoval, removedLocally }
    public let intent: ScheduleIntent
    public var state: State
    public var updatedAt: Date
}
public protocol ScheduleLedger: AnyObject {
    func entry(for id: UUID) throws -> ScheduleLedgerEntry?
    func save(_ entry: ScheduleLedgerEntry) throws
}

/// An actor plus a busy guard: actor reentrancy across SDK awaits must not duplicate operations.
public actor SchedulingCoordinator {
    private let port: any SchedulerPort
    private let ledger: any ScheduleLedger
    private var busy = false
    public init(port: any SchedulerPort, ledger: any ScheduleLedger) { self.port = port; self.ledger = ledger }

    /// Call only from an explicit Schedule/Replace button after displaying all steps and revision.
    @discardableResult public func schedule(_ intent: ScheduleIntent, confirmReplacement: Bool = false, confirmReschedule: Bool = false) async throws -> ScheduleLedgerEntry {
        guard !busy else { throw CompanionError.operationInProgress }
        busy = true; defer { busy = false }
        try intent.workout.validate()
        try await port.validate(intent) // Capability checks happen before any removal.
        guard await port.isAuthorized() else { throw CompanionError.authorizationRequired }
        let old = try ledger.entry(for: intent.planId)
        if let old, old.intent.workout.sessionId != intent.workout.sessionId { throw CompanionError.invalid("Plan identity belongs to a different locally recorded session.") }
        let digest = try intent.digest()
        if let old, (old.state == .pendingRemoval || old.state == .removedLocally), !confirmReschedule { throw CompanionError.cancelledRevision }
        if let old, try old.intent.digest() != digest, !confirmReplacement { throw CompanionError.replacementRequired }
        let snapshot = try await port.readback(intent)
        if snapshot.anyMatchingCompleted { throw CompanionError.completedPlan }
        if snapshot.matchingIdentityCount > 0 && old == nil { throw CompanionError.invalid("Existing scheduler identity has no local ownership record; replacement is refused.") }
        if snapshot.matchingIdentityCount == 1 && snapshot.exactContentAndDateCount == 1, let old, try old.intent.digest() == digest {
            return try record(intent, state: .scheduledLocally) // Local readback, NOT watch delivery.
        }
        if snapshot.matchingIdentityCount > 0 && !confirmReplacement { throw CompanionError.replacementRequired }
        if let old, old.state == .pendingSchedule, try old.intent.digest() == digest, snapshot.matchingIdentityCount == 0, !confirmReplacement { throw CompanionError.readbackPending }
        let capacity = await port.capacity()
        guard snapshot.totalCount - snapshot.matchingIdentityCount < capacity else { throw CompanionError.capacityReached }
        // Crash recovery: write intention before touching Apple's scheduler. Do not infer success from this record.
        _ = try record(intent, state: .pendingSchedule)
        if snapshot.matchingIdentityCount > 0 {
            try await port.removeAllInstances(of: intent)
            let removed = try await port.readback(intent)
            guard removed.matchingIdentityCount == 0 else { throw CompanionError.readbackPending }
        }
        try await port.schedule(intent)
        let after = try await port.readback(intent)
        guard after.matchingIdentityCount == 1, after.exactContentAndDateCount == 1 else { throw CompanionError.readbackPending }
        return try record(intent, state: .scheduledLocally)
    }

    /// Only removes this stable plan identity, never all of the user's workouts.
    @discardableResult public func cancel(_ intent: ScheduleIntent) async throws -> ScheduleLedgerEntry {
        guard !busy else { throw CompanionError.operationInProgress }
        busy = true; defer { busy = false }
        guard await port.isAuthorized() else { throw CompanionError.authorizationRequired }
        guard let owned = try ledger.entry(for: intent.planId), owned.intent.workout.sessionId == intent.workout.sessionId else { throw CompanionError.invalid("Removal requires a matching locally recorded plan and session.") }
        let snapshot = try await port.readback(intent)
        guard !snapshot.anyMatchingCompleted else { throw CompanionError.completedPlan }
        _ = try record(intent, state: .pendingRemoval)
        if snapshot.matchingIdentityCount > 0 { try await port.removeAllInstances(of: intent) }
        let after = try await port.readback(intent)
        guard after.matchingIdentityCount == 0 else { throw CompanionError.readbackPending }
        return try record(intent, state: .removedLocally)
    }

    /// Foreground/manual refresh is read-only. It never retries a mutation or requests permission.
    public func refresh(_ intent: ScheduleIntent) async throws -> SchedulerReadback {
        guard await port.isAuthorized() else { throw CompanionError.authorizationRequired }
        return try await port.readback(intent)
    }
    private func record(_ intent: ScheduleIntent, state: ScheduleLedgerEntry.State) throws -> ScheduleLedgerEntry {
        let entry = ScheduleLedgerEntry(intent: intent, state: state, updatedAt: Date())
        try ledger.save(entry)
        return entry
    }
}

/// Store in the app's Application Support directory. Never put these files in shared/iCloud containers.
public final class FileScheduleLedger: ScheduleLedger {
    private let directory: URL
    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var resource = URLResourceValues(); resource.isExcludedFromBackup = true
        var local = directory; try local.setResourceValues(resource)
    }
    public func entry(for id: UUID) throws -> ScheduleLedgerEntry? {
        let url = path(id)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        guard data.count <= WorkoutEnvelope.maxBytes * 2 else { throw CompanionError.invalid("Oversized local schedule record.") }
        return try JSONDecoder().decode(ScheduleLedgerEntry.self, from: data)
    }
    public func save(_ entry: ScheduleLedgerEntry) throws {
        let data = try JSONEncoder().encode(entry)
        #if os(iOS) || os(watchOS)
        try data.write(to: path(entry.intent.planId), options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: path(entry.intent.planId), options: [.atomic])
        #endif
    }
    private func path(_ id: UUID) -> URL { directory.appendingPathComponent(id.uuidString + ".json") }
}
