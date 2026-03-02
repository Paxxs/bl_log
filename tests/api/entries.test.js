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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-log-entry-'));
  const app = createApp({ dataDir: dir });
  resources.push({ app, dir });
  return app;
}

describe('entries api', () => {
  it('creates an entry and finds it by keyword and note text', async () => {
    const app = newApp();

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'O 排骨汤 -WSC6688-',
      noteText: '五耳鱼520a365tmm激发态',
      iconPath: null,
      images: []
    });

    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const byKeyword = await request(app).get('/api/search').query({ q: 'WSC6688' });
    expect(byKeyword.status).toBe(200);
    expect(byKeyword.body.items.some((item) => item.id === id)).toBe(true);

    const byText = await request(app).get('/api/search').query({ q: '520a365' });
    expect(byText.status).toBe(200);
    const item = byText.body.items.find((x) => x.id === id);
    expect(item).toBeTruthy();
    expect(item.iconUrl).toBe('/assets/default-icon.svg');
  });

  it('supports optional icon and content images in entry detail', async () => {
    const app = newApp();

    const iconRes = await request(app)
      .post('/api/upload/icon')
      .attach('file', pngBuffer, 'icon.png');
    const imageRes = await request(app)
      .post('/api/upload/image')
      .attach('file', pngBuffer, 'note.png');

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'with-media',
      noteText: 'entry',
      iconPath: iconRes.body.path,
      images: [imageRes.body.path]
    });

    const detail = await request(app).get(`/api/entries/${createRes.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.iconPath).toBe(iconRes.body.path);
    expect(detail.body.images).toEqual([imageRes.body.path]);
  });

  it('stores custom fields and searches only by field value', async () => {
    const app = newApp();

    const imageRes = await request(app)
      .post('/api/upload/image')
      .attach('file', pngBuffer, 'field.png');

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'custom-entry',
      noteText: 'note-without-keyword',
      iconPath: null,
      images: [],
      fields: [
        { key: 'wechat_id', type: 'text', textValue: 'WSC6688' },
        { key: 'profile_qr', type: 'image', imagePath: imageRes.body.path }
      ]
    });
    expect(createRes.status).toBe(201);

    const detail = await request(app).get(`/api/entries/${createRes.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.fields).toEqual([
      { key: 'wechat_id', type: 'text', textValue: 'WSC6688', imagePath: null },
      { key: 'profile_qr', type: 'image', textValue: null, imagePath: imageRes.body.path }
    ]);

    const byFieldValue = await request(app).get('/api/search').query({ q: 'WSC6688' });
    expect(byFieldValue.status).toBe(200);
    expect(byFieldValue.body.items.some((item) => item.id === createRes.body.id)).toBe(true);

    const byFieldKey = await request(app).get('/api/search').query({ q: 'wechat_id' });
    expect(byFieldKey.status).toBe(200);
    expect(byFieldKey.body.items.some((item) => item.id === createRes.body.id)).toBe(false);
  });

  it('does not persist empty default wechat_id text field', async () => {
    const app = newApp();

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'empty-wechat',
      noteText: 'note',
      iconPath: null,
      images: [],
      fields: [{ key: 'wechat_id', type: 'text', textValue: '' }]
    });
    expect(createRes.status).toBe(201);

    const detail = await request(app).get(`/api/entries/${createRes.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.fields).toEqual([]);
  });

  it('updates custom fields and removes previous search value', async () => {
    const app = newApp();

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'update-fields',
      noteText: 'note',
      iconPath: null,
      images: [],
      fields: [{ key: 'wechat_id', type: 'text', textValue: 'old-field-value' }]
    });
    expect(createRes.status).toBe(201);

    const updateRes = await request(app).put(`/api/entries/${createRes.body.id}`).send({
      fields: [{ key: 'wechat_id', type: 'text', textValue: 'new-field-value' }]
    });
    expect(updateRes.status).toBe(200);

    const oldSearch = await request(app).get('/api/search').query({ q: 'old-field-value' });
    const newSearch = await request(app).get('/api/search').query({ q: 'new-field-value' });

    expect(oldSearch.body.items.some((item) => item.id === createRes.body.id)).toBe(false);
    expect(newSearch.body.items.some((item) => item.id === createRes.body.id)).toBe(true);
  });

  it('rejects custom image field with invalid path', async () => {
    const app = newApp();

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'invalid-image-field',
      noteText: 'note',
      iconPath: null,
      images: [],
      fields: [{ key: 'bad', type: 'image', imagePath: '../a.png' }]
    });
    expect(createRes.status).toBe(400);
  });

  it('updates then deletes an entry', async () => {
    const app = newApp();

    const createRes = await request(app).post('/api/entries').send({
      keyword: 'k1',
      noteText: 't1',
      iconPath: null,
      images: []
    });

    const id = createRes.body.id;

    const updateRes = await request(app).put(`/api/entries/${id}`).send({
      keyword: 'k2',
      noteText: 't2',
      iconPath: null,
      images: []
    });
    expect(updateRes.status).toBe(200);

    const detail = await request(app).get(`/api/entries/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.keyword).toBe('k2');

    const deleteRes = await request(app).delete(`/api/entries/${id}`);
    expect(deleteRes.status).toBe(200);

    const afterDelete = await request(app).get(`/api/entries/${id}`);
    expect(afterDelete.status).toBe(404);
  });
});
