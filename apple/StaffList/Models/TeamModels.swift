import Foundation
import Supabase

// Team, schedule and notification records (supabase/migrations/2026-10-11_team_invites.sql,
// 2026-10-15_notifications.sql, 2026-10-23_team_invites.sql).

struct TeamMember: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var email: String?
    var phone: String?
    var positionIds: [UUID]?
    var joinStatus: String?

    enum CodingKeys: String, CodingKey {
        case id, name, email, phone
        case positionIds = "position_ids"
        case joinStatus = "join_status"
    }

    static let columns = "id,name,email,phone,position_ids,join_status"

    var joinLabel: String? {
        switch joinStatus {
        case "accepted": return "Joined"
        case "invited": return "Invited"
        case "declined": return "Declined"
        default: return nil
        }
    }
}

struct MemberPayload: Encodable {
    var name: String
    var email: String?
    var phone: String?
    var position_ids: [UUID]
    var user_id: UUID?
    var church_id: UUID?
}

struct Position: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var category: String?
}

struct NewPosition: Encodable {
    let name: String
    let category: String
    let user_id: UUID
    let church_id: UUID
}

struct Assignment: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let setId: UUID
    let positionId: UUID
    let memberId: UUID
    var status: String?

    enum CodingKeys: String, CodingKey {
        case id, status
        case setId = "set_id"
        case positionId = "position_id"
        case memberId = "member_id"
    }

    var statusLabel: String {
        switch status ?? "draft" {
        case "invited": return "Waiting"
        case "accepted": return "Accepted"
        case "declined": return "Declined"
        default: return "Not sent"
        }
    }
}

struct NewAssignment: Encodable {
    let set_id: UUID
    let position_id: UUID
    let member_id: UUID
}

struct AppNotification: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let kind: String
    let title: String
    let body: String?
    let setId: UUID?
    let assignmentId: UUID?
    let readAt: String?
    let createdAt: String?
    let assignmentStatus: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, title, body
        case setId = "set_id"
        case assignmentId = "assignment_id"
        case readAt = "read_at"
        case createdAt = "created_at"
        case assignmentStatus = "assignment_status"
    }
}

struct TeamInvite: Codable, Hashable, Sendable {
    let memberId: UUID
    let team: String
    let details: String?
    let inviter: String?

    enum CodingKeys: String, CodingKey {
        case team, details, inviter
        case memberId = "member_id"
    }
}

/// What /api/v1/send-invites did; each list holds ids.
struct InviteResult {
    let raw: JSONObject
    private func count(_ key: String) -> Int { raw[key]?.arrayValue?.count ?? 0 }

    var summary: String {
        var parts: [String] = []
        let sent = count("sent"), invites = count("teamInvites"), held = count("held"), already = count("already"), failed = count("failed")
        if sent > 0 { parts.append("Sent \(sent) set request\(sent == 1 ? "" : "s").") }
        if invites > 0 {
            parts.append(held > 0
                ? "Invited \(invites) \(invites == 1 ? "person" : "people") to join the team first; they'll answer when they join."
                : "Sent \(invites) team invitation\(invites == 1 ? "" : "s").")
        }
        if already > 0 { parts.append("\(already) already joined.") }
        if failed > 0 { parts.append("\(failed) couldn't be sent.") }
        return parts.isEmpty ? "Nothing to send." : parts.joined(separator: " ")
    }
}

enum Invites {
    /// Team invitations ({ members }) or set requests ({ ids }) through the shared API.
    static func send(members: [UUID] = [], assignments: [UUID] = []) async -> String {
        var body: JSONObject = [:]
        if !members.isEmpty { body["members"] = .array(members.map { .string($0.uuidString.lowercased()) }) }
        if !assignments.isEmpty { body["ids"] = .array(assignments.map { .string($0.uuidString.lowercased()) }) }
        do {
            let out = try await StaffListAPI.shared.post("send-invites", body, as: JSONObject.self)
            return InviteResult(raw: out).summary
        } catch let e as APIError where e.status == 402 {
            return "Inviting people is part of Pro. Upgrade your team at stafflist.app → Settings → Subscription Plans."
        } catch let e as APIError where e.status == 501 {
            return "Automatic email isn't set up yet — send this one from stafflist.app for now."
        } catch {
            return "Couldn't send. \(error.localizedDescription)"
        }
    }
}
