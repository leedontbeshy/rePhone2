import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Buffer } from 'node:buffer';

export type IdentifierType = 'IMEI' | 'SERIAL' | 'EID';

export interface ProtectedIdentifier {
  encrypted: string;
  hmac: string;
  suffix: string;
  keyVersion: 1;
}

export class IdentifierValidationError extends Error {
  public constructor(public readonly identifierType: IdentifierType) {
    super(`Invalid ${identifierType} identifier`);
    this.name = 'IdentifierValidationError';
  }
}

export class IdentifierCodec {
  private readonly encryptionKey: Buffer;
  private readonly hmacKey: Buffer;

  public constructor(encryptionKeyBase64: string, hmacKeyBase64: string) {
    this.encryptionKey = Buffer.from(encryptionKeyBase64, 'base64');
    this.hmacKey = Buffer.from(hmacKeyBase64, 'base64');
    if (this.encryptionKey.length !== 32 || this.hmacKey.length < 32) {
      throw new TypeError('Identifier keys do not satisfy the configured key sizes');
    }
    if (
      this.encryptionKey.length === this.hmacKey.length &&
      timingSafeEqual(this.encryptionKey, this.hmacKey)
    ) {
      throw new TypeError('Identifier encryption and HMAC keys must differ');
    }
  }

  public protect(type: IdentifierType, plaintext: string): ProtectedIdentifier {
    const normalized = normalizeIdentifier(type, plaintext);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      encrypted: Buffer.concat([nonce, ciphertext, tag]).toString('base64url'),
      hmac: this.lookupHmac(type, normalized),
      suffix: normalized.slice(-4),
      keyVersion: 1,
    };
  }

  public lookupHmac(type: IdentifierType, plaintext: string): string {
    const normalized = normalizeIdentifier(type, plaintext);
    return createHmac('sha256', this.hmacKey).update(`${type}:${normalized}`, 'utf8').digest('hex');
  }

  public decrypt(encrypted: string, keyVersion: number): string {
    if (keyVersion !== 1) {
      throw new TypeError(`Unsupported identifier key version ${keyVersion.toString()}`);
    }
    if (encrypted.startsWith('v1:')) {
      return this.decryptLegacy(encrypted);
    }
    const envelope = Buffer.from(encrypted, 'base64url');
    if (envelope.length < 29) {
      throw new TypeError('Identifier envelope is malformed');
    }
    const nonce = envelope.subarray(0, 12);
    const ciphertext = envelope.subarray(12, -16);
    const tag = envelope.subarray(-16);
    return this.decryptParts(nonce, ciphertext, tag);
  }

  private decryptLegacy(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new TypeError('Legacy identifier envelope is malformed');
    }
    const nonce = Buffer.from(parts[1] ?? '', 'base64url');
    const tag = Buffer.from(parts[2] ?? '', 'base64url');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new TypeError('Legacy identifier envelope is malformed');
    }
    return this.decryptParts(nonce, ciphertext, tag);
  }

  private decryptParts(nonce: Buffer, ciphertext: Buffer, tag: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}

export function normalizeIdentifier(type: IdentifierType, plaintext: string): string {
  let normalized: string;
  switch (type) {
    case 'IMEI':
      normalized = plaintext.replace(/[\s-]+/g, '');
      if (!/^\d{15}$/.test(normalized) || !hasValidLuhnCheckDigit(normalized)) {
        throw new IdentifierValidationError(type);
      }
      return normalized;
    case 'EID':
      normalized = plaintext.replace(/\s+/g, '');
      if (!/^\d{32}$/.test(normalized)) {
        throw new IdentifierValidationError(type);
      }
      return normalized;
    case 'SERIAL':
      normalized = plaintext.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9]{6,32}$/.test(normalized)) {
        throw new IdentifierValidationError(type);
      }
      return normalized;
  }
}

export function hasValidLuhnCheckDigit(value: string): boolean {
  let sum = 0;
  let doubleDigit = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index];
    if (character === undefined) {
      return false;
    }
    let digit = Number(character);
    if (!Number.isInteger(digit)) {
      return false;
    }
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function maskIdentifier(suffix: string): string {
  return `•••• ${suffix}`;
}
