import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const resources = [];

afterEach(() => {
  for (const { app, dir } of resources.splice(0)) {
    app.locals.close?.();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function newApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-log-ui-'));
  const app = createApp({ dataDir: dir });
  resources.push({ app, dir });
  return app;
}

describe('web ui', () => {
  it('serves the index page with search input', async () => {
    const app = newApp();
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="keyword-search-input"');
    expect(res.text).toContain('id="custom-fields-list"');
    expect(res.text).toContain('data-default-field="wechat_id"');
  });
});
