//
//  MailkanApp.swift
//  Mailkan
//
//  Created by Christopher on 11.08.25.
//

import SwiftUI

@main
struct MailkanApp: App {
    @StateObject private var appVM = AppViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appVM)
        }
    }
}
