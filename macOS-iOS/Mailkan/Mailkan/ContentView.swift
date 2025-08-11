//
//  ContentView.swift
//  Mailkan
//
//  Created by Christopher on 11.08.25.
//

import SwiftUI
#if os(macOS)
import AppKit
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif
#else
import UIKit
#endif

struct RootView: View {
    @EnvironmentObject var appVM: AppViewModel
    var body: some View { KanbanBoardView() }
}

#Preview { RootView().environmentObject(AppViewModel(mock: true)) }

// IMAPSettingsView entfernt – fester Account wird automatisch verbunden
