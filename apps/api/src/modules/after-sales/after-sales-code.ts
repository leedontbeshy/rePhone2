import { randomBytes } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';

const AFTER_SALES_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateAfterSalesRequestNumber(now: Date, timezone: string): string {
  const date = businessDate(now, timezone);
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes, (byte) => AFTER_SALES_ALPHABET[byte & 31]).join('');
  return `RPH-AS-${date}-${suffix}`;
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
