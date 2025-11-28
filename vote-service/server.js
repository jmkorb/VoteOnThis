// server.js
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Vite default port
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage (replace with DB later)
const sessions = new Map();

// Generate session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2, 9);
}

// Create session
app.post('/api/sessions', (req, res) => {
  const { question, options, dates, voteCount } = req.body;
  
  if (!question || !options || options.length < voteCount) {
    console.log(req.body);
    return res.status(400).json({ error: 'Invalid session data' });
  }

  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    question,
    options,
    dates: dates || null,
    votes: {},
    createdAt: Date.now(),
    voteCount
  };

  sessions.set(sessionId, session);
  res.json({ sessionId, session });
});

// Get session
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// Submit vote
app.post('/api/sessions/:sessionId/vote', (req, res) => {
  const { sessionId } = req.params;
  const { voterName, choices, dates, voterId, voteMode, voteCount } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (voteMode == 'exactly' && voteCount != choices.length ) {
    return res.status(400).json({ error: `Must select exactly ${voteCount} option(s)` });
  }
  else if (voteMode == 'minimum' && choices.length < voteCount) {
    return res.status(400).json({ error: `Must select exactly ${voteCount} option(s)` });
  }
  else if (voteMode == 'maximum' && choices.length > voteCount) {
    return res.status(400).json({ error: `Can only select up ${voteCount} option(s)` });
  }

  // Check if voter already voted
  if (session.votes[voterId]) {
    return res.status(400).json({ error: 'Looks like you already voted' });
  }

  // Validate dates if session requires them
  if (session.dates && (!dates || dates.length === 0)) {
    return res.status(400).json({ error: 'Must select at least one date' });
  }

  session.votes[voterId] = {
    name: voterName,
    choices,
    dates: dates || null,
    timestamp: Date.now()
  };

  // Emit update to all connected clients
  io.to(sessionId).emit('sessionUpdate', session);

  res.json(session);
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join session room
  socket.on('joinSession', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});