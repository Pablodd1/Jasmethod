import Foundation
import JMMWorkoutCore
#if canImport(HealthKit) && canImport(WorkoutKit)
import HealthKit
import WorkoutKit

/// Deliberately separate from scheduling. No network, background delivery, writes, or auto-upload.
@available(iOS 17.0, watchOS 10.0, macOS 15.0, *)
public actor HealthKitReader {
    private let store = HKHealthStore()
    private var authorizationRequestedInThisSession = false
    public init() {}

    /// Invoke only after the user taps "Allow reading completed workouts".
    public func requestReadAccess() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw CompanionError.unsupported("Health data is unavailable on this device.") }
        try await store.requestAuthorization(toShare: [], read: [HKObjectType.workoutType()])
        // This indicates that the permission flow finished, NOT that read access was granted.
        // HealthKit intentionally does not disclose read denial; empty results are ambiguous.
        authorizationRequestedInThisSession = true
    }
    /// Explicit foreground read, at most 31 days and 100 workouts. An empty result is not proof of no activity.
    public func read(start: Date, end: Date) async throws -> CompletedWorkoutBatch {
        guard authorizationRequestedInThisSession else { throw CompanionError.healthAuthorizationRequired }
        guard end > start, end.timeIntervalSince(start) <= 31 * 86400 else { throw CompanionError.invalid("Choose a read window of at most 31 days.") }
        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: 100,
                                      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(query)
        }
        var results: [CompletedWorkoutSummary] = []
        for workout in workouts {
            // Association may not exist. Do not infer identity from date/title/sport or scheduling completion.
            let plan = try await workout.workoutPlan
            results.append(CompletedWorkoutSummary(
                sampleId: workout.uuid, planId: plan?.id, start: workout.startDate, end: workout.endDate,
                durationSeconds: workout.duration, distanceMeters: workout.totalDistance?.doubleValue(for: .meter()),
                sport: workout.workoutActivityType == .running ? "run" : workout.workoutActivityType == .cycling ? "bike" : "other",
                sourceBundleId: workout.sourceRevision.source.bundleIdentifier
            ))
        }
        return CompletedWorkoutBatch(schemaVersion: 1, kind: "jmm.apple.completed-workouts", observedAt: Date(),
                                     requestedStart: start, requestedEnd: end, possiblyTruncated: workouts.count == 100,
                                     readAccessCannotBeDetermined: true, workouts: results)
    }
}

public struct CompletedWorkoutSummary: Codable, Sendable {
    public let sampleId: UUID // Idempotency key within the authenticated importing athlete.
    public let planId: UUID? // Optional association only, never proof of prescription revision.
    public let start: Date
    public let end: Date
    public let durationSeconds: Double
    public let distanceMeters: Double?
    public let sport: String
    public let sourceBundleId: String
}
public struct CompletedWorkoutBatch: Codable, Sendable {
    public let schemaVersion: Int
    public let kind: String
    public let observedAt: Date
    public let requestedStart: Date
    public let requestedEnd: Date
    public let possiblyTruncated: Bool
    public let readAccessCannotBeDetermined: Bool
    public let workouts: [CompletedWorkoutSummary]
    /// Call after a separate review/export action. This returns local bytes, never sends health data.
    public func reviewedExportData() throws -> Data {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }
}
#endif
