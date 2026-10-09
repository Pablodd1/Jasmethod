import XCTest
import Foundation
import JMMWorkoutCore
@testable import JMMWorkoutKit
#if canImport(WorkoutKit) && canImport(HealthKit)
import WorkoutKit
import HealthKit

@available(iOS 17.0, watchOS 10.0, macOS 15.0, *)
final class WorkoutKitMapperTests: XCTestCase {
    func fixture(sport: String = "run", type: String = "pace", low: Double = 300, high: Double = 330) throws -> WorkoutEnvelope {
        let data = """
        {"schemaVersion":1,"kind":"jmm.apple.workout","planId":"f14fb63e-9ba8-8ccf-9e68-0f8b4d15df57","sessionId":"fixture",
        "revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","revisionNumber":1,
        "exportedAt":"2026-10-09T12:00:00.000Z","dateLocal":"2026-10-10","timezone":"America/New_York","title":"SDK fixture","sport":"\(sport)",
        "steps":[{"name":"First","phase":"active","endpoint":{"type":"distance","meters":1000},"target":{"type":"\(type)","low":\(low),"high":\(high),"label":"Fixture target","source":"explicit"}},
        {"name":"Second","phase":"recovery","endpoint":{"type":"lap"},"target":{"type":"open","label":"Open","source":"explicit"}}],
        "hardwareVerified":false,"localSchedulerOnly":true}
        """.data(using: .utf8)!
        return try WorkoutEnvelope.decode(data)
    }
    func testPaceInvertsSpeedBoundsWithoutRounding() throws {
        let f = try fixture()
        let alert = try XCTUnwrap(WorkoutKitMapper.makeAlert(f.steps[0].target) as? SpeedRangeAlert)
        XCTAssertEqual(alert.target.lowerBound.converted(to: .metersPerSecond).value, 1000 / 330.0, accuracy: 0.000001)
        XCTAssertEqual(alert.target.upperBound.converted(to: .metersPerSecond).value, 1000 / 300.0, accuracy: 0.000001)
    }
    func testHeartRateAndPowerRetainBoundsAndUnits() throws {
        let hr = try fixture(type: "heartRate", low: 110, high: 135)
        let alert = try XCTUnwrap(WorkoutKitMapper.makeAlert(hr.steps[0].target) as? HeartRateRangeAlert)
        XCTAssertEqual(alert.target.lowerBound.converted(to: WorkoutAlertMetric.countPerMinute).value, 110)
        XCTAssertEqual(alert.target.upperBound.converted(to: WorkoutAlertMetric.countPerMinute).value, 135)
        let power = try fixture(sport: "bike", type: "power", low: 0, high: 250)
        let watts = try XCTUnwrap(WorkoutKitMapper.makeAlert(power.steps[0].target) as? PowerRangeAlert)
        XCTAssertEqual(watts.target.lowerBound.converted(to: .watts).value, 0)
        XCTAssertEqual(watts.target.upperBound.converted(to: .watts).value, 250)
    }
    func testMappingRetainsExactOrderDistanceAndOpenGoal() throws {
        let f = try fixture()
        let plan = try WorkoutKitMapper.makePlan(ScheduleIntent(workout: f, location: .outdoor))
        XCTAssertEqual(plan.id, f.planId)
        guard case .custom(let workout) = plan.workout else { return XCTFail("Expected custom workout") }
        XCTAssertEqual(workout.blocks.count, 1)
        XCTAssertEqual(workout.blocks[0].iterations, 1)
        XCTAssertEqual(workout.blocks[0].steps.count, 2)
        XCTAssertEqual(workout.blocks[0].steps[0].purpose, .work)
        XCTAssertEqual(workout.blocks[0].steps[0].step.goal, .distance(1000, .meters))
        XCTAssertEqual(workout.blocks[0].steps[1].purpose, .recovery)
        XCTAssertEqual(workout.blocks[0].steps[1].step.goal, .open)
        XCTAssertNil(workout.blocks[0].steps[1].step.alert)
    }
}
#endif
