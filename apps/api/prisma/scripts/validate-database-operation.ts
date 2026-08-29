import { databaseUrlSecurityIssue } from '../../src/config/database-url-security.js';
import { loadWorkspaceEnvironment } from '../../src/config/load-environment.js';

loadWorkspaceEnvironment();

const connectionString = requiredEnvironment('DIRECT_URL');
const securityIssue = databaseUrlSecurityIssue(connectionString, {
  allowUnencryptedLoopback: true,
  allowUnencryptedHostnames: process.env.NODE_ENV === 'test' ? ['postgres-test'] : [],
  requireCertificateVerification: process.env.NODE_ENV === 'production',
});
if (securityIssue !== undefined) {
  throw new Error(`DIRECT_URL ${securityIssue}; database operation did not connect`);
}

process.stdout.write(`${JSON.stringify({ databaseOperationConnection: 'accepted' })}\n`);

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for database operations`);
  }
  return value;
}
