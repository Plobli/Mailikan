const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');

class EmailService {
  constructor() {
    this.imapConfig = {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASSWORD,
      host: process.env.IMAP_HOST,
      port: parseInt(process.env.IMAP_PORT) || 993,
      tls: process.env.IMAP_TLS === 'true',
      authTimeout: 3000,
      connTimeout: 10000,
      tlsOptions: {
        rejectUnauthorized: false
      }
    };
  }

  async fetchEmails(maxEmails = 50) {
    console.log('Starting email fetch process from all Kanban folders...');
    const folderMapping = this.getFolderMapping();
    const allEmails = [];
    
    for (const [column, folderName] of Object.entries(folderMapping)) {
      try {
        console.log(`Fetching emails from folder: ${folderName} (column: ${column})`);
        const folderEmails = await this.fetchEmailsFromFolder(folderName, column, maxEmails);
        allEmails.push(...folderEmails);
        console.log(`Found ${folderEmails.length} emails in ${folderName}`);
      } catch (error) {
        console.error(`Error fetching emails from ${folderName}:`, error.message);
      }
    }
    
    console.log(`Total emails fetched: ${allEmails.length}`);
    return allEmails;
  }

  async fetchEmailsFromFolder(folderName, column, maxEmails = 50) {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);
      const emails = [];

