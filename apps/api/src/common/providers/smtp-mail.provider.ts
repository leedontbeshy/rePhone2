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

  public async probe(): Promise<'available'> {
    await this.transporter.verify();
    return 'available';
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
  public probe(): Promise<'not-configured'> {
    return Promise.resolve('not-configured');
  }

  public send(message: MailMessage): Promise<void> {
    void message;
    return Promise.resolve();
  }
}

export class MailDisabledError extends Error {
  public constructor() {
    super('Email is disabled for this demo.');
    this.name = 'MailDisabledError';
  }
}

export class DisabledMailProvider implements MailProvider {
  public probe(): Promise<'not-configured'> {
    return Promise.resolve('not-configured');
  }

  public send(message: MailMessage): Promise<void> {
    void message;
    return Promise.reject(new MailDisabledError());
  }
}
