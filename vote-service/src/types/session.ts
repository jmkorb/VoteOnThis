export type VoteMode = 'exactly' | 'minimum' | 'maximum';

export interface Session {
  id: string;
  question: string;
  options: string[];
  dates: string[] | null;
  voteCount: number;
  voteMode: VoteMode;
  anonymousMode: boolean;
  revealed: boolean;
  creatorId: string | null;
  createdAt: number;
  expiresAt: number;
  votes: Record<string, Vote>;
}

export interface Vote {
  name: string;
  choices: string[];
  dates: string[] | null;
  timestamp: number;
}

export interface SessionRow {
  id: string;
  question: string;
  options: string;
  dates: string | null;
  vote_count: number;
  vote_mode: string;
  anonymous_mode: number;
  revealed: number;
  creator_id: string | null;
  created_at: number;
  expires_at: number;
}

export interface VoteRow {
  id: number;
  session_id: string;
  voter_id: string;
  voter_name: string;
  choices: string;
  dates: string | null;
  timestamp: number;
}

export interface CreateSessionRequest {
  question: string;
  options: string[];
  dates?: string[];
  voteCount: number;
  voteMode: VoteMode;
  anonymousMode?: boolean;
  creatorId?: string;
}

export interface SubmitVoteRequest {
  voterName: string;
  choices: string[];
  dates?: string[];
  voterId: string;
  voteMode: VoteMode;
  voteCount: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  session: Session;
}

export interface ErrorResponse {
  error: string;
}