      imap.once('ready', () => {
        imap.openBox(folderName, true, (err, box) => {
          if (err) {
            console.error(`Error opening folder ${folderName}:`, err);
            imap.end();
            reject(err);
            return;
          }

          if (box.messages.total === 0) {
            imap.end();
            resolve([]);
            return;
          }

          const searchCriteria = ['ALL'];
          const fetchOptions = { bodies: '', markSeen: false, struct: true };

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error(`Search error in ${folderName}:`, err);
              imap.end();
              reject(err);
              return;
            }

            console.log(`Search results in ${folderName}:`, results.length, 'emails found');

            if (results.length === 0) {
              console.log(`No emails found in ${folderName}`);
              imap.end();
              resolve([]);
              return;
            }

            const emailsToFetch = results.slice(-maxEmails);
            console.log(`Fetching ${emailsToFetch.length} emails from ${folderName}`);
            const fetch = imap.fetch(emailsToFetch, fetchOptions);
            let processedEmails = 0;
            const totalEmails = emailsToFetch.length;

            fetch.on('message', (msg, seqno) => {
              let buffer = '';
              let attrs = null;
              
              msg.on('body', (stream, info) => {
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
              });

              msg.once('attributes', (attribs) => {
                attrs = attribs;
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  const email = {
                    id: uuidv4(),
                    uid: attrs?.uid || seqno, // Use the real UID from attributes
                    seqno: seqno, // Keep seqno as separate field for debugging
                    subject: parsed.subject || 'No Subject',
                    from: parsed.from?.text || 'Unknown Sender',
                    to: parsed.to?.text || '',
                    date: parsed.date || new Date(),
                    text: parsed.text || '',
                    html: parsed.html || '',
                    attachments: parsed.attachments || [],
                    column: column,
                    folder: folderName
                  };
                  console.log(`Parsed email from ${folderName}:`, email.subject, 'from', email.from);
                  emails.push(email);
                  
                  processedEmails++;
                  if (processedEmails === totalEmails) {
                    console.log(`All emails processed from ${folderName}. Total emails retrieved:`, emails.length);
                    imap.end();
                    resolve(emails);
                  }
                } catch (parseError) {
                  console.error(`Error parsing email from ${folderName}:`, parseError);
                  processedEmails++;
                  if (processedEmails === totalEmails) {
                    console.log(`All emails processed from ${folderName} (with errors). Total emails retrieved:`, emails.length);
                    imap.end();
                    resolve(emails);
                  }
                }
              });
            });

            fetch.once('error', (err) => {
              imap.end();
              reject(err);
            });
          });
        });
      });

      imap.once('error', (err) => {
        reject(err);
      });

      imap.connect();
    });
  }

  async testConnection() {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);
      imap.once('ready', () => { imap.end(); resolve(true); });
      imap.once('error', (err) => { reject(err); });
      imap.connect();
    });
  }

  async createFolder(folderName) {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.getBoxes((err, boxes) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          const folderExists = Object.keys(boxes).some(box => 
            box.toLowerCase() === folderName.toLowerCase()
          );

          if (folderExists) {
            imap.end();
            resolve(true);
            return;
          }

          imap.addBox(folderName, (err) => {
            imap.end();
            if (err) {
              reject(err);
            } else {
              resolve(true);
            }
          });
        });
      });

      imap.once('error', (err) => {
        reject(err);
      });

      imap.connect();
    });
  }

  async moveEmailToFolder(emailUid, targetFolder, sourceFolder = 'INBOX') {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        console.log(`IMAP connected for moving UID ${emailUid} from ${sourceFolder} to ${targetFolder}`);
        
        imap.openBox(sourceFolder, false, (err, box) => {
          if (err) {
            console.error('Error opening source folder:', err);
            imap.end();
            reject(err);
            return;
          }

          console.log(`Opened source folder ${sourceFolder}, moving UID ${emailUid} to ${targetFolder}`);
          
          // First, let's search for the email to verify it exists
          imap.search([['UID', emailUid]], (err, results) => {
            if (err) {
              console.error('Error searching for email:', err);
              imap.end();
              reject(err);
              return;
            }
            
            if (!results || results.length === 0) {
              console.log(`Email with UID ${emailUid} not found in ${sourceFolder}`);
              imap.end();
              resolve({ success: false, newUid: null });
              return;
            }
            
            console.log(`Found email with UID ${emailUid}, proceeding with move`);
            
            // Move the email using UID range
            imap.move([emailUid], targetFolder, (err) => {
              if (err) {
                console.error('Error moving email:', err);
                imap.end();
                reject(err);
              } else {
                console.log(`Successfully moved email UID ${emailUid} to ${targetFolder}`);
                
                // Add a small delay to allow server to process the move
                setTimeout(() => {
                  imap.end();
                  resolve({ success: true, newUid: null }); // We'll find the new UID later
                }, 500);
              }
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error('IMAP connection error during move:', err);
        reject(err);
      });

      imap.connect();
    });
  }

  async findEmailInFolder(folderName, subject, fromEmail) {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.openBox(folderName, true, (err, box) => { // Open read-only
          if (err) {
            console.error('Error opening folder for search:', err);
            imap.end();
            reject(err);
            return;
          }

          if (box.messages.total === 0) {
            imap.end();
            resolve(null);
            return;
          }

          // Search for all emails since we need to match by subject and from
          const searchCriteria = ['ALL'];
          const fetchOptions = { bodies: 'HEADER', markSeen: false };

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error('Search error:', err);
              imap.end();
              reject(err);
              return;
            }

            if (results.length === 0) {
              imap.end();
              resolve(null);
              return;
            }

            const fetch = imap.fetch(results, fetchOptions);
            let foundUid = null;
            let processedCount = 0;

            fetch.on('message', (msg, seqno) => {
              let attrs = null;
              let headerBuffer = '';

              msg.once('attributes', (attribs) => {
                attrs = attribs;
              });

              msg.on('body', (stream, info) => {
                stream.on('data', (chunk) => {
                  headerBuffer += chunk.toString('utf8');
                });
              });

              msg.once('end', () => {
                processedCount++;
                
                // Parse headers to check if subject and from address matches
                const headerLower = headerBuffer.toLowerCase();
                const subjectLower = subject.toLowerCase();
                const fromLower = fromEmail.toLowerCase();
                
                if (headerLower.includes(`subject: ${subjectLower}`) && headerLower.includes(fromLower)) {
                  foundUid = attrs?.uid;
                  console.log(`Found email with new UID ${foundUid} in ${folderName} (subject: ${subject})`);
                }
                
                // Check if we've processed all messages
                if (processedCount === results.length) {
                  imap.end();
                  resolve(foundUid);
                }
              });
            });

            fetch.once('error', (err) => {
              imap.end();
              reject(err);
            });
          });
        });
      });

      imap.once('error', (err) => {
        reject(err);
      });

      imap.connect();
    });
  }

  getFolderMapping() {
    return {
      'posteingang': 'INBOX',
      'in-bearbeitung': 'In_Bearbeitung',
      'warte-auf-antwort': 'Warte_auf_Antwort'
    };
  }

  async ensureKanbanFolders() {
    const folderMapping = this.getFolderMapping();
    const foldersToCreate = Object.values(folderMapping).filter(folder => folder !== 'INBOX');
    
    for (const folder of foldersToCreate) {
      try {
        await this.createFolder(folder);
      } catch (error) {
        console.error(`Failed to create folder ${folder}:`, error);
      }
    }
  }
}

module.exports = new EmailService();
