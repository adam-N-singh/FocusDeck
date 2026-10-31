#!/usr/bin/env swift
// FocusDeckSensor.swift: FocusDeck's macOS app-switch sensor.
// Stage 0 spike (a) from ASSESSMENT.md §6. UNTESTED: written without a Mac; see README.md.
//
// Run:  swift FocusDeckSensor.swift
// Env:  FOCUSDECK_URL (default http://127.0.0.1:3000), FOCUSDECK_SENSOR_TOKEN (if the bridge has one),
//       FOCUSDECK_DEBUG=1 to print each switch it sends.
//
// It reads one thing: the bundle identifier of the app that just became active. No window
// titles, URLs, documents or keystrokes (Privacy Class E). The bridge's config lists the
// designated apps and their bundle ids; anything else is dropped right here, before it could
// be logged or sent, so the app layer structurally cannot see it (ASSESSMENT.md §4.7).

import AppKit
import Foundation

let env = ProcessInfo.processInfo.environment
let baseURL = (env["FOCUSDECK_URL"].flatMap { $0.isEmpty ? nil : $0 } ?? "http://127.0.0.1:3000")
    .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
let token = env["FOCUSDECK_SENSOR_TOKEN"].flatMap { $0.isEmpty ? nil : $0 }
let debugSwitches = env["FOCUSDECK_DEBUG"] == "1"

/// The fields of GET /api/sensor/config this sensor uses.
struct BridgeConfig: Decodable {
    struct App: Decodable {
        let id: String
        let bundleIds: [String]
    }
    let configured: Bool
    let designatedApps: [String]
    let apps: [App]
}

/// bundle id -> FocusDeck app id. The bridge already lists designated apps only; this checks
/// again anyway (defense in depth), and an unconfigured or unreadable answer maps nothing.
func appMap(_ config: BridgeConfig?) -> [String: String] {
    var map: [String: String] = [:]
    guard let config = config, config.configured else { return map }
    for app in config.apps where config.designatedApps.contains(app.id) {
        for bundleId in app.bundleIds { map[bundleId] = app.id }
    }
    return map
}

final class Sensor {
    /// Designated apps only. Empty until the first config arrives and emptied whenever a
    /// refresh fails: if the sensor doesn't know an app is designated, it doesn't send it.
    private var appByBundleId: [String: String] = [:]
    /// The last app id sent. A drop never resets it, so editor -> (undesignated) -> editor stays a
    /// single switch: a repeat would tell FocusDeck that something it may not see happened between.
    private var lastSent: String?
    private var watching: [String]?
    private let session = URLSession(configuration: .ephemeral) // no on-disk cache or cookies

    private func makeRequest(_ path: String, body: Data? = nil) -> URLRequest? {
        guard let url = URL(string: baseURL + path) else { return nil }
        var request = URLRequest(url: url, timeoutInterval: 2)
        if let body = body {
            request.httpMethod = "POST"
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token = token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    /// Fetches which apps are designated: at start, then every 60 s, so a change on FocusDeck's
    /// Declare screen reaches the sensor within a minute.
    func refreshConfig() {
        guard let request = makeRequest("/api/sensor/config") else { return }
        session.dataTask(with: request) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            var config: BridgeConfig?
            if status == 200, let data = data { config = try? JSONDecoder().decode(BridgeConfig.self, from: data) }
            let map = appMap(config)
            var why = "FocusDeck has not designated any app this sensor can map"
            if error != nil { why = "the bridge is unreachable" }
            else if status == 401 { why = "FOCUSDECK_SENSOR_TOKEN is missing or wrong" }
            else if config == nil { why = "unexpected answer, HTTP \(status)" }
            let reason = why
            DispatchQueue.main.async { self.apply(map, emptyBecause: reason) }
        }.resume()
    }

    private func apply(_ map: [String: String], emptyBecause reason: String) {
        appByBundleId = map
        let ids = Set(map.values).sorted()
        guard ids != watching else { return }
        watching = ids
        let what = ids.isEmpty ? "nothing (" + reason + ")" : ids.joined(separator: ", ")
        print("FocusDeck sensor: watching \(what)")
    }

    func activated(_ note: Notification) {
        let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        // Map, or drop right here: an undesignated app is never logged and never sent.
        guard let bundleId = app?.bundleIdentifier, let id = appByBundleId[bundleId] else { return }
        guard id != lastSent else { return }
        lastSent = id
        guard let body = try? JSONEncoder().encode(["kind": "app-switch", "app": id]),
              let request = makeRequest("/api/sensor/events", body: body) else { return }
        if debugSwitches { print("FocusDeck sensor: app-switch \(id)") }
        // Fire and forget: if FocusDeck isn't running, the switch simply isn't seen.
        session.dataTask(with: request).resume()
    }
}

setvbuf(stdout, nil, _IOLBF, 0) // line-buffered, so status lines show up even when piped to a log
let sensor = Sensor()
// The notification center and the run loop retain the observer and the timer.
_ = NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
) { note in sensor.activated(note) }
sensor.refreshConfig()
_ = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in sensor.refreshConfig() }
print("FocusDeck sensor: reporting designated app switches to \(baseURL). Ctrl-C to stop.")
RunLoop.main.run()
