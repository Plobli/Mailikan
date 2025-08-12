class EmailKanban {
    constructor() {
        this.emails = [];
        this.isLiveMode = true; // Live-Modus aktiviert
        this.autoRefreshInterval = null;
        this.autoRefreshTime = 30000; // 30 Sekunden
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadEmailsLive(); // Live-Modus verwenden
        this.setupDragAndDrop();
        this.setupDropdownHandlers();
        this.setupAutoRefresh();
        
        // Make instance globally available for dropdown callbacks
        window.kanban = this;
        
        console.log('EmailKanban initialized in Live Mode');
    }

    bindEvents() {
        // Sync button - jetzt Live-Sync
        document.getElementById('sync-btn').addEventListener('click', () => {
            this.syncEmailsLive(true); // Force refresh
        });

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Modal close
        document.querySelector('.close').addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('email-modal');
            if (event.target === modal) {
                this.closeModal();
            }
        });
    }

    // === LIVE EMAIL METHODS ===

    async loadEmailsLive() {
        try {
            this.showLoading(true);
            console.log('Loading emails in live mode...');
            
            const startTime = Date.now();
            const response = await fetch('/api/emails/live');
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.emails = result.emails;
                this.renderEmails();
                
                const duration = Date.now() - startTime;
                console.log(`Live emails loaded: ${this.emails.length} emails in ${duration}ms`);
                
                // Update status
                this.updateStatus(`${this.emails.length} E-Mails geladen (Live-Modus)`, 'success');
            } else {
                throw new Error(result.error || 'Fehler beim Laden der E-Mails');
            }
        } catch (error) {
            console.error('Live email loading error:', error);
            this.showMessage('Fehler beim Laden der E-Mails: ' + error.message, 'error');
            
            // Fallback zu normalem Modus
            await this.loadEmailsFallback();
        } finally {
            this.showLoading(false);
        }
    }

    async syncEmailsLive(forceRefresh = false) {
        try {
            this.showLoading(true);
            console.log(`Live sync started (force: ${forceRefresh})`);
            
            const url = forceRefresh ? '/api/emails/live?refresh=true' : '/api/emails/live';
            const response = await fetch(url);
            const result = await response.json();
            
            if (response.ok && result.success) {
                const previousCount = this.emails.length;
                this.emails = result.emails;
                this.renderEmails();
                
                const newCount = this.emails.length;
                const message = forceRefresh 
                    ? `Live-Sync abgeschlossen: ${newCount} E-Mails`
                    : `E-Mails aktualisiert: ${newCount} E-Mails`;
                
                this.showMessage(message, 'success');
                console.log(`Live sync completed: ${previousCount} -> ${newCount} emails`);
            } else {
                throw new Error(result.error || 'Synchronisation fehlgeschlagen');
            }
        } catch (error) {
            console.error('Live sync error:', error);
            this.showMessage('Fehler bei der Live-Synchronisation: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadEmailsFallback() {
        try {
            console.log('Loading emails in fallback mode...');
            const response = await fetch('/api/emails');
            this.emails = await response.json();
            this.renderEmails();
            this.updateStatus('E-Mails geladen (Fallback-Modus)', 'warning');
        } catch (error) {
            console.error('Fallback loading failed:', error);
            this.showMessage('Kritischer Fehler beim Laden der E-Mails', 'error');
        }
    }

    setupAutoRefresh() {
        // Auto-Refresh für Live-Modus
        if (this.isLiveMode) {
            this.autoRefreshInterval = setInterval(() => {
                console.log('Auto-refresh triggered...');
                this.syncEmailsLive(false); // Sanfter Refresh ohne Force
            }, this.autoRefreshTime);
            
            console.log(`Auto-refresh setup: every ${this.autoRefreshTime / 1000} seconds`);
        }
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            console.log('Auto-refresh stopped');
        }
    }

    async loadEmails() {
        // Fallback-Methode (Legacy)
        return this.loadEmailsLive();
    }

    async syncEmails() {
        // Fallback-Methode (Legacy)
        return this.syncEmailsLive(true);
    }

    renderEmails() {
        const columns = ['posteingang', 'in-bearbeitung', 'warte-auf-antwort'];
        
        columns.forEach(column => {
            const columnEmails = this.emails.filter(email => email.column === column);
            const listElement = document.getElementById(`${column}-list`);
            const countElement = document.getElementById(`${column}-count`);
            
            listElement.innerHTML = '';
            countElement.textContent = columnEmails.length;
            
            columnEmails.forEach(email => {
                const emailCard = this.createEmailCard(email);
                listElement.appendChild(emailCard);
            });
        });
    }

    createEmailCard(email) {
        const card = document.createElement('div');
        card.className = 'email-card';
        card.draggable = true;
        card.dataset.emailId = email.id;
        
        const date = new Date(email.date);
        const formattedDate = date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Create preview text from email content
        const preview = this.createPreview(email.text || email.html);
        
        card.innerHTML = `
            <div class="email-header">
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
            </div>
            <div class="email-from">${this.escapeHtml(email.from)}</div>
            <div class="email-date">${formattedDate}</div>
            ${preview ? `<div class="email-preview">${this.escapeHtml(preview)}</div>` : ''}
            <div class="email-actions">
                <button class="action-btn" onclick="event.stopPropagation(); window.kanban.moveEmailFromDropdown('${email.id}', 'in-bearbeitung')">In Bearbeitung</button>
                <button class="action-btn" onclick="event.stopPropagation(); window.kanban.moveEmailFromDropdown('${email.id}', 'warte-auf-antwort')">Warte auf Antwort</button>
                <button class="action-btn archive" onclick="event.stopPropagation(); window.kanban.archiveEmailFromDropdown('${email.id}')">Archivieren</button>
            </div>
        `;
        
        // Add click event to show email details
        card.addEventListener('click', () => {
            this.showEmailModal(email);
        });
        
        return card;
    }

    createPreview(content) {
        if (!content) return '';
        
        // Remove HTML tags and get first 150 characters
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        return textContent.length > 150 ? textContent.substring(0, 150) + '...' : textContent;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showEmailModal(email) {
        const modal = document.getElementById('email-modal');
        const date = new Date(email.date);
        const formattedDate = date.toLocaleDateString('de-DE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        document.getElementById('modal-subject').textContent = email.subject;
        document.getElementById('modal-from').textContent = email.from;
        document.getElementById('modal-to').textContent = email.to;
        document.getElementById('modal-date').textContent = formattedDate;
        
        const contentElement = document.getElementById('modal-content');
        if (email.html) {
            contentElement.innerHTML = email.html;
        } else {
            contentElement.innerHTML = `<pre>${this.escapeHtml(email.text)}</pre>`;
        }
        
        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('email-modal').style.display = 'none';
    }

    setupDragAndDrop() {
        // Add drag event listeners to all email cards
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('email-card')) {
                e.target.classList.add('dragging');
                e.dataTransfer.setData('text/plain', e.target.dataset.emailId);
            }
        });

        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('email-card')) {
                e.target.classList.remove('dragging');
            }
        });

        // Add drop zone event listeners
        const emailLists = document.querySelectorAll('.email-list');
        emailLists.forEach(list => {
            list.addEventListener('dragover', (e) => {
                e.preventDefault();
                list.classList.add('drag-over');
            });

            list.addEventListener('dragleave', (e) => {
                if (!list.contains(e.relatedTarget)) {
                    list.classList.remove('drag-over');
                }
            });

            list.addEventListener('drop', async (e) => {
                e.preventDefault();
                list.classList.remove('drag-over');
                
                const emailId = e.dataTransfer.getData('text/plain');
                const newColumn = list.dataset.column;
                
                await this.moveEmail(emailId, newColumn);
            });
        });
    }

    async moveEmail(emailId, newColumn) {
        try {
            // Finde die E-Mail für Live-Move-Daten
            const email = this.emails.find(e => e.id === emailId);
            if (!email) {
                throw new Error('E-Mail nicht gefunden');
            }
            
            console.log(`Moving email ${emailId} from ${email.column} to ${newColumn} (Live Mode)`);
            
            // Live-Move-API verwenden
            const response = await fetch('/api/emails/live/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    uid: email.uid,
                    fromColumn: email.column,
                    toColumn: newColumn,
                    subject: email.subject,
                    from: email.from
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                console.log(`Live move successful: ${emailId} -> ${newColumn}`);
                
                // Sofort lokale Aktualisierung (optimistisch)
                email.column = newColumn;
                this.renderEmails();
                
                this.showMessage(`E-Mail verschoben: ${newColumn}`, 'success');
                
                // Nach kurzer Verzögerung Live-Sync für Konsistenz
                setTimeout(() => {
                    this.syncEmailsLive(false);
                }, 1000);
            } else {
                throw new Error(result.error || 'Move-Operation fehlgeschlagen');
            }
        } catch (error) {
            console.error('Live move error:', error);
            this.showMessage('Fehler beim Verschieben der E-Mail: ' + error.message, 'error');
            
            // Bei Fehler: Live-Reload für Konsistenz
            await this.syncEmailsLive(true);
        }
    }

    async archiveEmail(emailId) {
        try {
            const response = await fetch(`/api/emails/${emailId}/archive`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Remove email from local data
                this.emails = this.emails.filter(e => e.id !== emailId);
                this.renderEmails();
                this.showMessage('E-Mail erfolgreich archiviert', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            this.showMessage('Fehler beim Archivieren der E-Mail: ' + error.message, 'error');
        }
    }

    showLoading(show) {
        const loadingElement = document.getElementById('loading');
        loadingElement.style.display = show ? 'flex' : 'none';
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;
        document.body.appendChild(messageElement);

        // Auto-remove message after 5 seconds
        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }

    setupDropdownHandlers() {
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.email-dropdown')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }

    async moveEmailFromDropdown(emailId, newColumn) {
        // Close dropdown
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
        
        await this.moveEmail(emailId, newColumn);
    }

    async archiveEmailFromDropdown(emailId) {
        // Close dropdown
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
        
        await this.archiveEmail(emailId);
    }

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                window.location.href = '/login';
            } else {
                this.showMessage('Fehler beim Abmelden', 'error');
            }
        } catch (error) {
            this.showMessage('Fehler beim Abmelden: ' + error.message, 'error');
        }
    }

    // === UTILITY METHODS ===

    updateStatus(message, type = 'info') {
        // Status-Update im UI anzeigen
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Hier könnte ein Status-Banner im UI aktualisiert werden
        // Beispiel: this.showTemporaryStatus(message, type);
    }

    async testLiveConnection() {
        try {
            const response = await fetch('/api/emails/test/connection');
            const result = await response.json();
            
            if (result.success) {
                this.updateStatus('Live-Verbindung erfolgreich', 'success');
                return true;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.updateStatus(`Live-Verbindung fehlgeschlagen: ${error.message}`, 'error');
            return false;
        }
    }

    async getCacheStatus() {
        try {
            const response = await fetch('/api/emails/cache/status');
            const result = await response.json();
            
            if (result.success) {
                console.log('Cache Status:', result.cache);
                console.log('Connection Status:', result.connections);
                return result;
            }
        } catch (error) {
            console.error('Cache status error:', error);
        }
        return null;
    }

    async clearCache() {
        try {
            const response = await fetch('/api/emails/cache/clear', {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
                this.showMessage('Cache geleert', 'success');
                await this.syncEmailsLive(true); // Force refresh nach Cache-Clear
            }
        } catch (error) {
            this.showMessage('Fehler beim Leeren des Cache: ' + error.message, 'error');
        }
    }

    // Cleanup beim Verlassen der Seite
    destroy() {
        this.stopAutoRefresh();
        console.log('EmailKanban destroyed');
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const kanban = new EmailKanban();
    
    // Clean up auto-sync when the page is being unloaded
    window.addEventListener('beforeunload', () => {
        kanban.destroy();
    });
});
