import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client.js';
import { initDb } from '../../src/db/init.js';

const dbFile = path.join(process.cwd(), 'tmp', 'init-test.db');

afterEach(() => {
  fs.rmSync(dbFile, { force: true });
});

describe('initDb', () => {
  it('creates required tables', () => {
    initDb(dbFile);
    const db = getDb(dbFile);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);

    expect(tables).toContain('entries');
    expect(tables).toContain('entry_images');
    expect(tables).toContain('entry_fields');
  });
});
