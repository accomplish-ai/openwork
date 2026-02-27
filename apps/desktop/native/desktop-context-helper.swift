#!/usr/bin/env swift

/**
 * macOS Desktop Context Helper
 * 
 * A command-line tool that communicates via JSON over stdin/stdout
 * to provide window enumeration, accessibility inspection, and screenshot capture.
 */

import Foundation
import AppKit
import ApplicationServices
import CoreGraphics

// MARK: - Error Types

enum HelperError: Error {
    case invalidJSON
    case missingParameter(String)
    case windowNotFound(Int)
    case permissionDenied(String)
    case accessibilityDisabled
    case screenRecordingDenied
    case invalidParams(String)
}

func helperErrorMessage(_ error: Error) -> String {
    if let helperError = error as? HelperError {
        switch helperError {
        case .invalidJSON:
            return "Invalid JSON"
        case .missingParameter(let param):
            return "Missing parameter: \(param)"
        case .windowNotFound(let id):
            return "Window not found: \(id)"
        case .permissionDenied(let reason):
            return "Permission denied: \(reason)"
        case .accessibilityDisabled:
            return "Accessibility permissions not granted"
        case .screenRecordingDenied:
            return "Screen recording permissions not granted"
        case .invalidParams(let reason):
            return "Invalid parameters: \(reason)"
        }
    }

    return error.localizedDescription
}

// MARK: - Command/Response Types

struct Command: Codable {
    let cmd: String
    let id: String
    let params: Params?
    
    struct Params: Codable {
        let windowId: Int?
        let mode: String?
        let rect: Rect?
        let maxDepth: Int?
        let maxNodes: Int?
        
        struct Rect: Codable {
            let x: Double
            let y: Double
            let width: Double
            let height: Double
        }
    }
}

struct Response: Codable {
    let id: String
    let success: Bool
    let error: String?
    let data: ResponseData?
    
    struct ResponseData: Codable {
        let windows: [WindowInfo]?
        let tree: AccessibleNode?
        let imagePath: String?
        let region: Rect?
        
        struct Rect: Codable {
            let x: Double
            let y: Double
            let width: Double
            let height: Double
        }
    }
}

struct WindowInfo: Codable {
    let id: Int
    let appName: String
    let pid: Int
    let title: String
    let bounds: Bounds
    let zOrder: Int
    let stackIndex: Int
    let isOnScreen: Bool
    let isMinimized: Bool
    let isVisible: Bool
    let isFrontmostApp: Bool
    let appIsHidden: Bool
    let layer: Int
    
    struct Bounds: Codable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double
    }
}

struct AccessibleNode: Codable {
    let role: String
    let title: String?
    let value: String?
    let description: String?
    let frame: Frame?
    let children: [AccessibleNode]?
    let actions: [String]?
    let enabled: Bool?
    let focused: Bool?
    let windowId: Int?
    let appId: Int?
    
    struct Frame: Codable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double
    }
}

private func windowTitle(for element: AXUIElement) -> String? {
    var titleRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef) == .success else {
        return nil
    }
    let title = (titleRef as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let title, !title.isEmpty else {
        return nil
    }
    return title
}

private func windowFrame(for element: AXUIElement) -> CGRect? {
    var positionRef: CFTypeRef?
    var sizeRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionRef) == .success,
          AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef) == .success,
          let positionRef,
          let sizeRef else {
        return nil
    }

    let position = positionRef as! AXValue
    let size = sizeRef as! AXValue
    var pos = CGPoint.zero
    var sz = CGSize.zero
    guard AXValueGetValue(position, .cgPoint, &pos),
          AXValueGetValue(size, .cgSize, &sz) else {
        return nil
    }

    return CGRect(origin: pos, size: sz)
}

private func normalizedTitle(_ title: String?) -> String? {
    guard let title else { return nil }
    let normalized = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return normalized.isEmpty ? nil : normalized
}

private func scoreWindowMatch(
    targetTitle: String?,
    targetBounds: CGRect?,
    candidateTitle: String?,
    candidateFrame: CGRect?
) -> Int {
    var score = 0

    let targetNormalized = normalizedTitle(targetTitle)
    let candidateNormalized = normalizedTitle(candidateTitle)

    if let targetNormalized, let candidateNormalized {
        if targetNormalized == candidateNormalized {
            score += 140
        } else if targetNormalized.contains(candidateNormalized) || candidateNormalized.contains(targetNormalized) {
            score += 80
        }
    }

    if let frame = candidateFrame, let targetBounds {
        let frameCenter = CGPoint(x: frame.midX, y: frame.midY)
        let targetCenter = CGPoint(x: targetBounds.midX, y: targetBounds.midY)
        let centerDistance = hypot(frameCenter.x - targetCenter.x, frameCenter.y - targetCenter.y)
        score += max(0, 120 - Int(centerDistance / 8.0))

        let widthDelta = abs(frame.width - targetBounds.width)
        let heightDelta = abs(frame.height - targetBounds.height)
        score += max(0, 80 - Int((widthDelta + heightDelta) / 8.0))
    }

    return score
}

