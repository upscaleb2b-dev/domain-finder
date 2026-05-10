import { Redis } from '@upstash/redis';

function stripQuotes(s: string) {
  return s.replace(/^["']|["']$/g, '').trim();
}

let _kv: Redis | null = null;

function getKv(): Redis {
  if (!_kv) {
    _kv = new Redis({
      url: stripQuotes(process.env.UPSTASH_REDIS_REST_URL || ''),
      token: stripQuotes(process.env.UPSTASH_REDIS_REST_TOKEN || ''),
    });
  }
  return _kv;
}

// Proxy so call-sites can still use `kv.get(...)` unchanged
export const kv = new Proxy({} as Redis, {
  get(_target, prop) {
    return (getKv() as any)[prop];
  },
});
