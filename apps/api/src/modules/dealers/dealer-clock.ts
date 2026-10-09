import type { Prisma } from '../../generated/prisma/client.js';
/** Evaluate holds using database time, independent of application host clock drift. */
export async function dealerNow(tx: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<Date> {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (row === undefined) throw new Error('Database clock unavailable');
  return row.now;
}
