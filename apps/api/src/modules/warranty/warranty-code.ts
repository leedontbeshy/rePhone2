import { randomBytes } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';

const WARRANTY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateWarrantyCode(now: Date, timezone: string): string {
  const date = businessDate(now, timezone);
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, (byte) => WARRANTY_ALPHABET[byte & 31]).join('');
  return `RPH-W-${date}-${suffix}`;
}

function businessDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  if (values.year === undefined || values.month === undefined || values.day === undefined) {
    throw new ApiError('INTERNAL_ERROR');
  }
  return `${values.year}${values.month}${values.day}`;
}
