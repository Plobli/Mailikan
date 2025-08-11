import Foundation
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif
#if canImport(SwiftUI)
import SwiftUI // benötigt für Transferable
#endif

struct Email: Identifiable, Hashable, Codable, Sendable {
    let id: String
    var subject: String
    var from: String
    var to: String
    var date: Date
    var column: String
    var text: String?
    var html: String?
}

// Drag & Drop wird ohne Transferable über einfache NSItemProvider Strings umgesetzt.

struct Settings: Codable, Sendable {
    var imapHost: String
    var imapPort: String
    var imapUser: String
    var imapPassword: String
    var imapTls: Bool
    var port: String
}

struct AuthUser: Codable, Sendable {
    let id: String
    let email: String
}

struct LoginResponse: Codable, Sendable {
    let message: String
    let user: AuthUser
}

struct SyncResponse: Codable, Sendable {
    let message: String
    let count: Int
    let emails: [Email]
}

struct APIMessage: Codable, Sendable { let message: String }
