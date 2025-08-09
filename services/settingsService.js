const fs = require('fs').promises;
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

/**
 * Read current environment variables from .env file
 */
async function getSettings() {
  try {
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    const settings = {};
    
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          settings[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
    
    return {
      imapHost: settings.IMAP_HOST || '',
      imapPort: settings.IMAP_PORT || '993',
      imapUser: settings.IMAP_USER || '',
      imapPassword: settings.IMAP_PASSWORD || '',
      imapTls: settings.IMAP_TLS === 'true',
      port: settings.PORT || '3000'
    };
  } catch (error) {
    throw new Error('Fehler beim Lesen der Einstellungen: ' + error.message);
  }
}

/**
 * Update environment variables in .env file
 */
async function updateSettings(newSettings) {
  try {
    // Read current .env file
    let envContent = '';
    try {
      envContent = await fs.readFile(ENV_FILE, 'utf8');
    } catch (error) {
      // File doesn't exist, create new content
      envContent = '# Environment variables for Email Kanban Board\n\n';
    }
    
    // Parse existing content
    const lines = envContent.split('\n');
    const updatedLines = [];
    const processedKeys = new Set();
    
    // Update existing lines
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#') || !trimmedLine) {
        // Keep comments and empty lines
        updatedLines.push(line);
      } else {
        const [key] = trimmedLine.split('=');
        const cleanKey = key.trim();
        
        if (cleanKey === 'IMAP_HOST') {
          updatedLines.push(`IMAP_HOST=${newSettings.imapHost}`);
          processedKeys.add('IMAP_HOST');
        } else if (cleanKey === 'IMAP_PORT') {
          updatedLines.push(`IMAP_PORT=${newSettings.imapPort}`);
          processedKeys.add('IMAP_PORT');
        } else if (cleanKey === 'IMAP_USER') {
          updatedLines.push(`IMAP_USER=${newSettings.imapUser}`);
          processedKeys.add('IMAP_USER');
        } else if (cleanKey === 'IMAP_PASSWORD') {
          updatedLines.push(`IMAP_PASSWORD=${newSettings.imapPassword}`);
          processedKeys.add('IMAP_PASSWORD');
        } else if (cleanKey === 'IMAP_TLS') {
          updatedLines.push(`IMAP_TLS=${newSettings.imapTls}`);
          processedKeys.add('IMAP_TLS');
        } else if (cleanKey === 'PORT') {
          updatedLines.push(`PORT=${newSettings.port}`);
          processedKeys.add('PORT');
        } else {
          // Keep other settings unchanged
          updatedLines.push(line);
        }
      }
    }
    
    // Add new settings if they weren't in the file
    if (!processedKeys.has('IMAP_HOST')) {
      updatedLines.push(`IMAP_HOST=${newSettings.imapHost}`);
    }
    if (!processedKeys.has('IMAP_PORT')) {
      updatedLines.push(`IMAP_PORT=${newSettings.imapPort}`);
    }
    if (!processedKeys.has('IMAP_USER')) {
      updatedLines.push(`IMAP_USER=${newSettings.imapUser}`);
    }
    if (!processedKeys.has('IMAP_PASSWORD')) {
      updatedLines.push(`IMAP_PASSWORD=${newSettings.imapPassword}`);
    }
    if (!processedKeys.has('IMAP_TLS')) {
      updatedLines.push(`IMAP_TLS=${newSettings.imapTls}`);
    }
    if (!processedKeys.has('PORT')) {
      updatedLines.push(`PORT=${newSettings.port}`);
    }
    
    // Write updated content
    await fs.writeFile(ENV_FILE, updatedLines.join('\n'));
    
    // Update process.env for current session
    process.env.IMAP_HOST = newSettings.imapHost;
    process.env.IMAP_PORT = newSettings.imapPort;
    process.env.IMAP_USER = newSettings.imapUser;
    process.env.IMAP_PASSWORD = newSettings.imapPassword;
    process.env.IMAP_TLS = newSettings.imapTls.toString();
    process.env.PORT = newSettings.port;
    
    return true;
  } catch (error) {
    throw new Error('Fehler beim Speichern der Einstellungen: ' + error.message);
  }
}

/**
 * Test IMAP connection with given settings
 */
async function testImapConnection(settings) {
  console.log('Testing IMAP connection with settings:', {
    host: settings.imapHost,
    port: settings.imapPort,
    user: settings.imapUser,
    tls: settings.imapTls
  });
  
  try {
    const { ImapFlow } = require('imapflow');
    
    const config = {
      host: settings.imapHost,
      port: parseInt(settings.imapPort),
      secure: settings.imapTls,
      auth: {
        user: settings.imapUser,
        pass: settings.imapPassword
      },
      logger: false
    };
    
    console.log('IMAP config:', { ...config, auth: { user: config.auth.user, pass: '[HIDDEN]' } });
    
    let client;
    try {
      client = new ImapFlow(config);
      console.log('Connecting to IMAP server...');
      await client.connect();
      console.log('IMAP connection successful');
      await client.logout();
      return { success: true, message: 'Verbindung erfolgreich' };
    } catch (error) {
      console.error('IMAP connection error:', error);
      return { 
        success: false, 
        message: 'Verbindung fehlgeschlagen: ' + error.message 
      };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch (e) {
          console.warn('Error during logout:', e.message);
        }
      }
    }
  } catch (importError) {
    console.error('ImapFlow import error:', importError);
    return {
      success: false,
      message: 'ImapFlow-Modul konnte nicht geladen werden: ' + importError.message
    };
  }
}

module.exports = {
  getSettings,
  updateSettings,
  testImapConnection
};
