const express = require('express');
const liveEmailService = require('../services/liveEmailService');
const authService = require('../services/authService');

const router = express.Router();

// === LIVE EMAIL ENDPOINTS ===

// Live Email Fetching
router.get('/live', authService.requireAuth, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const startTime = Date.now();
    
    console.log(`${new Date().toISOString()}: [API] Live email fetch requested (refresh: ${forceRefresh})`);
    
    const emails = await liveEmailService.getEmailsLive(forceRefresh);
    
    const duration = Date.now() - startTime;
    console.log(`${new Date().toISOString()}: [API] Live email fetch completed in ${duration}ms - ${emails.length} emails`);
    
    res.json({
      success: true,
      emails: emails,
      totalCount: emails.length,
      fetchedAt: new Date(),
      duration: duration,
      isLive: true
    });
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Live email fetch error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      fallback: true
    });
  }
});

// Live Email by Folder
router.get('/live/:folder', authService.requireAuth, async (req, res) => {
  try {
    const { folder } = req.params;
    const forceRefresh = req.query.refresh === 'true';
    
    // Folder mapping
    const folderMapping = liveEmailService.getFolderMapping();
    const imapFolder = folderMapping[folder];
    
    if (!imapFolder) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder: ${folder}. Valid folders: ${Object.keys(folderMapping).join(', ')}`
      });
    }
    
    console.log(`${new Date().toISOString()}: [API] Live fetch for folder ${folder} (IMAP: ${imapFolder})`);
    
    const emails = await liveEmailService.getEmailsFromFolderLive(imapFolder, folder, forceRefresh);
    
    res.json({
      success: true,
      emails: emails,
      folder: folder,
      imapFolder: imapFolder,
      count: emails.length,
      fetchedAt: new Date(),
      isLive: true
    });
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Live folder fetch error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Live Email Move
router.post('/live/move', authService.requireAuth, async (req, res) => {
  try {
    const { uid, fromColumn, toColumn, subject, from } = req.body;
    
    if (!uid || !fromColumn || !toColumn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: uid, fromColumn, toColumn'
      });
    }
    
    // Folder mapping
    const folderMapping = liveEmailService.getFolderMapping();
    const fromFolder = folderMapping[fromColumn];
    const toFolder = folderMapping[toColumn];
    
    if (!fromFolder || !toFolder) {
      return res.status(400).json({
        success: false,
        error: 'Invalid folder mapping'
      });
    }
    
    console.log(`${new Date().toISOString()}: [API] Live move: UID ${uid} from ${fromColumn} (${fromFolder}) to ${toColumn} (${toFolder})`);
    
    const result = await liveEmailService.moveEmailLive(uid, fromFolder, toFolder, {
      subject,
      from,
      timestamp: new Date()
    });
    
    if (result.success) {
      console.log(`${new Date().toISOString()}: [API] Live move successful: ${uid}`);
      
      res.json({
        success: true,
        message: `Email moved from ${fromColumn} to ${toColumn}`,
        uid: uid,
        fromColumn,
        toColumn,
        newUid: result.newUid,
        timestamp: new Date()
      });
    } else {
      throw new Error('Move operation failed');
    }
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Live move error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Live Email Delete
router.delete('/live/:uid', authService.requireAuth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { folder, subject, from } = req.body;
    
    if (!uid || !folder) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: uid, folder'
      });
    }
    
    // Folder mapping
    const folderMapping = liveEmailService.getFolderMapping();
    const imapFolder = folderMapping[folder];
    
    if (!imapFolder) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder: ${folder}`
      });
    }
    
    console.log(`${new Date().toISOString()}: [API] Live delete: UID ${uid} from ${folder} (${imapFolder})`);
    
    const result = await liveEmailService.deleteEmailLive(uid, imapFolder, {
      subject,
      from,
      timestamp: new Date()
    });
    
    if (result.success) {
      console.log(`${new Date().toISOString()}: [API] Live delete successful: ${uid}`);
      
      res.json({
        success: true,
        message: `Email deleted from ${folder}`,
        uid: uid,
        folder,
        timestamp: new Date()
      });
    } else {
      throw new Error('Delete operation failed');
    }
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Live delete error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === CACHE MANAGEMENT ===

// Cache Status
router.get('/cache/status', authService.requireAuth, (req, res) => {
  try {
    const cacheStatus = liveEmailService.getCacheStatus();
    const connectionStatus = liveEmailService.getConnectionStatus();
    
    res.json({
      success: true,
      cache: cacheStatus,
      connections: connectionStatus,
      timestamp: new Date()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear Cache
router.post('/cache/clear', authService.requireAuth, (req, res) => {
  try {
    liveEmailService.clearCache();
    
    console.log(`${new Date().toISOString()}: [API] Cache cleared by user request`);
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Invalidate Specific Cache
router.post('/cache/invalidate', authService.requireAuth, (req, res) => {
  try {
    const { folders } = req.body;
    
    if (!folders) {
      return res.status(400).json({
        success: false,
        error: 'Missing folders parameter'
      });
    }
    
    liveEmailService.invalidateCache(folders);
    
    console.log(`${new Date().toISOString()}: [API] Cache invalidated for folders:`, folders);
    
    res.json({
      success: true,
      message: `Cache invalidated for folders: ${Array.isArray(folders) ? folders.join(', ') : folders}`,
      timestamp: new Date()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === CONNECTION TESTING ===

// Test Live Connection
router.get('/test/connection', authService.requireAuth, async (req, res) => {
  try {
    console.log(`${new Date().toISOString()}: [API] Testing live IMAP connection...`);
    
    const startTime = Date.now();
    const result = await liveEmailService.testConnection();
    const duration = Date.now() - startTime;
    
    console.log(`${new Date().toISOString()}: [API] Connection test completed in ${duration}ms`);
    
    res.json({
      success: true,
      connected: result,
      duration: duration,
      timestamp: new Date(),
      message: 'Live IMAP connection successful'
    });
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Connection test failed:`, error.message);
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Ensure Kanban Folders
router.post('/setup/folders', authService.requireAuth, async (req, res) => {
  try {
    console.log(`${new Date().toISOString()}: [API] Ensuring Kanban folders exist...`);
    
    await liveEmailService.ensureKanbanFolders();
    
    console.log(`${new Date().toISOString()}: [API] Kanban folders setup completed`);
    
    res.json({
      success: true,
      message: 'Kanban folders ensured',
      folders: Object.values(liveEmailService.getFolderMapping()),
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Folder setup error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === DEBUGGING ENDPOINTS ===

// Debug Folder Sync
router.get('/debug/folder/:folder', authService.requireAuth, async (req, res) => {
  try {
    const { folder } = req.params;
    
    const folderMapping = liveEmailService.getFolderMapping();
    const imapFolder = folderMapping[folder];
    
    if (!imapFolder) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder: ${folder}`
      });
    }
    
    console.log(`${new Date().toISOString()}: [API] Debug sync for folder ${folder} (${imapFolder})`);
    
    // Live fetch mit Debug-Info
    const emails = await liveEmailService.getEmailsFromFolderLive(imapFolder, folder, true);
    const cacheStatus = liveEmailService.getCacheStatus();
    
    res.json({
      success: true,
      folder: folder,
      imapFolder: imapFolder,
      emailCount: emails.length,
      emails: emails.slice(0, 5), // Erste 5 E-Mails für Debug
      cacheStatus: cacheStatus,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error(`${new Date().toISOString()}: [API] Debug folder error:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
