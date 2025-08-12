const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class LiveEmailService extends EventEmitter {
  constructor() {
    super();
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
    
    // Smart Cache mit TTL
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 Minute Cache
    this.connectionPool = new Map();
    this.maxConnections = 3;
    
    // Folder Mapping
    this.folderMapping = {
      'posteingang': 'INBOX',
      'in-bearbeitung': 'In_Bearbeitung',
      'warte-auf-antwort': 'Warte_auf_Antwort'
    };
    
    console.log(`${new Date().toISOString()}: LiveEmailService initialized with smart caching`);
  }

  // === LIVE EMAIL FETCHING ===
  
  async getEmailsLive(forceRefresh = false) {
    const startTime = Date.now();
    console.log(`${new Date().toISOString()}: Starting live email fetch (force: ${forceRefresh})`);
    
    try {
      const allEmails = [];
      
      for (const [column, folderName] of Object.entries(this.folderMapping)) {
        try {
          const folderEmails = await this.getEmailsFromFolderLive(folderName, column, forceRefresh);
          allEmails.push(...folderEmails);
          console.log(`${new Date().toISOString()}: Live fetch from ${folderName}: ${folderEmails.length} emails`);
        } catch (error) {
          console.error(`${new Date().toISOString()}: Error fetching from ${folderName}:`, error.message);
          // Fallback zu Cache
          const cached = this.getCachedEmails(folderName);
          if (cached) {
            allEmails.push(...cached);
            console.log(`${new Date().toISOString()}: Using cached emails for ${folderName}: ${cached.length} emails`);
          }
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`${new Date().toISOString()}: Live email fetch completed in ${duration}ms - Total: ${allEmails.length} emails`);
      
      // Emit update event
      this.emit('emails_updated', allEmails);
      
      return allEmails;
      
    } catch (error) {
      console.error(`${new Date().toISOString()}: Critical error in live email fetch:`, error.message);
      return this.getAllCachedEmails();
    }
  }

  async getEmailsFromFolderLive(folderName, column, forceRefresh = false) {
    const cacheKey = `${folderName}_${column}`;
    
    // Cache prüfen (außer bei forceRefresh)
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        console.log(`${new Date().toISOString()}: Using cached emails for ${folderName} (${cached.emails.length} emails)`);
        return cached.emails;
      }
    }

    console.log(`${new Date().toISOString()}: Fetching live emails from ${folderName}...`);
    
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);
      const emails = [];
      const maxEmails = 100; // Erhöht für bessere Live-Performance

      imap.once('ready', () => {
        imap.openBox(folderName, true, (err, box) => { // Read-only für Performance
          if (err) {
            console.error(`${new Date().toISOString()}: Error opening ${folderName}:`, err.message);
            imap.end();
            reject(err);
            return;
          }

          if (box.messages.total === 0) {
            console.log(`${new Date().toISOString()}: ${folderName} is empty`);
            imap.end();
            this.updateCache(cacheKey, []);
            resolve([]);
            return;
          }

          console.log(`${new Date().toISOString()}: ${folderName} contains ${box.messages.total} messages`);

          // Optimierte Suche: Neueste E-Mails zuerst
          const searchCriteria = ['ALL'];
          const fetchOptions = { 
            bodies: '', 
            markSeen: false, 
            struct: true,
            envelope: true 
          };

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error(`${new Date().toISOString()}: Search error in ${folderName}:`, err.message);
              imap.end();
              reject(err);
              return;
            }

            if (results.length === 0) {
              console.log(`${new Date().toISOString()}: No emails found in ${folderName}`);
              imap.end();
              this.updateCache(cacheKey, []);
              resolve([]);
              return;
            }

            // Neueste E-Mails holen (limitiert für Performance)
            const emailsToFetch = results.slice(-maxEmails);
            console.log(`${new Date().toISOString()}: Fetching ${emailsToFetch.length} emails from ${folderName}`);

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
                    uid: attrs?.uid || seqno,
                    seqno: seqno,
                    subject: parsed.subject || 'No Subject',
                    from: parsed.from?.text || 'Unknown Sender',
                    to: parsed.to?.text || '',
                    date: parsed.date || new Date(),
                    text: parsed.text || '',
                    html: parsed.html || '',
                    attachments: parsed.attachments || [],
                    column: column,
                    folder: folderName,
                    // Live-spezifische Metadaten
                    fetchedAt: new Date(),
                    isLive: true
                  };
                  
                  emails.push(email);
                  processedEmails++;
                  
                  if (processedEmails === totalEmails) {
                    // Nach Datum sortieren (neueste zuerst)
                    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
                    
                    console.log(`${new Date().toISOString()}: Successfully fetched ${emails.length} emails from ${folderName}`);
                    
                    // Cache aktualisieren
                    this.updateCache(cacheKey, emails);
                    
                    imap.end();
                    resolve(emails);
                  }
                } catch (parseError) {
                  console.error(`${new Date().toISOString()}: Parse error for email in ${folderName}:`, parseError.message);
                  processedEmails++;
                  
                  if (processedEmails === totalEmails) {
                    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
                    this.updateCache(cacheKey, emails);
                    imap.end();
                    resolve(emails);
                  }
                }
              });
            });

            fetch.once('error', (err) => {
              console.error(`${new Date().toISOString()}: Fetch error in ${folderName}:`, err.message);
              imap.end();
              reject(err);
            });

            fetch.once('end', () => {
              console.log(`${new Date().toISOString()}: Fetch process completed for ${folderName}`);
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error(`${new Date().toISOString()}: IMAP connection error for ${folderName}:`, err.message);
        reject(err);
      });

      imap.connect();
    });
  }

  // === LIVE EMAIL ACTIONS ===

  async moveEmailLive(uid, fromFolder, toFolder, emailMetadata = {}) {
    console.log(`${new Date().toISOString()}: Moving email UID ${uid} from ${fromFolder} to ${toFolder}`);
    
    try {
      const result = await this.performMoveOperation(uid, fromFolder, toFolder);
      
      if (result.success) {
        // Cache für beide Ordner invalidieren
        this.invalidateCache([fromFolder, toFolder]);
        
        console.log(`${new Date().toISOString()}: Email move successful: ${uid} -> ${toFolder}`);
        
        // Event emittieren für Real-time Updates
        this.emit('email_moved', {
          uid,
          fromFolder,
          toFolder,
          timestamp: new Date(),
          metadata: emailMetadata
        });
        
        return { success: true, newUid: result.newUid };
      } else {
        throw new Error(`Move operation failed for UID ${uid}`);
      }
      
    } catch (error) {
      console.error(`${new Date().toISOString()}: Error moving email ${uid}:`, error.message);
      throw error;
    }
  }

  async deleteEmailLive(uid, folder, emailMetadata = {}) {
    console.log(`${new Date().toISOString()}: Deleting email UID ${uid} from ${folder}`);
    
    try {
      const result = await this.performDeleteOperation(uid, folder);
      
      if (result.success) {
        // Cache für Ordner invalidieren
        this.invalidateCache([folder]);
        
        console.log(`${new Date().toISOString()}: Email deletion successful: ${uid} from ${folder}`);
        
        // Event emittieren
        this.emit('email_deleted', {
          uid,
          folder,
          timestamp: new Date(),
          metadata: emailMetadata
        });
        
        return { success: true };
      } else {
        throw new Error(`Delete operation failed for UID ${uid}`);
      }
      
    } catch (error) {
      console.error(`${new Date().toISOString()}: Error deleting email ${uid}:`, error.message);
      throw error;
    }
  }

  async performMoveOperation(uid, fromFolder, toFolder) {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.openBox(fromFolder, false, (err, box) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          // E-Mail suchen und verschieben
          imap.search([['UID', uid]], (err, results) => {
            if (err) {
              imap.end();
              reject(err);
              return;
            }
            
            if (!results || results.length === 0) {
              console.log(`${new Date().toISOString()}: Email UID ${uid} not found in ${fromFolder}`);
              imap.end();
              resolve({ success: false, newUid: null });
              return;
            }
            
            imap.move([uid], toFolder, (err) => {
              if (err) {
                imap.end();
                reject(err);
              } else {
                // Kurze Verzögerung für Server-Verarbeitung
                setTimeout(() => {
                  imap.end();
                  resolve({ success: true, newUid: null });
                }, 300);
              }
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

  async performDeleteOperation(uid, folder) {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.openBox(folder, false, (err, box) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          // E-Mail als gelöscht markieren und expungieren
          imap.search([['UID', uid]], (err, results) => {
            if (err) {
              imap.end();
              reject(err);
              return;
            }
            
            if (!results || results.length === 0) {
              console.log(`${new Date().toISOString()}: Email UID ${uid} not found in ${folder}`);
              imap.end();
              resolve({ success: false });
              return;
            }
            
            imap.addFlags([uid], ['\\Deleted'], (err) => {
              if (err) {
                imap.end();
                reject(err);
                return;
              }
              
              imap.expunge((err) => {
                imap.end();
                if (err) {
                  reject(err);
                } else {
                  resolve({ success: true });
                }
              });
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

  // === CACHE MANAGEMENT ===

  updateCache(key, emails) {
    this.cache.set(key, {
      emails: emails,
      timestamp: Date.now()
    });
    console.log(`${new Date().toISOString()}: Cache updated for ${key}: ${emails.length} emails`);
  }

  getCachedEmails(folderName) {
    for (const [key, cached] of this.cache.entries()) {
      if (key.startsWith(folderName)) {
        if (Date.now() - cached.timestamp < this.cacheTimeout * 2) { // Extended fallback timeout
          return cached.emails;
        }
      }
    }
    return null;
  }

  getAllCachedEmails() {
    const allEmails = [];
    for (const [key, cached] of this.cache.entries()) {
      allEmails.push(...cached.emails);
    }
    console.log(`${new Date().toISOString()}: Returning ${allEmails.length} cached emails as fallback`);
    return allEmails;
  }

  invalidateCache(folders) {
    if (Array.isArray(folders)) {
      folders.forEach(folder => {
        const keysToDelete = Array.from(this.cache.keys()).filter(key => key.includes(folder));
        keysToDelete.forEach(key => this.cache.delete(key));
        console.log(`${new Date().toISOString()}: Cache invalidated for ${folder}`);
      });
    } else {
      const keysToDelete = Array.from(this.cache.keys()).filter(key => key.includes(folders));
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`${new Date().toISOString()}: Cache invalidated for ${folders}`);
    }
  }

  clearCache() {
    this.cache.clear();
    console.log(`${new Date().toISOString()}: All cache cleared`);
  }

  // === UTILITY METHODS ===

  async testConnection() {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);
      imap.once('ready', () => { 
        console.log(`${new Date().toISOString()}: IMAP connection test successful`);
        imap.end(); 
        resolve(true); 
      });
      imap.once('error', (err) => { 
        console.error(`${new Date().toISOString()}: IMAP connection test failed:`, err.message);
        reject(err); 
      });
      imap.connect();
    });
  }

  async ensureKanbanFolders() {
    const foldersToCreate = Object.values(this.folderMapping).filter(folder => folder !== 'INBOX');
    
    for (const folder of foldersToCreate) {
      try {
        await this.createFolder(folder);
        console.log(`${new Date().toISOString()}: Ensured folder exists: ${folder}`);
      } catch (error) {
        console.error(`${new Date().toISOString()}: Failed to create folder ${folder}:`, error.message);
      }
    }
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
              console.log(`${new Date().toISOString()}: Created folder: ${folderName}`);
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

  getFolderMapping() {
    return this.folderMapping;
  }

  // === DEBUGGING & MONITORING ===

  getCacheStatus() {
    const status = {
      totalCacheEntries: this.cache.size,
      cacheTimeout: this.cacheTimeout,
      entries: []
    };

    for (const [key, cached] of this.cache.entries()) {
      status.entries.push({
        key,
        emailCount: cached.emails.length,
        age: Date.now() - cached.timestamp,
        expired: (Date.now() - cached.timestamp) > this.cacheTimeout
      });
    }

    return status;
  }

  getConnectionStatus() {
    return {
      activeConnections: this.connectionPool.size,
      maxConnections: this.maxConnections,
      imapConfig: {
        host: this.imapConfig.host,
        port: this.imapConfig.port,
        user: this.imapConfig.user,
        tls: this.imapConfig.tls
      }
    };
  }
}

module.exports = new LiveEmailService();
