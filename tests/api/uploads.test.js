import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAGgwJ/l4fU2QAAAABJRU5ErkJggg==',
  'base64'
);

const resources = [];

afterEach(() => {
  for (const { app, dir } of resources.splice(0)) {
    app.locals.close?.();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function newApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-log-upload-'));
  const app = createApp({ dataDir: dir });
  resources.push({ app, dir });
  return app;
}

describe('upload api', () => {
  it('rejects non-image uploads', async () => {
    const app = newApp();

    const res = await request(app)
      .post('/api/upload/icon')
      .attach('file', Buffer.from('hello'), 'note.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image/i);
  });

  it('stores image uploads and returns a relative path', async () => {
    const app = newApp();

    const res = await request(app)
      .post('/api/upload/image')
      .attach('file', pngBuffer, 'sample.png');

    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^images\/.+\.png$/);
  });
});
