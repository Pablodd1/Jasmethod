import Foundation
import JMMWorkoutCore
#if canImport(WorkoutKit) && canImport(HealthKit)
import WorkoutKit
import HealthKit

@available(iOS 17.0, watchOS 10.0, macOS 15.0, *)
public enum WorkoutKitMapper {
    public static func makePlan(_ intent: ScheduleIntent) throws -> WorkoutPlan {
        let envelope = intent.workout
        try envelope.validate()
        let activity: HKWorkoutActivityType = envelope.sport == .run ? .running : .cycling
        let location: HKWorkoutSessionLocationType = intent.location == .indoor ? .indoor : .outdoor
        guard CustomWorkout.supportsActivity(activity) else { throw CompanionError.unsupported("This device cannot represent the workout activity.") }
        func nativeStep(_ source: WorkoutEnvelope.Step) throws -> WorkoutStep {
            let goal: WorkoutGoal
            switch source.endpoint.type {
            case .time:
                guard let seconds = source.endpoint.seconds else { throw CompanionError.invalid("Missing seconds.") }
                goal = .time(seconds, .seconds)
            case .distance:
                guard let meters = source.endpoint.meters else { throw CompanionError.invalid("Missing meters.") }
                goal = .distance(meters, .meters)
            case .lap: goal = .open // User manually advances. Never substitute estimated seconds.
            }
            guard CustomWorkout.supportsGoal(goal, activity: activity, location: location) else { throw CompanionError.unsupported("Goal for \(source.name) is unsupported at this location; no goal was substituted.") }
            let alert = try makeAlert(source.target)
            if let alert, !CustomWorkout.supportsAlert(alert, activity: activity, location: location) {
                throw CompanionError.unsupported("Target for \(source.name) is unsupported at this location; no target was discarded.")
            }
            // Step names were added in iOS 18/watchOS 11. Full labels/notes remain in our preview on 17/10.
            if #available(iOS 18.0, watchOS 11.0, macOS 15.0, *) {
                return WorkoutStep(goal: goal, alert: alert, displayName: source.name)
            }
            return WorkoutStep(goal: goal, alert: alert)
        }
        var warmup: WorkoutStep?
        var cooldown: WorkoutStep?
        var intervals: [IntervalStep] = []
        for source in envelope.steps {
            let step = try nativeStep(source)
            switch source.phase {
            case .warmup: warmup = step
            case .cooldown: cooldown = step
            case .active: intervals.append(IntervalStep(.work, step: step))
            case .recovery: intervals.append(IntervalStep(.recovery, step: step))
            }
        }
        let blocks = intervals.isEmpty ? [] : [IntervalBlock(steps: intervals, iterations: 1)]
        let workout = CustomWorkout(activity: activity, location: location, displayName: envelope.title,
                                    warmup: warmup, blocks: blocks, cooldown: cooldown)
        return WorkoutPlan(.custom(workout), id: envelope.planId)
    }
    public static func makeAlert(_ target: WorkoutEnvelope.Target) throws -> (any WorkoutAlert)? {
        if target.type == .open { return nil }
        guard let low = target.low, let high = target.high, low.isFinite, high.isFinite, low <= high else { throw CompanionError.invalid("Invalid target bounds.") }
        switch target.type {
        case .open: return nil
        case .power:
            // The iOS 17 initializer uses current power; do not use the newer metric initializer.
            return PowerRangeAlert(target: Measurement(value: low, unit: UnitPower.watts)...Measurement(value: high, unit: UnitPower.watts))
        case .heartRate:
            return HeartRateRangeAlert(target: Measurement(value: low, unit: WorkoutAlertMetric.countPerMinute)...Measurement(value: high, unit: WorkoutAlertMetric.countPerMinute))
        case .pace, .speed:
            guard let range = target.speedMetersPerSecond else { throw CompanionError.invalid("Invalid pace/speed bounds.") }
            return SpeedRangeAlert(target: Measurement(value: range.lowerBound, unit: UnitSpeed.metersPerSecond)...Measurement(value: range.upperBound, unit: UnitSpeed.metersPerSecond), metric: .current)
        }
    }
}

@available(iOS 17.0, watchOS 10.0, macOS 15.0, *)
public struct AppleSchedulerPort: SchedulerPort {
    public init() {}
    /// Invoke only from an explicit authorization button, never file import or launch.
    public func requestAuthorization() async -> WorkoutScheduler.AuthorizationState {
        await WorkoutScheduler.shared.requestAuthorization()
    }
    public func isAuthorized() async -> Bool {
        guard WorkoutScheduler.isSupported else { return false }
        return await WorkoutScheduler.shared.authorizationState == .authorized
    }
    public func capacity() async -> Int { WorkoutScheduler.maxAllowedScheduledWorkoutCount }
    public func validate(_ intent: ScheduleIntent) async throws { _ = try WorkoutKitMapper.makePlan(intent) }
    public func readback(_ intent: ScheduleIntent) async throws -> SchedulerReadback {
        guard await isAuthorized() else { throw CompanionError.authorizationRequired }
        let expected = try WorkoutKitMapper.makePlan(intent)
        let expectedDate = try intent.workout.scheduleDate()
        let all = await WorkoutScheduler.shared.scheduledWorkouts
        let same = all.filter { $0.plan.id == expected.id }
        let exact = same.filter { $0.plan == expected && sameDay($0.date, expectedDate) }
        return SchedulerReadback(totalCount: all.count, matchingIdentityCount: same.count,
                                 exactContentAndDateCount: exact.count, anyMatchingCompleted: same.contains { $0.complete })
    }
    public func schedule(_ intent: ScheduleIntent) async throws {
        guard await isAuthorized() else { throw CompanionError.authorizationRequired }
        let plan = try WorkoutKitMapper.makePlan(intent)
        let date = try intent.workout.scheduleDate()
        await WorkoutScheduler.shared.schedule(plan, at: date)
        // The SDK returns Void. Only separate readback may establish local scheduling.
    }
    public func removeAllInstances(of intent: ScheduleIntent) async throws {
        guard await isAuthorized() else { throw CompanionError.authorizationRequired }
        let all = await WorkoutScheduler.shared.scheduledWorkouts
        let matching = all.filter { $0.plan.id == intent.planId }
        guard !matching.contains(where: { $0.complete }) else { throw CompanionError.completedPlan }
        for entry in matching {
            await WorkoutScheduler.shared.remove(entry.plan, at: entry.date)
        }
    }
    private func sameDay(_ a: DateComponents, _ b: DateComponents) -> Bool {
        // Missing normalized metadata is inconclusive, not evidence that a timezone edit applied.
        a.year == b.year && a.month == b.month && a.day == b.day
            && a.timeZone?.identifier == b.timeZone?.identifier
            && a.timeZone != nil && a.calendar?.identifier == b.calendar?.identifier
            && a.calendar != nil
    }
}
#endif
