import Foundation
import SwiftUI
import Combine

@MainActor
class AppViewModel: ObservableObject {
    enum AuthState { case loading, unauthenticated, authenticated }
    @Published var authState: AuthState = .loading
    @Published var user: AuthUser?
    @Published var errorMessage: String?
    @Published var isSyncing = false
    @Published var emails: [Email] = []
    
    let client: APIClient
    
    init(client: APIClient = .shared) {
        self.client = client
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
    
    func checkSession() async {
        // Es gibt kein explizites Session-Endpoint; wir versuchen Emails zu laden
        do {
            let emails: [Email] = try await client.get("api/emails")
            self.emails = emails
            self.authState = .authenticated
        } catch {
            self.authState = .unauthenticated
            if let urlErr = error as? URLError, urlErr.code == .cannotFindHost {
                self.errorMessage = "Backend nicht erreichbar. Läuft der Server auf Port 3000? (npm start)"
            }
        }
    }
    
    struct LoginBody: Encodable { let email: String; let password: String }
    func login(email: String, password: String) async {
        errorMessage = nil
        do {
            let resp: LoginResponse = try await client.post("api/auth/login", body: LoginBody(email: email, password: password))
            self.user = resp.user
            self.authState = .authenticated
            await loadEmails()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    func logout() async {
        struct Empty: Codable {}
        do {
            let _: APIMessage = try await client.post("api/auth/logout", body: Empty())
        } catch { /* ignore */ }
        user = nil
        emails.removeAll()
        authState = .unauthenticated
    }
    
    func loadEmails() async {
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
        struct Empty: Codable {}
        do {
            let _: SyncResponse = try await client.post("api/emails/sync", body: Empty())
            await loadEmails()
        } catch { errorMessage = error.localizedDescription }
    }
    
    func moveEmail(_ email: Email, to newColumn: String) async {
        struct MoveBody: Codable { let column: String }
        do {
            let _: APIMessage = try await client.put("api/emails/\(email.id)/column", body: MoveBody(column: newColumn))
            if let idx = emails.firstIndex(where: { $0.id == email.id }) {
                emails[idx].column = newColumn
            }
        } catch { errorMessage = error.localizedDescription }
    }
    
    func archiveEmail(_ email: Email) async {
        struct Empty: Codable {}
        do {
            let _: APIMessage = try await client.put("api/emails/\(email.id)/archive", body: Empty())
            emails.removeAll { $0.id == email.id }
        } catch { errorMessage = error.localizedDescription }
    }
    
    // Helper
    func emails(in column: String) -> [Email] { emails.filter { $0.column == column }.sorted { $0.date > $1.date } }
}
