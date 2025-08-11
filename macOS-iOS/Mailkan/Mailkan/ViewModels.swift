import Foundation
import SwiftUI
import Combine

@MainActor
class AppViewModel: ObservableObject {
    // AuthState bleibt für minimale Codeänderungen erhalten, wird aber immer als authenticated genutzt
    enum AuthState { case authenticated }
    enum Mode { case directIMAP }
    @Published var authState: AuthState = .authenticated
    @Published var user: AuthUser?
    @Published var errorMessage: String?
    @Published var isSyncing = false
    @Published var emails: [Email] = []
    @Published var mode: Mode = .directIMAP
    @Published var imapConfig: IMAPConfig = .default
    @Published var imapConnected = false
    @Published var showSettings = false // kann später entfernt werden
    @Published var debugLog: [String] = []
    @Published var showLogViewer = false
    
    let client: APIClient
    let imapClient = IMAPClient()
    
    init(client: APIClient = .shared) {
        self.client = client
    // Fester Account aus Secrets.swift (falls vorhanden)
    #if canImport(Foundation)
    imapConfig = IMAPConfig(host: MailAccountConfig.host,
                port: MailAccountConfig.port,
                useTLS: MailAccountConfig.useTLS,
                username: MailAccountConfig.username,
                password: MailAccountConfig.password)
    #endif
    Task { await attachLogger(); await imapConnectAndLoad() }
    }
    
    convenience init(mock: Bool) {
        self.init()
        if mock {
            self.authState = .authenticated
            self.user = AuthUser(id: "1", email: "demo@example.com")
            self.emails = [
                Email(id: "1", subject: "Demo", from: "a@example.com", to: "you@example.com", date: .now, column: "posteingang", text: "Hallo", html: nil)
            ]
        }
    }
    
    func checkSession() async { /* kein Login mehr notwendig */ }
    
    struct LoginBody: Encodable { let email: String; let password: String }
    func login(email: String, password: String) async { /* entfernt */ }
    
    func logout() async { /* nicht mehr nötig */ }
    
    func loadEmails() async {
        if mode == .directIMAP {
            await imapLoadAll()
            return
        }
        do {
            let emails: [Email] = try await client.get("api/emails")
            withAnimation { self.emails = emails }
        } catch {
            if let urlErr = error as? URLError, urlErr.code == .cannotFindHost {
                errorMessage = "Server nicht gefunden (localhost/127.0.0.1). Starte Backend oder passe Host an."
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
    
    func syncEmails() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        if mode == .directIMAP {
            await imapLoadAll()
        } else {
            struct Empty: Codable {}
            do {
                let _: SyncResponse = try await client.post("api/emails/sync", body: Empty())
                await loadEmails()
            } catch { errorMessage = error.localizedDescription }
        }
    }
    
    func moveEmail(_ email: Email, to newColumn: String) async {
        if mode == .directIMAP {
            await imapMove(email: email, to: newColumn)
            return
        }
        struct MoveBody: Codable { let column: String }
        do {
            let _: APIMessage = try await client.put("api/emails/\(email.id)/column", body: MoveBody(column: newColumn))
            if let idx = emails.firstIndex(where: { $0.id == email.id }) {
                emails[idx].column = newColumn
            }
        } catch { errorMessage = error.localizedDescription }
    }
    
    func archiveEmail(_ email: Email) async {
        if mode == .directIMAP {
            // Einfach löschen: move zu Trash oder Flag delete (vereinfachte Variante)
            emails.removeAll { $0.id == email.id }
            return
        }
        struct Empty: Codable {}
        do {
            let _: APIMessage = try await client.put("api/emails/\(email.id)/archive", body: Empty())
            emails.removeAll { $0.id == email.id }
        } catch { errorMessage = error.localizedDescription }
    }
    
    // Helper
    func emails(in column: String) -> [Email] { emails.filter { $0.column == column }.sorted { $0.date > $1.date } }

    // MARK: - IMAP Direct Mode
    func switchToIMAP() { }
    
    func imapConnectAndLoad() async {
        guard !imapConnected else { await imapLoadAll(); return }
        do {
            debug("Starte IMAP Verbindung...")
            try await imapClient.connect(imapConfig)
            try await imapClient.login()
            try await imapClient.ensureKanbanFolders()
            imapConnected = true
            await imapLoadAll()
        } catch {
            errorMessage = error.localizedDescription
            debug("Fehler: \(error.localizedDescription)")
        }
    }
    
    private func imapLoadAll() async {
        guard mode == .directIMAP else { return }
        do {
            debug("Lade Ordner INBOX ...")
            let inbox = try await imapClient.fetchFolder("INBOX")
            debug("INBOX: \(inbox.count) Mails")
            debug("Lade Ordner In_Bearbeitung ...")
            let inBearb = try await imapClient.fetchFolder("In_Bearbeitung")
            debug("In_Bearbeitung: \(inBearb.count) Mails")
            debug("Lade Ordner Warte_auf_Antwort ...")
            let warte = try await imapClient.fetchFolder("Warte_auf_Antwort")
            debug("Warte_auf_Antwort: \(warte.count) Mails")
            let mapped: [Email] = inbox.map { mapFetched($0, column: "posteingang") } +
                inBearb.map { mapFetched($0, column: "in-bearbeitung") } +
                warte.map { mapFetched($0, column: "warte-auf-antwort") }
            withAnimation { self.emails = mapped }
            debug("Gesamt gemappt: \(mapped.count) Mails")
        } catch {
            errorMessage = error.localizedDescription
            debug("imapLoadAll Fehler: \(error.localizedDescription)")
        }
    }
    
    private func mapFetched(_ f: IMAPClient.FetchedEmail, column: String) -> Email {
        Email(id: "imap-\(f.uid)-\(column)", subject: f.subject, from: f.from, to: f.to, date: f.date, column: column, text: f.snippet, html: nil)
    }
    
    private func imapMove(email: Email, to newColumn: String) async {
        // Extract uid from id (imap-<uid>-<column>)
        guard let uidPart = email.id.split(separator: "-").dropFirst().first else { return }
        let uid = String(uidPart)
        let sourceFolder: String = {
            switch email.column {
            case "posteingang": return "INBOX"
            case "in-bearbeitung": return "In_Bearbeitung"
            case "warte-auf-antwort": return "Warte_auf_Antwort"
            default: return "INBOX"
            }
        }()
        let destFolder: String = {
            switch newColumn {
            case "posteingang": return "INBOX"
            case "in-bearbeitung": return "In_Bearbeitung"
            case "warte-auf-antwort": return "Warte_auf_Antwort"
            default: return "INBOX"
            }
        }()
        do {
            try await imapClient.move(uid: uid, from: sourceFolder, to: destFolder)
            if let idx = emails.firstIndex(where: { $0.id == email.id }) { emails[idx].column = newColumn }
        } catch { errorMessage = error.localizedDescription }
    }
}

// MARK: - Persistence
extension AppViewModel {
    private var defaults: UserDefaults { .standard }
    // Persistenz entfällt bei festem Account
    private func attachLogger() async {
        await imapClient.setLogger { [weak self] line in
            Task { @MainActor in self?.debug(line) }
        }
    }
    private func debug(_ line: String) {
        debugLog.append(line)
        if debugLog.count > 500 { debugLog.removeFirst(debugLog.count - 500) }
    }
}
