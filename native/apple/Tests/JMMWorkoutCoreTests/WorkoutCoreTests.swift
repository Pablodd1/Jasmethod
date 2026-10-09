import XCTest
@testable import JMMWorkoutCore

final class WorkoutCoreTests: XCTestCase {
    func fixture(_ mutate: ((inout [String: Any]) -> Void)? = nil) throws -> WorkoutEnvelope {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "run.jmmworkout", withExtension: "json", subdirectory: "Fixtures"))
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        mutate?(&object)
        return try WorkoutEnvelope.decode(JSONSerialization.data(withJSONObject: object))
    }
    func intent(_ revision: String? = nil) throws -> ScheduleIntent {
        ScheduleIntent(workout: try fixture { if let revision { $0["revision"] = String(repeating: revision, count: 64) } }, location: .outdoor)
    }
    func testSharedFixtureKeepsOrderPaceUnitsAndManualEndpoint() throws {
        let f = try fixture()
        XCTAssertEqual(f.steps.map(\.phase), [.warmup, .active, .recovery, .active, .cooldown])
        XCTAssertEqual(f.steps[1].target.speedMetersPerSecond!.lowerBound, 1000.0 / 330, accuracy: 0.000001)
        XCTAssertEqual(f.steps[1].target.speedMetersPerSecond!.upperBound, 1000.0 / 300, accuracy: 0.000001)
        XCTAssertEqual(f.steps[2].endpoint.type, .lap)
        XCTAssertNil(f.steps[2].endpoint.seconds)
        XCTAssertEqual(try f.scheduleDate().timeZone?.identifier, "America/New_York")
    }
    func testBadContractUnknownTargetAndConflictingEndpointAreRejected() throws {
        XCTAssertThrowsError(try fixture { $0["schemaVersion"] = 2 })
        XCTAssertThrowsError(try fixture { $0["hardwareVerified"] = true })
        XCTAssertThrowsError(try fixture { $0["dateLocal"] = "2026-02-30" })
        XCTAssertThrowsError(try fixture { $0["timezone"] = "Not/AZone" })
        XCTAssertThrowsError(try fixture { $0["credential"] = "unsupported field" })
        XCTAssertThrowsError(try fixture { object in
            var steps = object["steps"] as! [[String: Any]]
            steps[1]["target"] = ["type": "cadence", "low": 80, "high": 90, "label": "Unsupported", "source": "explicit"]
            object["steps"] = steps
        })
        XCTAssertThrowsError(try fixture { object in
            var steps = object["steps"] as! [[String: Any]]
            steps[1]["endpoint"] = ["type": "distance", "meters": 1000, "seconds": 300]
            object["steps"] = steps
        })
        XCTAssertThrowsError(try WorkoutEnvelope.decode(Data(repeating: 32, count: WorkoutEnvelope.maxBytes + 1)))
    }
    func testExportTimeIsNotPartOfIdempotencyDigest() throws {
        let a = try fixture(), b = try fixture { $0["exportedAt"] = "2026-10-09T13:00:00.000Z" }
        XCTAssertEqual(try a.contentDigest(location: .outdoor), try b.contentDigest(location: .outdoor))
        XCTAssertNotEqual(try a.contentDigest(location: .indoor), try b.contentDigest(location: .outdoor))
    }
    func testRepeatedScheduleHasOneMutation() async throws {
        let port = FakePort(), ledger = MemoryLedger(), i = try intent()
        let c = SchedulingCoordinator(port: port, ledger: ledger)
        _ = try await c.schedule(i)
        _ = try await c.schedule(i)
        let count = await port.scheduleCount
        XCTAssertEqual(count, 1)
        XCTAssertEqual(try ledger.entry(for: i.planId)?.state, .scheduledLocally)
    }
    func testDifferentRevisionRequiresExplicitReplacementEvenWhenNumberDecreases() async throws {
        let port = FakePort(), c = SchedulingCoordinator(port: port, ledger: MemoryLedger())
        _ = try await c.schedule(intent("b"))
        do { _ = try await c.schedule(intent("a")); XCTFail("Expected confirmation") }
        catch { XCTAssertEqual(error as? CompanionError, .replacementRequired) }
        _ = try await c.schedule(intent("a"), confirmReplacement: true)
        let schedules = await port.scheduleCount, removals = await port.removeCount
        XCTAssertEqual(schedules, 2); XCTAssertEqual(removals, 1)
    }
    func testNativeEqualityCannotHideChangedCompanionNotesOrRevision() async throws {
        let port = FakePort(), c = SchedulingCoordinator(port: port, ledger: MemoryLedger())
        _ = try await c.schedule(intent("a"))
        await port.setNativeOnlyMatches(true)
        _ = try await c.schedule(intent("b"), confirmReplacement: true)
        let schedules = await port.scheduleCount, removals = await port.removeCount
        XCTAssertEqual(schedules, 2); XCTAssertEqual(removals, 1)
    }
    func testAuthorizationDenialNeverSchedules() async throws {
        let port = FakePort(); await port.setAuthorized(false)
        let c = SchedulingCoordinator(port: port, ledger: MemoryLedger())
        do { _ = try await c.schedule(intent()); XCTFail("Expected authorization") }
        catch { XCTAssertEqual(error as? CompanionError, .authorizationRequired) }
        let count = await port.scheduleCount; XCTAssertEqual(count, 0)
    }
    func testUnconfirmedScheduleRemainsPendingAndDoesNotAutomaticallyResubmit() async throws {
        let port = FakePort(), ledger = MemoryLedger(), i = try intent()
        await port.setReflectSchedule(false)
        let c = SchedulingCoordinator(port: port, ledger: ledger)
        for _ in 0..<2 {
            do { _ = try await c.schedule(i); XCTFail("Expected pending") }
            catch { XCTAssertEqual(error as? CompanionError, .readbackPending) }
        }
        let count = await port.scheduleCount; XCTAssertEqual(count, 1)
        XCTAssertEqual(try ledger.entry(for: i.planId)?.state, .pendingSchedule)
    }
    func testCompletedIdenticalPlanDoesNotClaimSchedulingSuccess() async throws {
        let port = FakePort(), c = SchedulingCoordinator(port: port, ledger: MemoryLedger()), i = try intent()
        _ = try await c.schedule(i); await port.setCompleted(true)
        do { _ = try await c.schedule(i); XCTFail("Expected completion guard") }
        catch { XCTAssertEqual(error as? CompanionError, .completedPlan) }
    }
    func testCancellationIsScopedRecordedAndReadBack() async throws {
        let port = FakePort(), ledger = MemoryLedger(), i = try intent()
        let c = SchedulingCoordinator(port: port, ledger: ledger)
        do { _ = try await c.cancel(i); XCTFail("Unowned cancellation must fail") } catch {}
        _ = try await c.schedule(i)
        _ = try await c.cancel(i)
        _ = try await c.cancel(i)
        let count = await port.removeCount; XCTAssertEqual(count, 1)
        XCTAssertEqual(try ledger.entry(for: i.planId)?.state, .removedLocally)
        do { _ = try await c.schedule(i); XCTFail("Cancelled revision requires reschedule confirmation") }
        catch { XCTAssertEqual(error as? CompanionError, .cancelledRevision) }
    }
    func testPendingRemovalRequiresExplicitRescheduleWhetherPlanStillExistsOrNot() async throws {
        for alreadyRemoved in [false, true] {
            let port = FakePort(), ledger = MemoryLedger(), i = try intent()
            let c = SchedulingCoordinator(port: port, ledger: ledger)
            _ = try await c.schedule(i)
            var entry = try XCTUnwrap(ledger.entry(for: i.planId))
            entry.state = .pendingRemoval
            try ledger.save(entry)
            if alreadyRemoved { try await port.removeAllInstances(of: i) }
            do { _ = try await c.schedule(i); XCTFail("Interrupted cancellation needs explicit reschedule") }
            catch { XCTAssertEqual(error as? CompanionError, .cancelledRevision) }
            let count = await port.scheduleCount; XCTAssertEqual(count, 1)
            _ = try await c.schedule(i, confirmReschedule: true)
            XCTAssertEqual(try ledger.entry(for: i.planId)?.state, .scheduledLocally)
        }
    }
    func testHealthAuthorizationMessageIsDistinctFromWorkoutScheduling() {
        XCTAssertTrue(CompanionError.healthAuthorizationRequired.errorDescription?.contains("HealthKit") == true)
        XCTAssertFalse(CompanionError.healthAuthorizationRequired.errorDescription?.contains("Workout scheduling") == true)
    }
    func testUnknownExistingIdentityCannotBeOverwrittenOrRemoved() async throws {
        let port = FakePort(), i = try intent(); await port.setExisting(i)
        let c = SchedulingCoordinator(port: port, ledger: MemoryLedger())
        do { _ = try await c.schedule(i, confirmReplacement: true); XCTFail("Unknown identity must not be adopted") } catch {}
        do { _ = try await c.cancel(i); XCTFail("Unknown identity must not be removed") } catch {}
        let count = await port.removeCount; XCTAssertEqual(count, 0)
    }
    func testDifferentSessionCannotClaimRecordedPlanId() async throws {
        let port = FakePort(), c = SchedulingCoordinator(port: port, ledger: MemoryLedger()), i = try intent()
        _ = try await c.schedule(i)
        let forged = ScheduleIntent(workout: try fixture { $0["sessionId"] = "another-session" }, location: .outdoor)
        do { _ = try await c.schedule(forged, confirmReplacement: true); XCTFail("Different session must fail") } catch {}
        do { _ = try await c.cancel(forged); XCTFail("Different session must fail") } catch {}
        let count = await port.removeCount; XCTAssertEqual(count, 0)
    }
    func testCapacityDoesNotEvictOtherWorkouts() async throws {
        let port = FakePort(); await port.setOtherCount(15)
        let c = SchedulingCoordinator(port: port, ledger: MemoryLedger())
        do { _ = try await c.schedule(intent()); XCTFail("Expected capacity guard") }
        catch { XCTAssertEqual(error as? CompanionError, .capacityReached) }
        let count = await port.removeCount; XCTAssertEqual(count, 0)
    }
    func testReentrantScheduleIsRejected() async throws {
        let port = FakePort(); await port.setDelay(true)
        let c = SchedulingCoordinator(port: port, ledger: MemoryLedger()), i = try intent()
        let first = Task { try await c.schedule(i) }
        while await port.scheduleCount == 0 { await Task.yield() }
        do { _ = try await c.schedule(i); XCTFail("Expected busy guard") }
        catch { XCTAssertEqual(error as? CompanionError, .operationInProgress) }
        _ = try await first.value
        let count = await port.scheduleCount; XCTAssertEqual(count, 1)
    }
}
private final class MemoryLedger: ScheduleLedger {
    var records: [UUID: ScheduleLedgerEntry] = [:]
    func entry(for id: UUID) throws -> ScheduleLedgerEntry? { records[id] }
    func save(_ entry: ScheduleLedgerEntry) throws { records[entry.intent.planId] = entry }
}
private actor FakePort: SchedulerPort {
    var scheduleCount = 0, removeCount = 0
    var authorized = true, reflectSchedule = true, completed = false, delay = false, nativeOnlyMatches = false
    var existing: ScheduleIntent?, otherCount = 0
    func setNativeOnlyMatches(_ value: Bool) { nativeOnlyMatches = value }
    func setAuthorized(_ value: Bool) { authorized = value }
    func setReflectSchedule(_ value: Bool) { reflectSchedule = value }
    func setCompleted(_ value: Bool) { completed = value }
    func setDelay(_ value: Bool) { delay = value }
    func setExisting(_ value: ScheduleIntent) { existing = value }
    func setOtherCount(_ value: Int) { otherCount = value }
    func isAuthorized() async -> Bool { authorized }
    func capacity() async -> Int { 15 }
    func validate(_ intent: ScheduleIntent) async throws { try intent.workout.validate() }
    func readback(_ intent: ScheduleIntent) async throws -> SchedulerReadback {
        let matches = existing?.planId == intent.planId
        let exact = try nativeOnlyMatches || (existing.map { try $0.digest() == intent.digest() } ?? false)
        return SchedulerReadback(totalCount: otherCount + (existing == nil ? 0 : 1), matchingIdentityCount: matches ? 1 : 0,
                                 exactContentAndDateCount: matches && exact ? 1 : 0, anyMatchingCompleted: matches && completed)
    }
    func schedule(_ intent: ScheduleIntent) async throws {
        scheduleCount += 1
        if delay { try await Task.sleep(nanoseconds: 50_000_000) }
        if reflectSchedule { existing = intent }
    }
    func removeAllInstances(of intent: ScheduleIntent) async throws {
        removeCount += 1
        if existing?.planId == intent.planId { existing = nil }
    }
}
