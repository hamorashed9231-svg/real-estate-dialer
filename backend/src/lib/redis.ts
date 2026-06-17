import { EventEmitter } from 'events';

const store = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const subscribers = new Set<{
  instance: MockRedis;
  channels: Set<string>;
}>();

class MockRedis extends EventEmitter {
  constructor() {
    super();
    process.nextTick(() => {
      this.emit('connect');
    });
  }

  async get(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK' | null> {
    const nx = args.includes('NX');
    if (nx && store.has(key)) {
      return null;
    }
    store.set(key, value);
    
    const exIdx = args.indexOf('EX');
    if (exIdx !== -1 && exIdx + 1 < args.length) {
      const expiry = parseInt(args[exIdx + 1], 10);
      if (!isNaN(expiry)) {
        setTimeout(() => {
          store.delete(key);
        }, expiry * 1000);
      }
    }
    return 'OK';
  }

  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let deleted = 0;
    keys.forEach((k) => {
      if (store.has(k) || sets.has(k)) {
        store.delete(k);
        sets.delete(k);
        deleted++;
      }
    });
    return deleted;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!sets.has(key)) {
      sets.set(key, new Set());
    }
    const set = sets.get(key)!;
    let added = 0;
    members.forEach((m) => {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    });
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (!sets.has(key)) return 0;
    const set = sets.get(key)!;
    let removed = 0;
    members.forEach((m) => {
      if (set.delete(m)) {
        removed++;
      }
    });
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    if (!sets.has(key)) return [];
    return Array.from(sets.get(key)!);
  }

  async keys(pattern: string): Promise<string[]> {
    const regexStr = pattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);
    
    const matchedKeys: string[] = [];
    for (const key of store.keys()) {
      if (regex.test(key)) {
        matchedKeys.push(key);
      }
    }
    for (const key of sets.keys()) {
      if (regex.test(key) && !matchedKeys.includes(key)) {
        matchedKeys.push(key);
      }
    }
    return matchedKeys;
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => store.get(k) ?? null);
  }

  async incr(key: string): Promise<number> {
    const valStr = store.get(key);
    let val = valStr ? parseInt(valStr, 10) : 0;
    if (isNaN(val)) val = 0;
    val++;
    store.set(key, val.toString());
    return val;
  }

  async publish(channel: string, message: string): Promise<number> {
    let count = 0;
    for (const sub of subscribers) {
      if (sub.channels.has(channel)) {
        sub.instance.emit('message', channel, message);
        count++;
      }
    }
    return count;
  }

  async subscribe(...channels: string[]): Promise<void> {
    let sub = Array.from(subscribers).find((s) => s.instance === this);
    if (!sub) {
      sub = { instance: this, channels: new Set() };
      subscribers.add(sub);
    }
    channels.forEach((c) => sub!.channels.add(c));
  }

  async unsubscribe(...channels: string[]): Promise<void> {
    const sub = Array.from(subscribers).find((s) => s.instance === this);
    if (sub) {
      if (channels.length === 0) {
        sub.channels.clear();
      } else {
        channels.forEach((c) => sub.channels.delete(c));
      }
    }
  }

  async quit(): Promise<string> {
    const sub = Array.from(subscribers).find((s) => s.instance === this);
    if (sub) {
      subscribers.delete(sub);
    }
    return 'OK';
  }

  duplicate(): MockRedis {
    return new MockRedis();
  }
}

const redis = new MockRedis();
export default redis;
