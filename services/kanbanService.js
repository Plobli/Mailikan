const fs = require('fs').promises;
const path = require('path');

class KanbanService {
  constructor() {
    this.dataFile = path.join(__dirname, '../data/emails.json');
    this.columns = ['posteingang', 'in-bearbeitung', 'warte-auf-antwort'];
  }

  async ensureDataFile() {
    try {
      await fs.access(this.dataFile);
    } catch {
      // Create data directory and file if they don't exist
      const dataDir = path.dirname(this.dataFile);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(this.dataFile, JSON.stringify([]));
    }
  }

  async getAllEmails() {
    await this.ensureDataFile();
    const data = await fs.readFile(this.dataFile, 'utf8');
    return JSON.parse(data);
  }

  async saveEmails(emails) {
    await this.ensureDataFile();
    await fs.writeFile(this.dataFile, JSON.stringify(emails, null, 2));
  }

  async addEmailsToInbox(newEmails) {
    const existingEmails = await this.getAllEmails();
    
    // Filter out emails that already exist (by subject and from)
    const uniqueEmails = newEmails.filter(newEmail => 
      !existingEmails.some(existing => 
        existing.subject === newEmail.subject && 
        existing.from === newEmail.from
      )
    );

    // Add new emails to inbox column
    uniqueEmails.forEach(email => {
      email.column = 'posteingang';
    });

    const allEmails = [...existingEmails, ...uniqueEmails];
    await this.saveEmails(allEmails);
    
    return uniqueEmails;
  }

  async moveEmail(emailId, newColumn) {
    if (!this.columns.includes(newColumn)) {
      throw new Error(`Invalid column: ${newColumn}`);
    }

    const emails = await this.getAllEmails();
    const emailIndex = emails.findIndex(email => email.id === emailId);
    
    if (emailIndex === -1) {
      throw new Error(`Email with ID ${emailId} not found`);
    }

    emails[emailIndex].column = newColumn;
    emails[emailIndex].lastModified = new Date().toISOString();
    
    await this.saveEmails(emails);
    return emails[emailIndex];
  }

  async getEmailsByColumn(column) {
    const emails = await this.getAllEmails();
    return emails.filter(email => email.column === column);
  }

  async deleteEmail(emailId) {
    const emails = await this.getAllEmails();
    const filteredEmails = emails.filter(email => email.id !== emailId);
    
    if (filteredEmails.length === emails.length) {
      throw new Error(`Email with ID ${emailId} not found`);
    }

    await this.saveEmails(filteredEmails);
    return true;
  }

  async getEmailStats() {
    const emails = await this.getAllEmails();
    return {
      total: emails.length,
      posteingang: emails.filter(e => e.column === 'posteingang').length,
      'in-bearbeitung': emails.filter(e => e.column === 'in-bearbeitung').length,
      'warte-auf-antwort': emails.filter(e => e.column === 'warte-auf-antwort').length
    };
  }
}

module.exports = new KanbanService();
