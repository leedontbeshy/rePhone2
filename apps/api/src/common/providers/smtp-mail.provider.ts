import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../../config/app-config.js';
import type { MailMessage, MailProvider } from './mail-provider.js';

export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;

  public constructor(private readonly config: AppConfig['mail']) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      ...(config.user === undefined
        ? {}
        : { auth: { user: config.user, pass: config.password as string } }),
    });
  }

  public async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export class NoopMailProvider implements MailProvider {
  public send(message: MailMessage): Promise<void> {
    void message;
    return Promise.resolve();
  }
}
