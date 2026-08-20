import type { UserRole } from '../../generated/prisma/enums.js';

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
}
