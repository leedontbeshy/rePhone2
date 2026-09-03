export const BROWSER_RESET_ACCOUNT = {
  email: 'browser-reset@rephone.local',
  oldPassword: 'BrowserReset123',
  newPassword: 'BrowserResetDone123',
  token: 'browser-reset-token-with-at-least-256-bits-0001',
} as const;

export const BROWSER_INVITATION_ACCOUNT = {
  email: 'browser-invitation@rephone.local',
  password: 'BrowserInvite123',
  token: 'browser-invitation-token-with-at-least-256-bits-0001',
} as const;

export const BROWSER_COMMERCE_ACCOUNT = {
  email: 'browser-commerce@rephone.local',
  password: 'BrowserCommerce123',
} as const;