// MARK: - Window Enumeration

func listWindows() throws -> [WindowInfo] {
    // Include background and occluded windows, not just currently on-screen windows.
    let option = CGWindowListOption(arrayLiteral: .excludeDesktopElements)
    guard let windowList = CGWindowListCopyWindowInfo(option, kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    let totalWindows = windowList.count
    let frontmostPid = Int(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0)
    
    var windows: [WindowInfo] = []
    
    for (index, windowDict) in windowList.enumerated() {
        guard let windowId = windowDict[kCGWindowNumber as String] as? Int,
              let boundsDict = windowDict[kCGWindowBounds as String] as? [String: Any],
              let x = boundsDict["X"] as? Double,
              let y = boundsDict["Y"] as? Double,
              let width = boundsDict["Width"] as? Double,
              let height = boundsDict["Height"] as? Double else {
            continue
        }
        
        let appName = windowDict[kCGWindowOwnerName as String] as? String ?? "Unknown"
        let pid = windowDict[kCGWindowOwnerPID as String] as? Int ?? 0
        let title = windowDict[kCGWindowName as String] as? String ?? ""
        let layer = windowDict[kCGWindowLayer as String] as? Int ?? 0
        let isOnScreen = windowDict[kCGWindowIsOnscreen as String] as? Bool ?? false
        let sharingState = windowDict[kCGWindowSharingState as String] as? Int ?? 0
        let isVisible = sharingState != 0
        let app = NSRunningApplication(processIdentifier: pid_t(pid))
        let appIsHidden = app?.isHidden ?? false
        let isFrontmostApp = frontmostPid != 0 && pid == frontmostPid

        // Keep only normal app windows to avoid noisy system overlays.
        if layer != 0 {
            continue
        }
        if width < 40 || height < 40 {
            continue
        }
        if appName == "Window Server" {
            continue
        }
        if !isOnScreen && title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            continue
        }
        
        // Check if minimized (best-effort heuristic).
        let isMinimized = !isOnScreen && (width <= 1 || height <= 1)

        // Preserve front-to-back ordering from CoreGraphics.
        // Higher zOrder means closer to the front.
        let zOrder = totalWindows - index
        
        windows.append(WindowInfo(
            id: windowId,
            appName: appName,
            pid: pid,
            title: title,
            bounds: WindowInfo.Bounds(x: x, y: y, width: width, height: height),
            zOrder: zOrder,
            stackIndex: index,
            isOnScreen: isOnScreen,
            isMinimized: isMinimized,
            isVisible: isVisible,
            isFrontmostApp: isFrontmostApp,
            appIsHidden: appIsHidden,
            layer: layer
        ))
    }
    
    // Sort by z-order (descending)
    windows.sort { $0.zOrder > $1.zOrder }
    
    return windows
}

// MARK: - Accessibility Inspection

func inspectWindow(windowId: Int, maxDepth: Int = 10, maxNodes: Int = 1000) throws -> AccessibleNode {
    // Get window info to find the PID
    let option = CGWindowListOption(arrayLiteral: .excludeDesktopElements)
    guard let windowList = CGWindowListCopyWindowInfo(option, CGWindowID(windowId)) as? [[String: Any]],
          let windowDict = windowList.first,
          let pid = windowDict[kCGWindowOwnerPID as String] as? Int32 else {
        throw HelperError.windowNotFound(windowId)
    }

    let targetTitle = windowDict[kCGWindowName as String] as? String
    let targetBounds: CGRect? = {
        guard let boundsDict = windowDict[kCGWindowBounds as String] as? [String: Any],
              let x = boundsDict["X"] as? Double,
              let y = boundsDict["Y"] as? Double,
              let width = boundsDict["Width"] as? Double,
              let height = boundsDict["Height"] as? Double else {
            return nil
        }
        return CGRect(x: x, y: y, width: width, height: height)
    }()
    
    // Check accessibility permissions
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false]
    guard AXIsProcessTrustedWithOptions(options as CFDictionary) else {
        throw HelperError.accessibilityDisabled
    }
    
    // Create accessibility element for the application
    let appElement = AXUIElementCreateApplication(pid)
    
    // Get windows for this app
    var windowsRef: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)
    
    guard result == .success, let windows = windowsRef as? [AXUIElement] else {
        throw HelperError.windowNotFound(windowId)
    }
    
    // Match AX window against the requested CG window by title and bounds.
    var bestWindow: AXUIElement?
    var bestScore = Int.min

    for window in windows {
        let candidateTitle = windowTitle(for: window)
        let candidateFrame = windowFrame(for: window)
        let score = scoreWindowMatch(
            targetTitle: targetTitle,
            targetBounds: targetBounds,
            candidateTitle: candidateTitle,
            candidateFrame: candidateFrame
        )

        if score > bestScore {
            bestScore = score
            bestWindow = window
        }
    }

    guard let window = bestWindow ?? windows.first else {
        throw HelperError.windowNotFound(windowId)
    }
    
    // Build accessibility tree
    return try buildAccessibilityTree(element: window, depth: 0, maxDepth: maxDepth, maxNodes: maxNodes, currentCount: 0).node
}

