import type { AuthContext } from '../modules/auth/auth-context.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
