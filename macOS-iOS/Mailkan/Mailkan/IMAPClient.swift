import Foundation
import Network
import Darwin

// MARK: - IMAP Data Structures
struct IMAPConfig: Codable, Sendable, Equatable {
    var host: String
    var port: UInt16
    var useTLS: Bool
    var username: String
    var password: String
    
    static let `default` = IMAPConfig(host: "imap.example.com", port: 993, useTLS: true, username: "", password: "")
}

// MARK: - Minimal IMAP Client (Simplified)
// NOTE: Limited subset of IMAP for demo purposes only.
actor IMAPClient {
    enum IMAPError: Error, LocalizedError { case connectionFailed, server(String), parse, disconnected
        var errorDescription: String? {
            switch self {
            case .connectionFailed: return "Verbindung fehlgeschlagen"
            case .server(let m): return m
            case .parse: return "Antwort konnte nicht geparst werden"
            case .disconnected: return "Verbindung getrennt"
            }
        }
    }
    
    private var connection: NWConnection?
    private var tagCounter: Int = 1
    private var buffer = Data()
    private(set) var config: IMAPConfig?
    private var logger: ((String) -> Void)?
    // Fortsetzungs-Referenz um mehrfache resume() Aufrufe zu verhindern
    private var connectContinuation: CheckedContinuation<Void, Error>?

    func setLogger(_ log: @escaping (String)->Void) { self.logger = log }
    
    private func nextTag() -> String { let t = String(format: "A%04d", tagCounter); tagCounter += 1; return t }
    private var capabilities: String = ""
    
    func connect(_ config: IMAPConfig) async throws {
        self.config = config
        let params = config.useTLS ? NWParameters.tls : NWParameters.tcp
        let host = NWEndpoint.Host(config.host)
        let port = NWEndpoint.Port(rawValue: config.port)!
        let conn = NWConnection(host: host, port: port, using: params)
        connection = conn
        logger?("Verbinde zu \(config.host):\(config.port) TLS=\(config.useTLS)")
        receiveLoop() // früh starten, damit wir Greeting puffern
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            self.connectContinuation = cont
            conn.stateUpdateHandler = { [weak self] state in
                Task { await self?.handleStateUpdate(state) }
            }
            conn.start(queue: .global())
        }
        // Warte auf Server-Gruß (OK)
        let start = Date()
        while Date().timeIntervalSince(start) < 5 {
            if let text = String(data: buffer, encoding: .utf8), text.contains("* OK") { logger?("Greeting erhalten"); break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        if let text = String(data: buffer, encoding: .utf8) {
            // Extrahiere CAPABILITY Zeile
            if let capLine = text.split(separator: "\n").first(where: { $0.contains("CAPABILITY") }) {
                capabilities = String(capLine)
                logger?("Capabilities: \(capabilities)")
            }
        } else {
            logger?("Kein Server-Gruß empfangen – evtl. TLS Handshake oder Firewall Problem")
        }
    }

    private func handleStateUpdate(_ state: NWConnection.State) {
        logger?("State: \(state)")
        switch state {
        case .ready:
            connectContinuation?.resume()
            connectContinuation = nil
        case .failed(let err):
            if let nwe = err as? NWError { logger?("NWError Detail: \(describe(nwError: nwe))") }
            connectContinuation?.resume(throwing: err)
            connectContinuation = nil
        case .cancelled:
            connectContinuation?.resume(throwing: IMAPError.connectionFailed)
            connectContinuation = nil
        default:
            break
        }
    }

    private func describe(nwError: NWError) -> String {
        switch nwError {
        case .posix(let code):
            if let cstr = strerror(code.rawValue) { return "POSIX(\(code.rawValue)) \(String(cString: cstr))" }
            return "POSIX(\(code.rawValue))"
        case .dns(let code):
            return "DNS(code=\(code))"
        case .tls(let code):
            return "TLS(code=\(code))"
        @unknown default:
            return "Unbekannter NWError"
        }
    }
    
    private func receiveLoop() {
        let log = self.logger
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            log?("recv \(data?.count ?? 0) bytes")
            Task { await self.handleReceive(data: data, isComplete: isComplete, error: error) }
        }
    }

    private func handleReceive(data: Data?, isComplete: Bool, error: (any Error)?) async {
        if let data = data { buffer.append(data) }
        if isComplete || error != nil { return }
        receiveLoop()
    }
    
    private func readResponse(for tag: String, timeout: TimeInterval = 10) async throws -> String {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if let text = String(data: buffer, encoding: .utf8), text.contains("\r\n\(tag) ") {
                return text
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        throw IMAPError.server("Timeout für Antwort auf \(tag)")
    }
    
    private func send(_ command: String) throws {
        guard let conn = connection else { throw IMAPError.disconnected }
        logger?("Sende: \(command.trimmingCharacters(in: .whitespacesAndNewlines))")
        conn.send(content: Data(command.utf8), completion: .contentProcessed { _ in })
    }
    
    func login() async throws {
        guard let config else { throw IMAPError.connectionFailed }
        let user = sanitize(config.username)
        let pass = sanitize(config.password)
        if pass != config.password { logger?("Passwort enthielt ungültige Zeichen (\r/\n) – bereinigt") }
        // Wenn Server AUTH=PLAIN unterstützt, gleich PLAIN probieren (robuster gegen Sonderzeichen)
        if capabilities.uppercased().contains("AUTH=PLAIN") {
            logger?("Versuche zuerst AUTHENTICATE PLAIN")
            do {
                try await authenticatePlain(username: user, password: pass)
                return
            } catch {
                logger?("AUTH PLAIN primär fehlgeschlagen: \(error.localizedDescription); versuche LOGIN")
            }
        }
        let tag = nextTag()
        try send("\(tag) LOGIN \"\(escape(user))\" \"\(escape(pass))\"\r\n")
        logger?("LOGIN als \(user)")
        let resp = try await readResponse(for: tag)
        logger?("LOGIN Antwort: \n\(resp)")
        if resp.contains("\(tag) OK") { return }
        if resp.contains("AUTHENTICATIONFAILED") || resp.contains(" NO ") {
            logger?("LOGIN fehlgeschlagen – versuche AUTHENTICATE PLAIN")
            try await authenticatePlain(username: user, password: pass)
            return
        }
        throw IMAPError.server(parseAuthError(resp) ?? "Login fehlgeschlagen")
    }

    private func authenticateLogin(username: String, password: String) async throws {
        let tag = nextTag()
        try send("\(tag) AUTHENTICATE LOGIN\r\n")
        // Warte auf Username Prompt (base64("Username:") = VXNlcm5hbWU6 oder manche Server senden einfach '+')
        try await waitForLoginPrompt(matches: ["VXNlcm5hbWU6"]) // Username:
        try send(Data(username.utf8).base64EncodedString() + "\r\n")
        // Warte auf Passwort Prompt
        try await waitForLoginPrompt(matches: ["UGFzc3dvcmQ6"]) // Password:
        try send(Data(password.utf8).base64EncodedString() + "\r\n")
        let resp = try await readResponse(for: tag)
        logger?("AUTH LOGIN Antwort: \n\(resp)")
        guard resp.contains("\(tag) OK") else { throw IMAPError.server(parseAuthError(resp) ?? "AUTHENTICATE LOGIN fehlgeschlagen") }
    }

    private func waitForLoginPrompt(matches: [String], timeout: TimeInterval = 10) async throws {
        let start = Date()
        while Date().timeIntervalSince(start) < timeout {
            if let text = String(data: buffer, encoding: .utf8) {
                for m in matches { if text.contains(m) { return } }
                if text.split(separator: "\n").contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines) == "+" }) { return }
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        throw IMAPError.server("Timeout AUTH LOGIN Prompt")
    }

    private func authenticatePlain(username: String, password: String) async throws {
        let tag = nextTag()
        try send("\(tag) AUTHENTICATE PLAIN\r\n")
        // Warte auf '+' Prompt
        let start = Date()
        while Date().timeIntervalSince(start) < 5 {
            if let text = String(data: buffer, encoding: .utf8), text.contains("+ ") || text.split(separator: "\n").contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines) == "+" }) {
                break
            }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        let authString = "\0\(username)\0\(password)"
        let b64 = Data(authString.utf8).base64EncodedString()
        try send("\(b64)\r\n")
        let resp = try await readResponse(for: tag)
        logger?("AUTH PLAIN Antwort: \n\(resp)")
        guard resp.contains("\(tag) OK") else { throw IMAPError.server(parseAuthError(resp) ?? "AUTHENTICATE PLAIN fehlgeschlagen") }
    }

    private func parseAuthError(_ resp: String) -> String? {
        // Versuche NO-Zeile zu extrahieren
        if let line = resp.split(separator: "\n").first(where: { $0.contains(" NO ") }) {
            return String(line).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }
    
    private func escape(_ s: String) -> String { s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") }
    private func sanitize(_ s: String) -> String { s.replacingOccurrences(of: "\r", with: " ").replacingOccurrences(of: "\n", with: " ") }
    
    func ensureKanbanFolders() async throws {
        try await createFolderIfMissing("In_Bearbeitung")
        try await createFolderIfMissing("Warte_auf_Antwort")
    }
    
    private func createFolderIfMissing(_ name: String) async throws {
        let tag = nextTag()
        try send("\(tag) CREATE \(name)\r\n")
        _ = try? await readResponse(for: tag) // ignore errors (already exists)
    }
    
    struct FetchedEmail: Sendable {
        let uid: String
        let subject: String
        let from: String
        let to: String
        let date: Date
        let snippet: String
    }
    
    func fetchFolder(_ folder: String, limit: Int = 50) async throws -> [FetchedEmail] {
        var tag = nextTag()
        try send("\(tag) SELECT \(folder)\r\n")
        _ = try await readResponse(for: tag)
        tag = nextTag()
        try send("\(tag) SEARCH ALL\r\n")
        let searchResp = try await readResponse(for: tag)
        guard let line = searchResp.split(separator: "\n").first(where: { $0.contains("* SEARCH") }), let range = line.range(of: "* SEARCH") else { return [] }
        let nums = line[range.upperBound...].split(separator: " ").compactMap { Int($0) }
        logger?("Ordner \(folder): SEARCH ergab \(nums.count) Nachrichten")
        let selected = nums.suffix(limit)
        var result: [FetchedEmail] = []
        for num in selected {
            tag = nextTag()
            try send("\(tag) FETCH \(num) (UID BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)] BODY.PEEK[TEXT]<0.2048>)\r\n")
            let resp = try await readResponse(for: tag)
            logger?("FETCH #\(num) Länge: \(resp.count) Zeichen")
            if let email = parseFetch(resp) { result.append(email) }
            else { logger?("Parse fehlgeschlagen für Nachricht #\(num)") }
        }
        return result
    }
    
    private func parseFetch(_ response: String) -> FetchedEmail? {
        guard let uidMatch = response.range(of: #"UID ([0-9]+)"#, options: .regularExpression),
              let digits = response[uidMatch].split(separator: " ").last else { return nil }
        let uid = String(digits)
        // Header Block isolieren
        let headerBlock: String = {
            if let doubleCRLF = response.range(of: "\r\n\r\n") {
                let headerPart = response[..<doubleCRLF.lowerBound]
                return String(headerPart)
            }
            return response
        }()
        // Faltete Header zusammenführen (Zeilen die mit Space oder Tab beginnen anhängen)
        var unfolded: [String] = []
        var current = ""
        for rawLine in headerBlock.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = rawLine.trimmingCharacters(in: .init(charactersIn: "\r"))
            if line.hasPrefix(" ") || line.hasPrefix("\t") {
                current += line.trimmingCharacters(in: .whitespaces)
            } else {
                if !current.isEmpty { unfolded.append(current) }
                current = String(line)
            }
        }
        if !current.isEmpty { unfolded.append(current) }
        func header(_ name: String) -> String {
            if let line = unfolded.first(where: { $0.lowercased().hasPrefix(name.lowercased() + ":") }) {
                return line.dropFirst(name.count + 1).trimmingCharacters(in: .whitespaces)
            }
            return ""
        }
        let subject = header("Subject")
        let from = header("From")
        let to = header("To")
        let date = parseDate(header("Date")) ?? Date()
        let snippet: String = {
            if let range = response.range(of: "\r\n\r\n") {
                let body = response[range.upperBound...]
                let clean = body.replacingOccurrences(of: "\r", with: "")
                return String(clean.prefix(200))
            }
            return ""
        }()
        return FetchedEmail(uid: uid, subject: subject, from: from, to: to, date: date, snippet: snippet)
    }
    
    private func parseDate(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEE, d MMM yyyy HH:mm:ss Z"
        return f.string(from: Date()) == s ? Date() : f.date(from: s)
    }
    
    func move(uid: String, from source: String, to dest: String) async throws {
        var tag = nextTag()
        try send("\(tag) UID MOVE \(uid) \(dest)\r\n")
        let resp = try await readResponse(for: tag)
        if resp.contains("OK") { return }
        // Fallback
        tag = nextTag(); try send("\(tag) SELECT \(source)\r\n"); _ = try await readResponse(for: tag)
        tag = nextTag(); try send("\(tag) UID COPY \(uid) \(dest)\r\n"); _ = try await readResponse(for: tag)
        tag = nextTag(); try send("\(tag) UID STORE \(uid) +FLAGS (\\Deleted)\r\n"); _ = try await readResponse(for: tag)
        tag = nextTag(); try send("\(tag) EXPUNGE\r\n"); _ = try await readResponse(for: tag)
    }
}
