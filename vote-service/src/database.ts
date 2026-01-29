import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Session, SessionRow, VoteRow, Vote, VoteMode } from './types/session';

// Use Railway volume path if available, otherwise local directory
const dbDir: string = process.env.DB_PATH || __dirname;

// double check directory exists (important for Railway volumes)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath: string = path.join(dbDir, 'voting.db');
console.log(`Using database at: ${dbPath}`);
const db: Database.Database = new Database(dbPath);

db.pragma('foreign_keys = ON');

function initializeDatabase(): void {
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

function cleanupExpiredSessions(): number {
  const now: number = Date.now();
  const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
  const result: Database.RunResult = stmt.run(now);

  if (result.changes > 0) {
    console.log(`Cleaned up ${result.changes} expired session(s)`);
  }

  return result.changes;
}

export const sessionOps = {
  create: (
    sessionId: string,
    question: string,
    options: string[],
    dates: string[] | null,
    voteCount: number,
    voteMode: VoteMode
  ): Session => {
    const now: number = Date.now();
    const expiresAt: number = now + (30 * 24 * 60 * 60 * 1000); // 30 days from now

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
      expiresAt,
      votes: {}
    };
  },

  get: (sessionId: string): Session | null => {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(sessionId) as SessionRow | undefined;

    if (!session) return null;

    if (session.expires_at < Date.now()) {
      sessionOps.delete(sessionId);
      return null;
    }

    // Get all votes for this session
    const votesStmt = db.prepare('SELECT * FROM votes WHERE session_id = ?');
    const votesArray = votesStmt.all(sessionId) as VoteRow[];

    const votes: Record<string, Vote> = {};
    votesArray.forEach((vote: VoteRow) => {
      votes[vote.voter_id] = {
        name: vote.voter_name,
        choices: JSON.parse(vote.choices) as string[],
        dates: vote.dates ? (JSON.parse(vote.dates) as string[]) : null,
        timestamp: vote.timestamp
      };
    });

    return {
      id: session.id,
      question: session.question,
      options: JSON.parse(session.options) as string[],
      dates: session.dates ? (JSON.parse(session.dates) as string[]) : null,
      voteCount: session.vote_count,
      voteMode: session.vote_mode as VoteMode,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
      votes
    };
  },

  delete: (sessionId: string): Database.RunResult => {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    return stmt.run(sessionId);
  },

  addVote: (
    sessionId: string,
    voterId: string,
    voterName: string,
    choices: string[],
    dates: string[] | null
  ): void => {
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

  hasVoted: (sessionId: string, voterId: string): boolean => {
    const stmt = db.prepare('SELECT 1 FROM votes WHERE session_id = ? AND voter_id = ?');
    return stmt.get(sessionId, voterId) !== undefined;
  }
};

initializeDatabase();

cleanupExpiredSessions();

setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000);

export { db, cleanupExpiredSessions };
