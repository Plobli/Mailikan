const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

/**
 * Ensure users file exists
 */
async function ensureUsersFile() {
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify([]));
  }
}

/**
 * Get all users from file
 */
async function getUsers() {
  await ensureUsersFile();
  const data = await fs.readFile(USERS_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * Save users to file
 */
async function saveUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

/**
 * Create a new user
 */
async function createUser(email, password) {
  const users = await getUsers();
  
  // Check if user already exists
  if (users.find(u => u.email === email)) {
    throw new Error('User already exists');
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = {
    id: Date.now().toString(),
    email,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };
  
  users.push(user);
  await saveUsers(users);
  
  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Validate user credentials
 */
async function validateUser(email, password) {
  const users = await getUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;
  
  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Get user by ID
 */
async function getUserById(id) {
  const users = await getUsers();
  const user = users.find(u => u.id === id);
  
  if (!user) return null;
  
  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Check if any users exist
 */
async function hasUsers() {
  const users = await getUsers();
  return users.length > 0;
}

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  
  // For API routes, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For regular routes, redirect to login
  res.redirect('/login');
}

/**
 * Middleware to redirect logged-in users away from auth pages
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/');
  }
  next();
}

module.exports = {
  createUser,
  validateUser,
  getUserById,
  hasUsers,
  requireAuth,
  redirectIfAuthenticated
};
