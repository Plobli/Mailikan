//
//  ContentView.swift
//  Mailkan
//
//  Created by Christopher on 11.08.25.
//

import SwiftUI

struct RootView: View {
    @EnvironmentObject var appVM: AppViewModel

    var body: some View {
        Group {
            switch appVM.authState {
            case .loading:
                ProgressView("Lade...")
                    .progressViewStyle(.circular)
            case .unauthenticated:
                LoginView()
            case .authenticated:
                KanbanBoardView()
            }
        }
        .task {
            if appVM.authState == .loading {
                await appVM.checkSession()
            }
        }
    }
}

#Preview {
    RootView()
        .environmentObject(AppViewModel(mock: true))
}
