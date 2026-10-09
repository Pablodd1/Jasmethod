// Add this file to an iOS 17+ SwiftUI app target, linking both package products.
// This is source for a native host; no signed app, entitlement or deployment is created here.
import SwiftUI
import UniformTypeIdentifiers
import JMMWorkoutCore
import JMMWorkoutKit

@main
struct JMMCompanionApp: App {
    var body: some Scene { WindowGroup { CompanionView() } }
}

@MainActor
final class CompanionModel: ObservableObject {
    @Published var imported: WorkoutEnvelope?
    @Published var location: WorkoutLocation?
    @Published var status = "Import a fresh .jmmworkout.json file downloaded from your signed-in JMM session."
    @Published var busy = false
    @Published var batch: CompletedWorkoutBatch?
    private let port = AppleSchedulerPort()
    private let health = HealthKitReader()
    private var coordinator: SchedulingCoordinator?
    init() {
        do {
            let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            coordinator = SchedulingCoordinator(port: port, ledger: try FileScheduleLedger(directory: root.appendingPathComponent("JMMWorkouts")))
        } catch { status = "Local schedule storage is unavailable: \(error.localizedDescription)" }
    }
    func importFile(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            imported = nil; location = nil
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: WorkoutEnvelope.maxBytes + 1) ?? Data()
            let decoded = try WorkoutEnvelope.decode(data)
            imported = decoded; location = nil
            status = "Imported locally. Review every step, export time and revision. This offline file cannot detect later changes to your JMM session."
        } catch { status = error.localizedDescription }
    }
    func run(_ operation: @escaping () async throws -> String) {
        guard !busy else { return }
        busy = true
        Task { defer { busy = false }; do { status = try await operation() } catch { status = error.localizedDescription } }
    }
    private func intent() throws -> ScheduleIntent {
        guard let imported, let location else { throw CompanionError.invalid("Import a file and choose indoor or outdoor first.") }
        return ScheduleIntent(workout: imported, location: location)
    }
    func authorize() { run {
        let state = await self.port.requestAuthorization()
        return "Workout scheduling permission: \(String(describing: state)). HealthKit reading is separate."
    } }
    func schedule(replace: Bool) { run {
        guard let coordinator = self.coordinator else { throw CompanionError.invalid("Local schedule storage is unavailable.") }
        let entry = try await coordinator.schedule(self.intent(), confirmReplacement: replace, confirmReschedule: replace)
        return "\(entry.state.rawValue): confirmed in the local Apple scheduler. Watch delivery is unverified; inspect the Workout app on your watch."
    } }
    func refresh() { run {
        guard let coordinator = self.coordinator else { throw CompanionError.invalid("Local schedule storage is unavailable.") }
        let readback = try await coordinator.refresh(self.intent())
        return "Local scheduler: \(readback.matchingIdentityCount) plan instance(s), \(readback.exactContentAndDateCount) exact content/date match(es), completion flag: \(readback.anyMatchingCompleted). This is not watch receipt or HealthKit measurements."
    } }
    func cancel() { run {
        guard let coordinator = self.coordinator else { throw CompanionError.invalid("Local schedule storage is unavailable.") }
        _ = try await coordinator.cancel(self.intent())
        return "Plan removal confirmed in the local scheduler. Watch propagation is unverified."
    } }
    func authorizeHealth() { run {
        try await self.health.requestReadAccess()
        return "HealthKit permission request finished. Apple does not disclose whether read access was granted. Reading and exporting require separate taps."
    } }
    func readHealth() {
        batch = nil
        run {
        let end = Date()
        self.batch = try await self.health.read(start: end.addingTimeInterval(-7 * 86400), end: end)
        return "Read \(self.batch?.workouts.count ?? 0) workout(s) for local review. Empty results may mean no data or denied access. Nothing was uploaded."
    } }
}