func buildAccessibilityTree(
    element: AXUIElement,
    depth: Int,
    maxDepth: Int,
    maxNodes: Int,
    currentCount: Int
) throws -> (node: AccessibleNode, count: Int) {
    if depth >= maxDepth || currentCount >= maxNodes {
        return (AccessibleNode(
            role: "truncated",
            title: nil,
            value: nil,
            description: nil,
            frame: nil,
            children: nil,
            actions: nil,
            enabled: nil,
            focused: nil,
            windowId: nil,
            appId: nil
        ), currentCount)
    }
    
    var roleRef: CFTypeRef?
    var titleRef: CFTypeRef?
    var valueRef: CFTypeRef?
    var descriptionRef: CFTypeRef?
    var positionRef: CFTypeRef?
    var sizeRef: CFTypeRef?
    var enabledRef: CFTypeRef?
    var focusedRef: CFTypeRef?
    var actionsRef: CFTypeRef?
    
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef)
    AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef)
    AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
    AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &descriptionRef)
    AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionRef)
    AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef)
    AXUIElementCopyAttributeValue(element, kAXEnabledAttribute as CFString, &enabledRef)
    AXUIElementCopyAttributeValue(element, kAXFocusedAttribute as CFString, &focusedRef)
    AXUIElementCopyAttributeValue(element, "AXActions" as CFString, &actionsRef)
    
    let role = (roleRef as? String) ?? "unknown"
    let title = titleRef as? String
    let value = valueRef as? String
    let description = descriptionRef as? String
    let enabled = enabledRef as? Bool
    let focused = focusedRef as? Bool
    
    var frame: AccessibleNode.Frame?
    if let positionRef,
       let sizeRef {
        let position = positionRef as! AXValue
        let size = sizeRef as! AXValue
        var pos = CGPoint.zero
        var sz = CGSize.zero
        if AXValueGetValue(position, .cgPoint, &pos),
           AXValueGetValue(size, .cgSize, &sz) {
            frame = AccessibleNode.Frame(x: Double(pos.x), y: Double(pos.y), width: Double(sz.width), height: Double(sz.height))
        }
    }
    
    var actions: [String]?
    if let actionsArray = actionsRef as? [String] {
        actions = actionsArray
    }
    
    // Get children
    var childrenRef: CFTypeRef?
    var children: [AccessibleNode] = []
    var childCount = currentCount + 1
    
    if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
       let childrenArray = childrenRef as? [AXUIElement] {
        for child in childrenArray {
            if childCount >= maxNodes {
                break
            }
            let (childNode, newCount) = try buildAccessibilityTree(
                element: child,
                depth: depth + 1,
                maxDepth: maxDepth,
                maxNodes: maxNodes,
                currentCount: childCount
            )
            children.append(childNode)
            childCount = newCount
        }
    }
    
    return (AccessibleNode(
        role: role,
        title: title,
        value: value,
        description: description,
        frame: frame,
        children: children.isEmpty ? nil : children,
        actions: actions,
        enabled: enabled,
        focused: focused,
        windowId: nil,
        appId: nil
    ), childCount)
}

// MARK: - Screenshot Capture

