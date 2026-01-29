import { Session } from './session';

export interface ClientToServerEvents {
  joinSession: (sessionId: string) => void;
}

export interface ServerToClientEvents {
  sessionUpdate: (session: Session) => void;
}

export interface SocketData {
  sessionId?: string;
}
