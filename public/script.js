class EmailKanban {
    constructor() {
        this.emails = [];
        this.autoSyncInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadEmails();
        this.setupDragAndDrop();
        this.startAutoSync();
        this.setupDropdownHandlers();
        
        // Make instance globally available for dropdown callbacks
        window.kanban = this;
    }

    bindEvents() {
        // Sync button
        document.getElementById('sync-btn').addEventListener('click', () => {
            this.syncEmails();
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

    async loadEmails() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/emails');
            this.emails = await response.json();
            this.renderEmails();
            this.updateStats();
        } catch (error) {
            this.showMessage('Fehler beim Laden der E-Mails: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async syncEmails() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/emails/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            if (response.ok) {
                if (result.count > 0) {
                    this.showMessage(`${result.count} neue E-Mails synchronisiert`, 'success');
                }
                // Always reload all emails to ensure consistency
                await this.loadEmails();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showMessage('Fehler bei der Synchronisation: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
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
                <div class="email-dropdown">
                    <button class="dropdown-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">⋯</button>
                    <div class="dropdown-menu">
                        <div class="dropdown-item" onclick="event.stopPropagation(); window.kanban.moveEmailFromDropdown('${email.id}', 'posteingang')">Posteingang</div>
                        <div class="dropdown-item" onclick="event.stopPropagation(); window.kanban.moveEmailFromDropdown('${email.id}', 'in-bearbeitung')">In Bearbeitung</div>
                        <div class="dropdown-item" onclick="event.stopPropagation(); window.kanban.moveEmailFromDropdown('${email.id}', 'warte-auf-antwort')">Warte auf Antwort</div>
                        <div class="dropdown-item archive" onclick="event.stopPropagation(); window.kanban.archiveEmailFromDropdown('${email.id}')">Archivieren</div>
                    </div>
                </div>
            </div>
            <div class="email-from">${this.escapeHtml(email.from)}</div>
            <div class="email-date">${formattedDate}</div>
            ${preview ? `<div class="email-preview">${this.escapeHtml(preview)}</div>` : ''}
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

        // Add archive zone event listeners
        const archiveZone = document.getElementById('archive-zone');
        if (archiveZone) {
            archiveZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                archiveZone.classList.add('drag-over');
            });

            archiveZone.addEventListener('dragleave', (e) => {
                if (!archiveZone.contains(e.relatedTarget)) {
                    archiveZone.classList.remove('drag-over');
                }
            });

            archiveZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                archiveZone.classList.remove('drag-over');
                
                const emailId = e.dataTransfer.getData('text/plain');
                await this.archiveEmail(emailId);
            });
        }
    }

    async moveEmail(emailId, newColumn) {
        try {
            const response = await fetch(`/api/emails/${emailId}/column`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ column: newColumn })
            });

            if (response.ok) {
                // Update local data
                const email = this.emails.find(e => e.id === emailId);
                if (email) {
                    email.column = newColumn;
                    this.renderEmails();
                    this.updateStats();
                }
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            this.showMessage('Fehler beim Verschieben der E-Mail: ' + error.message, 'error');
            // Reload emails to ensure consistency
            await this.loadEmails();
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
                this.updateStats();
                this.showMessage('E-Mail erfolgreich archiviert', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            this.showMessage('Fehler beim Archivieren der E-Mail: ' + error.message, 'error');
        }
    }

    updateStats() {
        const stats = {
            total: this.emails.length,
            posteingang: this.emails.filter(e => e.column === 'posteingang').length,
            'in-bearbeitung': this.emails.filter(e => e.column === 'in-bearbeitung').length,
            'warte-auf-antwort': this.emails.filter(e => e.column === 'warte-auf-antwort').length
        };

        const statsElement = document.getElementById('email-stats');
        if (statsElement) {
            statsElement.textContent = `Gesamt: ${stats.total} E-Mails`;
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

    startAutoSync() {
        // Initial sync when the page loads
        console.log('Starting automatic email synchronization...');
        this.syncEmails();
        
        // Set up interval for automatic sync every 60 seconds
        this.autoSyncInterval = setInterval(() => {
            console.log('Auto-syncing emails...');
            this.syncEmails();
        }, 60000); // 60000 ms = 60 seconds
    }

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
            console.log('Auto-sync stopped');
        }
    }

    // Clean up when the page is being unloaded
    destroy() {
        this.stopAutoSync();
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
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const kanban = new EmailKanban();
    
    // Clean up auto-sync when the page is being unloaded
    window.addEventListener('beforeunload', () => {
        kanban.destroy();
    });
});
