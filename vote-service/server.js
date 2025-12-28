const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { sessionOps } = require('./database');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));
app.use(express.json());

function generateSessionId() {
  return Math.random().toString(36).substring(2, 9);
}

// Create session
app.post('/api/sessions', (req, res) => {
  const { question, options, dates, voteCount, voteMode } = req.body;
  
  if (!question) {
    console.log(req.body);
    return res.status(400).json({ error: 'No question to vote on' });
  }
  
  if (!options) {
    console.log(req.body);
    return res.status(400).json({ error: 'No options to vote on' });
  } else if (options.length < voteCount) {
    console.log(req.body);
    return res.status(400).json({ error: 'Not enough options to vote on' });
  }
  
  try {
    const sessionId = generateSessionId();
    const session = sessionOps.create(sessionId, question, options, dates, voteCount, voteMode);
    
    session.votes = {};
    
    res.json({ sessionId, session });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const session = sessionOps.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Submit vote
app.post('/api/sessions/:sessionId/vote', (req, res) => {
  const { sessionId } = req.params;
  const { voterName, choices, dates, voterId, voteMode, voteCount } = req.body;
  
  try {
    const session = sessionOps.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (voteMode === 'exactly' && voteCount !== choices.length) {
      return res.status(400).json({ error: `Must select exactly ${voteCount} option(s)` });
    } else if (voteMode === 'minimum' && choices.length < voteCount) {
      return res.status(400).json({ error: `Must select at least ${voteCount} option(s)` });
    } else if (voteMode === 'maximum' && choices.length > voteCount) {
      return res.status(400).json({ error: `Can only select up to ${voteCount} option(s)` });
    }
    
    // Check if voter already voted
    if (sessionOps.hasVoted(sessionId, voterId)) {
      return res.status(400).json({ error: 'Looks like you already voted' });
    }
    
    // Validate dates if session requires them
    if (session.dates && (!dates || dates.length === 0)) {
      return res.status(400).json({ error: 'Must select at least one date' });
    }
    
    // Add vote to database
    sessionOps.addVote(sessionId, voterId, voterName, choices, dates);
    
    // Get updated session with all votes
    const updatedSession = sessionOps.get(sessionId);
    
    // Emit update to all connected clients
    io.to(sessionId).emit('sessionUpdate', updatedSession);
    
    res.json(updatedSession);
  } catch (error) {
    console.error('Error submitting vote:', error);
    
    // Check for unique constraint violation (duplicate vote)
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Looks like you already voted' });
    }
    
    res.status(500).json({ error: 'Failed to submit vote' });
  }
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