export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
