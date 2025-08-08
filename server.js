const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const emailService = require('./services/emailService');
const kanbanService = require('./services/kanbanService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/emails', async (req, res) => {
  try {
    const emails = await kanbanService.getAllEmails();
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emails/sync', async (req, res) => {
  try {
    const newEmails = await emailService.fetchEmails();
    await kanbanService.addEmailsToInbox(newEmails);
    res.json({ message: 'Emails synchronized successfully', count: newEmails.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/emails/:id/column', async (req, res) => {
  try {
    const { id } = req.params;
    const { column } = req.body;
    await kanbanService.moveEmail(id, column);
    res.json({ message: 'Email moved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the application`);
});
