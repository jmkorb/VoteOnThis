import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { sessionOps } from './database';
import {
  Session,
  CreateSessionRequest,
  CreateSessionResponse,
  SubmitVoteRequest,
  ErrorResponse
} from './types/session';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData
} from './types/socket';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));
app.use(express.json());

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 9);
}

app.post('/api/sessions', (
  req: Request<{}, CreateSessionResponse | ErrorResponse, CreateSessionRequest>,
  res: Response<CreateSessionResponse | ErrorResponse>
) => {
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
    const sessionId: string = generateSessionId();
    const session: Session = sessionOps.create(sessionId, question, options, dates || null, voteCount, voteMode);

    session.votes = {};

    res.json({ sessionId, session });
  } catch (error: unknown) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/sessions/:sessionId', (
  req: Request<{ sessionId: string }, Session | ErrorResponse>,
  res: Response<Session | ErrorResponse>
) => {
  const { sessionId } = req.params;

  try {
    const session: Session | null = sessionOps.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error: unknown) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

app.post('/api/sessions/:sessionId/vote', (
  req: Request<{ sessionId: string }, Session | ErrorResponse, SubmitVoteRequest>,
  res: Response<Session | ErrorResponse>
) => {
  const { sessionId } = req.params;
  const { voterName, choices, dates, voterId, voteMode, voteCount } = req.body;

  try {
    const session: Session | null = sessionOps.get(sessionId);

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

    if (sessionOps.hasVoted(sessionId, voterId)) {
      return res.status(400).json({ error: 'Looks like you already voted' });
    }

    if (session.dates && (!dates || dates.length === 0)) {
      return res.status(400).json({ error: 'Must select at least one date' });
    }

    sessionOps.addVote(sessionId, voterId, voterName, choices, dates || null);

    const updatedSession: Session | null = sessionOps.get(sessionId);

    if (!updatedSession) {
      return res.status(500).json({ error: 'Failed to retrieve updated session' });
    }

    io.to(sessionId).emit('sessionUpdate', updatedSession);

    res.json(updatedSession);
  } catch (error: unknown) {
    console.error('Error submitting vote:', error);

    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Looks like you already voted' });
    }

    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinSession', (sessionId: string) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT: number = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
