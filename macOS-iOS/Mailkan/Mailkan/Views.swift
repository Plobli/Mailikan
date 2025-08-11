import SwiftUI
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

// Login entfallen

struct KanbanBoardView: View {
    @EnvironmentObject var appVM: AppViewModel
    @State private var selectedEmail: Email?
    @State private var showDetail = false
    @State private var dragItem: Email?
    
    let columns = ["posteingang", "in-bearbeitung", "warte-auf-antwort"]
    let columnTitles: [String: String] = [
        "posteingang": "Posteingang",
        "in-bearbeitung": "In Bearbeitung",
        "warte-auf-antwort": "Warte auf Antwort"
    ]
    
    var body: some View {
        NavigationStack {
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 24) {
                        ForEach(columns, id: \.self) { col in
                        KanbanColumnView(column: col,
                                         title: columnTitles[col] ?? col,
                                         emails: appVM.emails(in: col),
                                         onSelect: { email in
                            selectedEmail = email; showDetail = true
                        }, onMove: { email, target in
                            Task { await appVM.moveEmail(email, to: target) }
                        }, onArchive: { email in
                            Task { await appVM.archiveEmail(email) }
                        })
                        .frame(width: 320)
                    }
                }
                .padding()
            }
            .navigationTitle("Mailikan")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    if appVM.isSyncing { ProgressView() }
                    Button("Sync") { Task { await appVM.syncEmails() } }
                    Button("Log") { appVM.showLogViewer = true }
                    // Einstellungen/Modus entfallen bei festem Account
            // Logout entfällt
                }
            }
            // Keine Settings Sheet
        .task { await appVM.loadEmails() }
            .sheet(isPresented: $appVM.showLogViewer) {
                NavigationStack {
                    ScrollView {
                        LazyVStack(alignment: .leading) {
                            ForEach(Array(appVM.debugLog.enumerated()), id: \.offset) { _, line in
                                Text(line).font(.system(size: 11, design: .monospaced)).frame(maxWidth: .infinity, alignment: .leading)
                                Divider()
                            }
                        }.padding(8)
                    }
                    .navigationTitle("Debug Log")
                    .toolbar { ToolbarItem(placement: .primaryAction) { Button("Schließen") { appVM.showLogViewer = false } } }
                }.frame(minWidth: 600, minHeight: 400)
            }
            .sheet(isPresented: $showDetail) {
                if let email = selectedEmail { EmailDetailView(email: email) }
            }
            .overlay(alignment: .top) {
                if let error = appVM.errorMessage { Banner(message: error, color: .red) }
            }
        }
    }
}

struct KanbanColumnView: View {
    let column: String
    let title: String
    let emails: [Email]
    let onSelect: (Email) -> Void
    let onMove: (Email, String) -> Void
    let onArchive: (Email) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.headline).foregroundStyle(.white)
                Spacer()
                Text("\(emails.count)")
                    .padding(6)
                    .background(.white)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(red: 6/255, green: 20/255, blue: 39/255))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(emails) { email in
                        EmailCardView(email: email, onSelect: onSelect, onMove: onMove, onArchive: onArchive)
                            .contextMenu {
                                Button("In Bearbeitung") { onMove(email, "in-bearbeitung") }
                                Button("Warte auf Antwort") { onMove(email, "warte-auf-antwort") }
                                Divider()
                                Button(role: .destructive) { onArchive(email) } label: { Text("Archivieren") }
                            }
                    }
                }
                .padding(12)
            }
            .background(Color(white: 0.95).opacity(0.0001))
            .clipShape(RoundedRectangle(cornerRadius: 0))
        }
        .padding(.vertical, 8)
        .background(Color(red: 59/255, green: 83/255, blue: 111/255))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(radius: 5, y: 3)
        .onDrop(of: [ ( { () -> String in
            #if canImport(UniformTypeIdentifiers)
            return UTType.text.identifier
            #else
            return "public.text"
            #endif
        }() ) ], isTargeted: nil) { providers in
            for provider in providers {
                _ = provider.loadObject(ofClass: NSString.self) { obj, _ in
                    guard let ns = obj as? NSString else { return }
                    let id = ns as String
                    DispatchQueue.main.async {
                        if let email = emails.first(where: { $0.id == id }) {
                            if email.column != column { onMove(email, column) }
                        }
                    }
                }
            }
            return true
        }
    }
}

struct EmailCardView: View {
    let email: Email
    let onSelect: (Email) -> Void
    let onMove: (Email, String) -> Void
    let onArchive: (Email) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(email.subject).font(.subheadline.bold()).lineLimit(2)
            Text(email.from).font(.caption).foregroundStyle(.secondary)
            Text(formatDate(email.date)).font(.caption2).foregroundStyle(.secondary)
            if let preview = previewText(email) {
                Text(preview).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            }
            HStack(spacing: 6) {
                Button("In Bearbeitung") { onMove(email, "in-bearbeitung") }.buttonStyle(.borderedProminent)
                Button("Warte") { onMove(email, "warte-auf-antwort") }.buttonStyle(.bordered)
                Button(role: .destructive) { onArchive(email) } label: { Image(systemName: "archivebox") }
                    .buttonStyle(.borderless)
            }
            .font(.caption2)
            .labelStyle(.iconOnly)
        }
        .padding(12)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
        .onTapGesture { onSelect(email) }
    .onDrag { NSItemProvider(object: NSString(string: email.id)) }
    }
    
    private func previewText(_ email: Email) -> String? {
        let raw = email.text ?? email.html ?? ""
        guard !raw.isEmpty else { return nil }
        let stripped = raw.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        return stripped.count > 150 ? String(stripped.prefix(150)) + "…" : stripped
    }
    
    private func formatDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "dd.MM.yyyy HH:mm"
        return f.string(from: date)
    }
}

struct EmailDetailView: View {
    let email: Email
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(email.subject).font(.title2.bold())
                VStack(alignment: .leading, spacing: 4) {
                    Text("Von: \(email.from)")
                    Text("An: \(email.to)")
                    Text(formatLongDate(email.date))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Divider()
                if let html = email.html, !html.isEmpty {
                    if let data = html.data(using: .utf8) {
                        if let ns = try? NSAttributedString(
                            data: data,
                            options: [.documentType: NSAttributedString.DocumentType.html,
                                      .characterEncoding: String.Encoding.utf8.rawValue],
                            documentAttributes: nil) {
                            Text(AttributedString(ns))
                        } else if let text = email.text { Text(text) }
                    } else if let text = email.text { Text(text) }
                } else if let text = email.text { Text(text) }
            }
            .padding()
        }
        .frame(minWidth: 400, minHeight: 400)
    }
    private func formatLongDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "EEEE, d. MMMM yyyy HH:mm"
        return f.string(from: date)
    }
}

struct Banner: View {
    let message: String
    var color: Color = .accentColor
    @State private var visible = true
    var body: some View {
        if visible {
            Text(message)
                .font(.footnote)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(color.gradient)
                .clipShape(Capsule())
                .foregroundStyle(.white)
                .padding(8)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 5) { withAnimation { visible = false } } }
        }
    }
}

#Preview {
    KanbanBoardView()
        .environmentObject(AppViewModel(mock: true))
}
