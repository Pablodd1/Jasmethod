// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "JMMAppleCompanion",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v13)],
    products: [
        .library(name: "JMMWorkoutCore", targets: ["JMMWorkoutCore"]),
        .library(name: "JMMWorkoutKit", targets: ["JMMWorkoutKit"])
    ],
    targets: [
        .target(name: "JMMWorkoutCore"),
        .target(name: "JMMWorkoutKit", dependencies: ["JMMWorkoutCore"]),
        .testTarget(name: "JMMWorkoutCoreTests", dependencies: ["JMMWorkoutCore"], resources: [.copy("Fixtures")]),
        .testTarget(name: "JMMWorkoutKitTests", dependencies: ["JMMWorkoutKit", "JMMWorkoutCore"])
    ]
)
