export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailProvider {
  probe?(): Promise<'available' | 'not-configured'>;
  send(message: MailMessage): Promise<void>;
}