func runScreenCapture(arguments: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    process.arguments = arguments

    let stderrPipe = Pipe()
    process.standardError = stderrPipe

    do {
        try process.run()
    } catch {
        throw HelperError.invalidParams("Failed to launch screencapture")
    }

    process.waitUntilExit()

    if process.terminationStatus != 0 {
        let errorData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrText = String(data: errorData, encoding: .utf8) ?? "screencapture failed"
        let lowered = stderrText.lowercased()
        if lowered.contains("not authorized") || lowered.contains("permission denied") {
            throw HelperError.screenRecordingDenied
        }
        throw HelperError.invalidParams(stderrText.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

func captureScreenshot(mode: String, windowId: Int?, rect: Command.Params.Rect?) throws -> (path: String, region: Response.ResponseData.Rect) {
    let tempDir = FileManager.default.temporaryDirectory
    let filename = "screenshot_\(UUID().uuidString).png"
    let fileURL = tempDir.appendingPathComponent(filename)

    var region: Response.ResponseData.Rect
    
    switch mode {
    case "screen":
        let displayID = CGMainDisplayID()
        let bounds = CGDisplayBounds(displayID)
        region = Response.ResponseData.Rect(
            x: Double(bounds.origin.x),
            y: Double(bounds.origin.y),
            width: Double(bounds.width),
            height: Double(bounds.height)
        )
        do {
            try runScreenCapture(arguments: ["-x", fileURL.path])
        } catch {
            if let helperError = error as? HelperError, case .screenRecordingDenied = helperError {
                throw HelperError.screenRecordingDenied
            }
            throw HelperError.screenRecordingDenied
        }
        
    case "window":
        guard let wid = windowId else {
            throw HelperError.missingParameter("windowId")
        }
        let option = CGWindowListOption(arrayLiteral: .excludeDesktopElements)
        if let windowList = CGWindowListCopyWindowInfo(option, kCGNullWindowID) as? [[String: Any]],
           let windowDict = windowList.first(where: { ($0[kCGWindowNumber as String] as? Int) == wid }),
           let boundsDict = windowDict[kCGWindowBounds as String] as? [String: Any],
           let x = boundsDict["X"] as? Double,
           let y = boundsDict["Y"] as? Double,
           let width = boundsDict["Width"] as? Double,
           let height = boundsDict["Height"] as? Double {
            region = Response.ResponseData.Rect(x: x, y: y, width: width, height: height)
        } else {
            throw HelperError.windowNotFound(wid)
        }
        do {
            try runScreenCapture(arguments: ["-x", "-l\(wid)", fileURL.path])
        } catch {
            let message = helperErrorMessage(error).lowercased()
            if message.contains("window") || message.contains("not found") {
                throw HelperError.windowNotFound(wid)
            }
            throw error
        }
        
    case "region":
        guard let r = rect else {
            throw HelperError.missingParameter("rect")
        }
        region = Response.ResponseData.Rect(x: r.x, y: r.y, width: r.width, height: r.height)
        let regionArg = "\(Int(r.x)),\(Int(r.y)),\(Int(r.width)),\(Int(r.height))"
        try runScreenCapture(arguments: ["-x", "-R\(regionArg)", fileURL.path])
        
    default:
        throw HelperError.invalidParams("Invalid mode: \(mode)")
    }
    
    if !FileManager.default.fileExists(atPath: fileURL.path) {
        throw HelperError.screenRecordingDenied
    }
    
    return (fileURL.path, region)
}

// MARK: - Main Loop

func handleCommand(_ command: Command) -> Response {
    do {
        switch command.cmd {
        case "list_windows":
            let windows = try listWindows()
            return Response(
                id: command.id,
                success: true,
                error: nil,
                data: Response.ResponseData(windows: windows, tree: nil, imagePath: nil, region: nil)
            )
            
        case "inspect_window":
            guard let windowId = command.params?.windowId else {
                throw HelperError.missingParameter("windowId")
            }
            let maxDepth = command.params?.maxDepth ?? 10
            let maxNodes = command.params?.maxNodes ?? 1000
            let tree = try inspectWindow(windowId: windowId, maxDepth: maxDepth, maxNodes: maxNodes)
            return Response(
                id: command.id,
                success: true,
                error: nil,
                data: Response.ResponseData(windows: nil, tree: tree, imagePath: nil, region: nil)
            )
            
        case "capture":
            guard let mode = command.params?.mode else {
                throw HelperError.missingParameter("mode")
            }
            let (path, region) = try captureScreenshot(
                mode: mode,
                windowId: command.params?.windowId,
                rect: command.params?.rect
            )
            return Response(
                id: command.id,
                success: true,
                error: nil,
                data: Response.ResponseData(windows: nil, tree: nil, imagePath: path, region: region)
            )
            
        default:
            throw HelperError.invalidParams("Unknown command: \(command.cmd)")
        }
    } catch let error as HelperError {
        return Response(id: command.id, success: false, error: helperErrorMessage(error), data: nil)
    } catch {
        return Response(id: command.id, success: false, error: error.localizedDescription, data: nil)
    }
}

// MARK: - Entry Point

func main() {
    let decoder = JSONDecoder()
    let encoder = JSONEncoder()
    
    // Read from stdin line by line
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let command = try? decoder.decode(Command.self, from: data) else {
            let errorResponse = Response(id: "unknown", success: false, error: "Invalid JSON", data: nil)
            if let errorData = try? encoder.encode(errorResponse),
               let errorString = String(data: errorData, encoding: .utf8) {
                print(errorString)
            }
            continue
        }
        
        let response = handleCommand(command)
        if let responseData = try? encoder.encode(response),
           let responseString = String(data: responseData, encoding: .utf8) {
            print(responseString)
            fflush(stdout)
        }
    }
}

main()
