import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

export interface SafeUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  phone: string | null;
}

export interface SessionPayload {
  accessToken: string;
  expiresIn: number;
  user: SafeUser;
}

export interface SessionIssueResult extends SessionPayload {
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RequestMetadata {
  ipAddress: string;
  userAgent?: string;
}
