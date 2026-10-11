import pg from 'pg';

const closingConnections = new WeakMap<pg.Pool, Set<Promise<void>>>();

/** Track physical connections, including ones already removed from the pool. */
export function createTestPool(config: pg.PoolConfig): pg.Pool {
  const pool = new pg.Pool(config);
  const pending = new Set<Promise<void>>();
  closingConnections.set(pool, pending);
  pool.on('connect', client => {
    const closed = new Promise<void>(resolve => client.once('end', resolve));
    pending.add(closed);
    void closed.then(() => pending.delete(closed));
  });
  return pool;
}

/** pg-pool can resolve end() before its removed clients finish disconnecting. */
export async function closeTestPool(pool: pg.Pool): Promise<void> {
  const pending = closingConnections.get(pool);
  if (!pending) throw new Error('Test pool must be created with createTestPool');
  await pool.end();
  await Promise.all([...pending]);
}
