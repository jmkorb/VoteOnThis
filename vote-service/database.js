const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use Railway volume path if available, otherwise use local directory
const dbDir = process.env.DB_PATH || __dirname;

// Ensure directory exists (important for Railway volumes)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create or open database
const dbPath = path.join(dbDir, 'voting.db');
console.log(`Using database at: ${dbPath}`);
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  // Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      dates TEXT,
      vote_count INTEGER NOT NULL,
      vote_mode TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  // Create votes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      voter_name TEXT NOT NULL,
      choices TEXT NOT NULL,
      dates TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, voter_id)
    )
  `);

  // Create index for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires 
    ON sessions(expires_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_votes_session 
    ON votes(session_id)
  `);

  console.log('Database initialized successfully');
}

// Cleanup expired sessions (runs on server start and periodically)
function cleanupExpiredSessions() {
  const now = Date.now();
  const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
  const result = stmt.run(now);
  
  if (result.changes > 0) {
    console.log(`Cleaned up ${result.changes} expired session(s)`);
  }
  
  return result.changes;
}

// Session operations
const sessionOps = {
  create: (sessionId, question, options, dates, voteCount, voteMode) => {
    const now = Date.now();
    const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days from now
    
    const stmt = db.prepare(`
      INSERT INTO sessions (id, question, options, dates, vote_count, vote_mode, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      sessionId,
      question,
      JSON.stringify(options),
      dates ? JSON.stringify(dates) : null,
      voteCount,
      voteMode,
      now,
      expiresAt
    );
    
    return {
      id: sessionId,
      question,
      options,
      dates,
      voteCount,
      voteMode,
      createdAt: now,
      expiresAt
    };
  },

  get: (sessionId) => {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(sessionId);
    
    if (!session) return null;
    
    // Check if expired
    if (session.expires_at < Date.now()) {
      sessionOps.delete(sessionId);
      return null;
    }
    
    // Get all votes for this session
    const votesStmt = db.prepare('SELECT * FROM votes WHERE session_id = ?');
    const votesArray = votesStmt.all(sessionId);
    
    // Convert votes array to object format
    const votes = {};
    votesArray.forEach(vote => {
      votes[vote.voter_id] = {
        name: vote.voter_name,
        choices: JSON.parse(vote.choices),
        dates: vote.dates ? JSON.parse(vote.dates) : null,
        timestamp: vote.timestamp
      };
    });
    
    return {
      id: session.id,
      question: session.question,
      options: JSON.parse(session.options),
      dates: session.dates ? JSON.parse(session.dates) : null,
      voteCount: session.vote_count,
      voteMode: session.vote_mode,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      votes
    };
  },

  delete: (sessionId) => {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    return stmt.run(sessionId);
  },

  addVote: (sessionId, voterId, voterName, choices, dates) => {
    const stmt = db.prepare(`
      INSERT INTO votes (session_id, voter_id, voter_name, choices, dates, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      sessionId,
      voterId,
      voterName,
      JSON.stringify(choices),
      dates ? JSON.stringify(dates) : null,
      Date.now()
    );
  },

  hasVoted: (sessionId, voterId) => {
    const stmt = db.prepare('SELECT 1 FROM votes WHERE session_id = ? AND voter_id = ?');
    return stmt.get(sessionId, voterId) !== undefined;
  }
};

// Initialize on module load
initializeDatabase();

// Run cleanup on start
cleanupExpiredSessions();

// Schedule periodic cleanup (every 6 hours)
setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000);

module.exports = {
  db,
  sessionOps,
  cleanupExpiredSessions
};