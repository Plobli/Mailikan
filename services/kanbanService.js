const fs = require('fs').promises;
const path = require('path');

class KanbanService {
  constructor() {
    this.dataFile = path.join(__dirname, '../data/emails.json');
    this.columns = ['posteingang', 'in-bearbeitung', 'warte-auf-antwort'];
    // Import EmailService dynamically to avoid circular dependency
    this.emailService = null;
  }

  // Lazy load EmailService to avoid circular dependency
  getEmailService() {
    if (!this.emailService) {
      this.emailService = require('./emailService');
    }
    return this.emailService;
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
    // This method is now used for updating all emails from all folders
    console.log(`Updating ${newEmails.length} emails from server`);
    
    const existingEmails = await this.getAllEmails();
    
    // Create a map of existing emails by a unique identifier (subject + from + date)
    const existingEmailMap = new Map();
    existingEmails.forEach(email => {
      const key = `${email.subject}-${email.from}-${new Date(email.date).getTime()}`;
      existingEmailMap.set(key, email);
    });
    
    // Process new emails
    const updatedEmails = [];
    
    newEmails.forEach(newEmail => {
      const key = `${newEmail.subject}-${newEmail.from}-${new Date(newEmail.date).getTime()}`;
      
      if (existingEmailMap.has(key)) {
        // Email exists, update it
        const existingEmail = existingEmailMap.get(key);
        const updatedEmail = {
          ...existingEmail,
          column: newEmail.column, // Update column from server
          folder: newEmail.folder,
          uid: newEmail.uid,
          lastModified: new Date().toISOString()
        };
        updatedEmails.push(updatedEmail);
        existingEmailMap.delete(key); // Remove from map
      } else {
        // New email, add it
        updatedEmails.push({
          ...newEmail,
          lastModified: new Date().toISOString()
        });
      }
    });
    
    // Add remaining existing emails that weren't updated
    existingEmailMap.forEach(email => {
      updatedEmails.push(email);
    });
    
    console.log(`Saving ${updatedEmails.length} total emails (${newEmails.length} from server, ${existingEmailMap.size} remaining local)`);
    await this.saveEmails(updatedEmails);
    
    return newEmails; // Return the new emails for response
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

    const email = emails[emailIndex];
    const oldColumn = email.column;
    
    // Update local data first
    emails[emailIndex].column = newColumn;
    emails[emailIndex].lastModified = new Date().toISOString();
    
    try {
      // Move email on server if it has a UID and we're not just moving to the same column
      if (email.uid && oldColumn !== newColumn) {
        console.log(`Moving email "${email.subject}" from ${oldColumn} to ${newColumn}`);
        
        const emailService = this.getEmailService();
        const folderMapping = emailService.getFolderMapping();
        const targetFolder = folderMapping[newColumn];
        const sourceFolder = folderMapping[oldColumn];
        
        if (targetFolder && sourceFolder !== targetFolder) {
          // Ensure target folder exists
          if (targetFolder !== 'INBOX') {
            await emailService.createFolder(targetFolder);
          }
          
          // Move email on server
          const moveResult = await emailService.moveEmailToFolder(email.uid, targetFolder, sourceFolder);
          
          if (moveResult.success) {
            console.log(`Email successfully moved on server to ${targetFolder}`);
            
            // Find the new UID in the target folder - do this synchronously
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for server to process
            
            try {
              const newUid = await emailService.findEmailInFolder(targetFolder, email.subject, email.from);
              if (newUid) {
                console.log(`Found new UID ${newUid} for email in ${targetFolder}`);
                // Update the current email object with the new UID
                emails[emailIndex].uid = newUid;
                emails[emailIndex].folder = targetFolder;
                console.log(`Updated email UID from ${email.uid} to ${newUid}`);
              } else {
                console.log(`Could not find new UID for email in ${targetFolder}, keeping old UID ${email.uid}`);
              }
            } catch (uidError) {
              console.error('Error finding new UID:', uidError);
            }
          } else {
            throw new Error('Failed to move email on server');
          }
        }
      }
      
      // Save local changes after successful server move
      await this.saveEmails(emails);
      return emails[emailIndex];
      
    } catch (serverError) {
      console.error('Failed to move email on server:', serverError);
      
      // Revert local changes if server move failed
      emails[emailIndex].column = oldColumn;
      emails[emailIndex].lastModified = new Date().toISOString();
      
      throw new Error(`Failed to move email on server: ${serverError.message}`);
    }
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
