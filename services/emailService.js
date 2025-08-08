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
    console.log('Starting email fetch process...');
    console.log('IMAP Config:', {
      host: this.imapConfig.host,
      port: this.imapConfig.port,
      user: this.imapConfig.user,
      tls: this.imapConfig.tls
    });
    
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);
      const emails = [];

      imap.once('ready', () => {
        console.log('IMAP connection ready');
        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            console.error('Error opening INBOX:', err);
            reject(err);
            return;
          }

          console.log('INBOX opened successfully. Total messages:', box.messages.total);

          // Fetch recent emails
          const searchCriteria = ['ALL']; // All emails (change from UNSEEN to get all emails)
          const fetchOptions = {
            bodies: '',
            markSeen: false,
            struct: true
          };

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error('Search error:', err);
              reject(err);
              return;
            }

            console.log('Search results:', results.length, 'emails found');

            if (results.length === 0) {
              console.log('No emails found');
              resolve([]);
              imap.end();
              return;
            }

            // Limit the number of emails to fetch
            const emailsToFetch = results.slice(-maxEmails);
            console.log('Fetching', emailsToFetch.length, 'emails');
            const fetch = imap.fetch(emailsToFetch, fetchOptions);
            
            let processedEmails = 0;
            const totalEmails = emailsToFetch.length;

            fetch.on('message', (msg, seqno) => {
              let buffer = '';
              
              msg.on('body', (stream, info) => {
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  const email = {
                    id: uuidv4(),
                    uid: seqno,
                    subject: parsed.subject || 'No Subject',
                    from: parsed.from?.text || 'Unknown Sender',
                    to: parsed.to?.text || '',
                    date: parsed.date || new Date(),
                    text: parsed.text || '',
                    html: parsed.html || '',
                    attachments: parsed.attachments || [],
                    column: 'posteingang' // Default to inbox
                  };
                  console.log('Parsed email:', email.subject, 'from', email.from);
                  emails.push(email);
                  
                  processedEmails++;
                  if (processedEmails === totalEmails) {
                    console.log('All emails processed. Total emails retrieved:', emails.length);
                    imap.end();
                    resolve(emails);
                  }
                } catch (parseError) {
                  console.error('Error parsing email:', parseError);
                  processedEmails++;
                  if (processedEmails === totalEmails) {
                    console.log('All emails processed (with errors). Total emails retrieved:', emails.length);
                    imap.end();
                    resolve(emails);
                  }
                }
              });
            });

            fetch.once('error', (err) => {
              console.error('Fetch error:', err);
              reject(err);
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error('IMAP connection error:', err);
        reject(err);
      });

      console.log('Connecting to IMAP server...');
      imap.connect();
    });
  }

  // Test IMAP connection
  async testConnection() {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.imapConfig);

      imap.once('ready', () => {
        imap.end();
        resolve(true);
      });

      imap.once('error', (err) => {
        reject(err);
      });

      imap.connect();
    });
  }
}

module.exports = new EmailService();
