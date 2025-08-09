const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
require('dotenv').config();

const emailService = require('./services/emailService');
const kanbanService = require('./services/kanbanService');
const authService = require('./services/authService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'mailikan-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(flash());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', authService.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth Routes
app.get('/login', authService.redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
    }
    
    const user = await authService.validateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    
    res.json({ message: 'Anmeldung erfolgreich', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const hasUsers = await authService.hasUsers();
    if (hasUsers) {
      return res.status(400).json({ error: 'Setup bereits abgeschlossen' });
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
    }
    
    const user = await authService.createUser(email, password);
    
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    
    res.json({ message: 'Administrator-Konto erstellt', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/setup-needed', async (req, res) => {
  try {
    const hasUsers = await authService.hasUsers();
    res.json({ setupNeeded: !hasUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Fehler beim Abmelden' });
    }
    res.json({ message: 'Erfolgreich abgemeldet' });
  });
});

// API Routes (Protected)
app.get('/api/emails', authService.requireAuth, async (req, res) => {
  try {
    const emails = await kanbanService.getAllEmails();
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emails/sync', authService.requireAuth, async (req, res) => {
  try {
    const allEmails = await emailService.fetchEmails();
    const result = await kanbanService.addEmailsToInbox(allEmails);
    res.json({ 
      message: 'Emails synchronized successfully', 
      count: result.newEmailsCount,
      emails: result.newEmails 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/emails/:id/column', authService.requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { column } = req.body;
    await kanbanService.moveEmail(id, column);
    res.json({ message: 'Email moved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/emails/:id/archive', authService.requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await kanbanService.archiveEmail(id);
    res.json({ message: 'Email archived successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize server and ensure Kanban folders exist
async function initializeServer() {
  try {
    console.log('Initializing server...');
    await emailService.ensureKanbanFolders();
    console.log('Kanban folders initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Kanban folders:', error.message);
    console.log('Server will continue without folder initialization');
  }
}

app.listen(PORT, async () => {
  console.log(`Mailikan server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view Mailikan`);
  
  // Initialize folders after server starts
  await initializeServer();
});
