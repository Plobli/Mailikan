import Foundation

actor APIClient {
    static let shared = APIClient()
    private init() {}
    
    private var baseURLs: [URL] = [
        URL(string: "http://100.100.1.11:3000")!, // bevorzugte externe/Netzwerk IP
        URL(string: "http://localhost:3000")!,
        URL(string: "http://127.0.0.1:3000")!
    ]
    private var currentIndex: Int = 0
    var baseURL: URL { baseURLs[currentIndex] }
    private var session: URLSession { URLSession.shared }
    
    private var jsonDecoder: JSONDecoder {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return dec
    }
    private var jsonEncoder: JSONEncoder {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        return enc
    }
    
    func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T { try await request(path, method: "GET") }
    func post<T: Decodable, B: Encodable>(_ path: String, body: B, as type: T.Type = T.self) async throws -> T { try await request(path, method: "POST", body: body) }
    func put<T: Decodable, B: Encodable>(_ path: String, body: B?, as type: T.Type = T.self) async throws -> T { try await request(path, method: "PUT", body: body) }
    func put<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T { try await request(path, method: "PUT") }

    // Ohne Body
    private func request<T: Decodable>(_ path: String, method: String) async throws -> T {
        var lastError: Error?
        for attempt in 0..<baseURLs.count {
            let url = baseURLs[(currentIndex + attempt) % baseURLs.count].appendingPathComponent(path)
            var request = URLRequest(url: url)
            request.httpMethod = method
            do {
                let (data, response) = try await session.data(for: request)
                try validate(response: response, data: data)
                if attempt > 0 { currentIndex = (currentIndex + attempt) % baseURLs.count }
                if data.isEmpty, let empty = "{}".data(using: .utf8) {
                    return try jsonDecoder.decode(T.self, from: empty)
                }
                return try jsonDecoder.decode(T.self, from: data)
            } catch {
                lastError = error
                continue
            }
        }
        throw lastError ?? URLError(.cannotFindHost)
    }

    // Mit Body
    private func request<T: Decodable, B: Encodable>(_ path: String, method: String, body: B?) async throws -> T {
        var lastError: Error?
        for attempt in 0..<baseURLs.count {
            let url = baseURLs[(currentIndex + attempt) % baseURLs.count].appendingPathComponent(path)
            var request = URLRequest(url: url)
            request.httpMethod = method
            if let body = body {
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try jsonEncoder.encode(body)
            }
            do {
                let (data, response) = try await session.data(for: request)
                try validate(response: response, data: data)
                if attempt > 0 { currentIndex = (currentIndex + attempt) % baseURLs.count }
                if data.isEmpty, let empty = "{}".data(using: .utf8) {
                    return try jsonDecoder.decode(T.self, from: empty)
                }
                return try jsonDecoder.decode(T.self, from: data)
            } catch {
                lastError = error
                continue
            }
        }
        throw lastError ?? URLError(.cannotFindHost)
    }
    
    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard 200..<300 ~= http.statusCode else {
            if let apiError = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = apiError["error"] as? String {
                throw APIError.server(msg)
            }
            throw APIError.status(http.statusCode)
        }
    }
}

enum APIError: LocalizedError {
    case server(String)
    case status(Int)
    case decoding
    
    var errorDescription: String? {
        switch self {
        case .server(let m): return m
        case .status(let c): return "Server-Fehler (Status \(c))"
        case .decoding: return "Antwort konnte nicht gelesen werden"
        }
    }
}