struct CompanionView: View {
    @StateObject private var model = CompanionModel()
    @State private var importer = false
    @State private var replacement = false
    @State private var cancellation = false
    @State private var exporter = false
    @State private var exportDocument = JSONDocument(data: Data())
    var body: some View {
        NavigationStack {
            Form {
                Section("JMM native companion • unverified source build") {
                    Button("Import workout JSON") { importer = true }.disabled(model.busy)
                    Text(model.status).accessibilityIdentifier("companion-status")
                }
                if let workout = model.imported {
                    Section("Review imported workout") {
                        Text(workout.title)
                        Text("\(workout.sport.rawValue) • \(workout.dateLocal) • \(workout.timezone)")
                        Text("Exported: \(workout.exportedAt)")
                        Text("Revision: \(workout.revision)").font(.caption).textSelection(.enabled)
                        Text("Export again if your check-in, safety status, plan or targets changed. Offline files cannot be revalidated against the server.")
                        Picker("Workout location", selection: $model.location) {
                            Text("Choose location").tag(WorkoutLocation?.none)
                            Text("Outdoor").tag(WorkoutLocation?.some(.outdoor))
                            Text("Indoor").tag(WorkoutLocation?.some(.indoor))
                        }.disabled(model.busy)
                        Text("Full labels and notes stay here. iOS 17/watchOS 10 do not support step display names. Notes and group labels are not encoded as watch instructions; review them here before scheduling.")
                        ForEach(Array(workout.steps.enumerated()), id: \.offset) { index, step in
                            VStack(alignment: .leading) {
                                Text("\(index + 1). \(step.phase.rawValue): \(step.name)")
                                Text(endpointText(step.endpoint))
                                Text(step.target.label)
                                if let group = step.group { Text(group) }
                                if let note = step.note { Text(note) }
                            }
                        }
                    }
                    Section("Apple Workout scheduling") {
                        Button("Allow Workout scheduling") { model.authorize() }
                        Button("Schedule reviewed workout") { model.schedule(replace: false) }
                        Button("Replace or reschedule this plan…") { replacement = true }
                        Button("Refresh local scheduler state") { model.refresh() }
                        Button("Remove this scheduled plan…", role: .destructive) { cancellation = true }
                    }.disabled(model.busy)
                }
                Section("Optional completed workouts • HealthKit") {
                    Text("Read-only access is separate from Workout scheduling. The selected summaries contain health data and stay on this device until you choose to export them.")
                    Button("Allow reading completed workouts") { model.authorizeHealth() }
                    Button("Read the last 7 days for review") { model.readHealth() }
                    if let batch = model.batch {
                        Text(batch.possiblyTruncated ? "100-result limit reached; this may be incomplete." : "Returned \(batch.workouts.count) summaries.")
                        ForEach(batch.workouts, id: \.sampleId) { workout in
                            VStack(alignment: .leading) {
                                Text("\(workout.sport) • \(workout.start.formatted()) • \(workout.durationSeconds) seconds • distance: \(workout.distanceMeters.map { String($0) } ?? "unavailable") meters")
                                Text("Sample: \(workout.sampleId.uuidString)").font(.caption)
                                Text("Associated plan: \(workout.planId?.uuidString ?? "unavailable")").font(.caption)
                                Text("Source app: \(workout.sourceBundleId)").font(.caption)
                            }
                        }
                        Button("Export reviewed health summaries to a file…") {
                            do { exportDocument = JSONDocument(data: try batch.reviewedExportData()); exporter = true }
                            catch { model.status = error.localizedDescription }
                        }
                        Text("No server ingestion or automatic matching is enabled. A sample's optional plan ID does not establish its prescription revision.")
                    }
                }.disabled(model.busy)
            }.navigationTitle("JMM Workout Companion")
        }
        .fileImporter(isPresented: $importer, allowedContentTypes: [.json], allowsMultipleSelection: false, onCompletion: model.importFile)
        .fileExporter(isPresented: $exporter, document: exportDocument, contentType: .json, defaultFilename: "jmm-completed-workouts.json") { result in
            if case .failure(let error) = result { model.status = error.localizedDescription }
        }
        .confirmationDialog("Replace the existing local plan with this reviewed file? It may be older than the server. Removal happens before rescheduling, so a failed replacement can leave no scheduled plan.", isPresented: $replacement) {
            Button("Replace with reviewed file") { model.schedule(replace: true) }
        }
        .confirmationDialog("Remove all local scheduled instances of this plan?", isPresented: $cancellation) {
            Button("Remove this plan", role: .destructive) { model.cancel() }
        }
    }
    private func endpointText(_ endpoint: WorkoutEnvelope.Endpoint) -> String {
        switch endpoint.type {
        case .time: return "\(endpoint.seconds ?? 0) seconds"
        case .distance: return "\(endpoint.meters ?? 0) meters"
        case .lap: return "Open goal: advance this step manually"
        }
    }
}
struct JSONDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
