import Foundation
import CryptoKit

public enum CompanionError: Error, LocalizedError, Equatable {
    case invalid(String), unsupported(String), authorizationRequired, healthAuthorizationRequired, operationInProgress
    case replacementRequired, capacityReached, readbackPending, completedPlan, cancelledRevision
    public var errorDescription: String? {
        switch self {
        case .invalid(let reason), .unsupported(let reason): return reason
        case .authorizationRequired: return "Allow Workout scheduling using the separate authorization button."
        case .healthAuthorizationRequired: return "Allow reading completed workouts using the separate HealthKit authorization button."
        case .operationInProgress: return "Another scheduling operation is still in progress."
        case .replacementRequired: return "Review and explicitly replace the existing plan or revision. Offline files cannot establish which revision is newest."
        case .capacityReached: return "Apple's scheduled workout limit has been reached. Remove a plan before adding another."
        case .readbackPending: return "The requested local scheduler state has not been confirmed. Refresh before retrying."
        case .completedPlan: return "This plan is marked complete in Apple's scheduler. It will not be overwritten."
        case .cancelledRevision: return "Removal was requested for this plan. Explicitly confirm rescheduling before using it again."
        }
    }
}

public struct WorkoutEnvelope: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let kind: String
    public let planId: UUID
    public let sessionId: String
    public let revision: String
    public let revisionNumber: Int64 // Hash-derived opaque identifier, not ordered.
    public let exportedAt: String
    public let dateLocal: String
    public let timezone: String
    public let title: String
    public let sport: Sport
    public let steps: [Step]
    public let hardwareVerified: Bool
    public let localSchedulerOnly: Bool
    public enum Sport: String, Codable, Sendable { case run, bike }
    public enum Phase: String, Codable, Sendable { case warmup, active, recovery, cooldown }
    public struct Step: Codable, Equatable, Sendable {
        public let name: String
        public let phase: Phase
        public let endpoint: Endpoint
        public let target: Target
        public let note: String?
        public let group: String?
    }
    public struct Endpoint: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable { case time, distance, lap }
        public let type: Kind
        public let seconds: Double?
        public let meters: Double?
    }
    public struct Target: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable { case open, power, heartRate, pace, speed }
        public enum Source: String, Codable, Sendable { case explicit, profile_reference, effort }
        public let type: Kind
        public let low: Double?
        public let high: Double?
        public let label: String
        public let source: Source
        public let missingReason: String?
        /// Canonical pace bounds are seconds/km. Conversion reverses the endpoints.
        public var speedMetersPerSecond: ClosedRange<Double>? {
            guard let low, let high, low > 0, high >= low else { return nil }
            if type == .pace { return (1000 / high)...(1000 / low) }
            if type == .speed { return low...high }
            return nil
        }
    }

    public static let maxBytes = 256 * 1024
    public static func decode(_ data: Data) throws -> Self {
        guard data.count <= maxBytes else { throw CompanionError.invalid("File exceeds 256 KiB.") }
        // Reject extra fields instead of letting Codable silently discard a future endpoint/target.
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw CompanionError.invalid("Expected a workout JSON object.")
        }
        try keys(object, allowed: ["schemaVersion", "kind", "planId", "sessionId", "revision", "revisionNumber", "exportedAt", "dateLocal", "timezone", "title", "sport", "steps", "hardwareVerified", "localSchedulerOnly"])
        guard let steps = object["steps"] as? [[String: Any]], (1...50).contains(steps.count) else { throw CompanionError.invalid("Expected 1–50 steps.") }
        for step in steps {
            try keys(step, allowed: ["name", "phase", "endpoint", "target", "note", "group"])
            guard let endpoint = step["endpoint"] as? [String: Any], let target = step["target"] as? [String: Any] else { throw CompanionError.invalid("Missing endpoint or target.") }
            try keys(endpoint, allowed: ["type", "seconds", "meters"])
            try keys(target, allowed: ["type", "low", "high", "label", "source", "missingReason"])
        }
        let result = try JSONDecoder().decode(Self.self, from: data)
        try result.validate()
        return result
    }
    private static func keys(_ object: [String: Any], allowed: Set<String>) throws {
        guard Set(object.keys).isSubset(of: allowed) else { throw CompanionError.unsupported("File contains unsupported fields. Export a supported run/bike session.") }
    }
    public func validate() throws {
        guard schemaVersion == 1, kind == "jmm.apple.workout", !hardwareVerified, localSchedulerOnly else { throw CompanionError.unsupported("Unsupported or mislabelled companion contract.") }
        try bounded(sessionId, max: 500); try bounded(title, max: 300)
        guard revision.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, revisionNumber >= 0, revisionNumber <= 9007199254740991 else { throw CompanionError.invalid("Invalid revision.") }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard formatter.date(from: exportedAt) != nil else { throw CompanionError.invalid("Invalid export timestamp.") }
        _ = try scheduleDate()
        guard (1...50).contains(steps.count) else { throw CompanionError.invalid("Expected 1–50 steps; none were truncated.") }
        for (index, step) in steps.enumerated() {
            try bounded(step.name, max: 1000)
            if let note = step.note { try bounded(note, max: 20000) }
            if let group = step.group { try bounded(group, max: 20000) }
            guard !(step.phase == .warmup && index != 0), !(step.phase == .cooldown && index != steps.count - 1) else { throw CompanionError.unsupported("Warmup must be first and cooldown last; steps cannot be rearranged.") }
            switch step.endpoint.type {
            case .time:
                try finite(step.endpoint.seconds, min: 0.001, max: 86400)
                guard step.endpoint.meters == nil else { throw CompanionError.invalid("Conflicting endpoint values.") }
            case .distance:
                try finite(step.endpoint.meters, min: 0.01, max: 1000000)
                guard step.endpoint.seconds == nil else { throw CompanionError.invalid("Distance estimates cannot be encoded as time goals.") }
            case .lap:
                guard step.endpoint.seconds == nil, step.endpoint.meters == nil else { throw CompanionError.invalid("Manual endpoints cannot have a duration or distance.") }
            }
            let t = step.target
            try bounded(t.label, max: 1000)
            if let reason = t.missingReason { try bounded(reason, max: 2000) }
            if t.type == .open {
                guard t.low == nil, t.high == nil else { throw CompanionError.invalid("Open effort cannot contain bounds.") }
                continue
            }
            let limits: (Double, Double)
            switch t.type {
            case .power: limits = (0, 3000)
            case .heartRate: limits = (1, 250)
            case .pace: limits = (20, 3600)
            case .speed: limits = (0.001, 50)
            case .open: continue
            }
            try finite(t.low, min: limits.0, max: limits.1)
            try finite(t.high, min: max(limits.0, Double.leastNonzeroMagnitude), max: limits.1)
            guard let low = t.low, let high = t.high, low <= high else { throw CompanionError.invalid("Invalid target range.") }
            if t.type == .power || t.type == .heartRate {
                guard low.rounded() == low, high.rounded() == high else { throw CompanionError.invalid("Power and heart rate require whole units.") }
            }
        }
    }
    public func scheduleDate() throws -> DateComponents {
        guard dateLocal.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil,
              let zone = TimeZone(identifier: timezone) else { throw CompanionError.invalid("Invalid date or timezone.") }
        let parts = dateLocal.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { throw CompanionError.invalid("Invalid date.") }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        let result = DateComponents(calendar: calendar, timeZone: zone, year: parts[0], month: parts[1], day: parts[2])
        guard let date = calendar.date(from: result), calendar.component(.year, from: date) == parts[0], calendar.component(.month, from: date) == parts[1], calendar.component(.day, from: date) == parts[2] else { throw CompanionError.invalid("Date does not exist in this timezone.") }
        return result
    }
    /// Excludes export time: downloading unchanged content again is idempotent.
    public func contentDigest(location: WorkoutLocation) throws -> String {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        guard var object = try JSONSerialization.jsonObject(with: encoder.encode(self)) as? [String: Any] else { throw CompanionError.invalid("Unable to encode workout identity.") }
        object.removeValue(forKey: "exportedAt")
        object["location"] = location.rawValue
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
public enum WorkoutLocation: String, Codable, Sendable, CaseIterable, Hashable { case indoor, outdoor }
private func bounded(_ value: String, max: Int) throws {
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, value.utf16.count <= max else { throw CompanionError.invalid("Invalid or oversized text field.") }
}
private func finite(_ value: Double?, min: Double, max: Double) throws {
    guard let value, value.isFinite, value >= min, value <= max else { throw CompanionError.invalid("Invalid endpoint or target number.") }
}
