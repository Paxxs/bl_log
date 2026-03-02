# Local Keyword Notes Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Node.js web app that stores keyword-based notes with text, optional icon image, and multiple content images, and supports searching by keyword and note body content.

**Architecture:** Use an Express server for API + static page hosting, SQLite single-file storage for metadata, and local filesystem directories for icon/content images. Implement strict TDD per task (failing test -> minimal code -> passing test -> commit), then run final verification before completion.

**Tech Stack:** Node.js 22, Express, better-sqlite3, multer, Vitest, Supertest, vanilla HTML/CSS/JS, SQLite (`data/app.db`).

---

**Execution discipline:** `@test-driven-development`, `@verification-before-completion`, `@systematic-debugging`.

### Task 1: Bootstrap service and health endpoint

**Files:**
- Create: `package.json`
- Create: `src/app.js`
- Create: `src/server.js`
- Create: `.gitignore`
- Test: `tests/api/health.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/health.test.js`
Expected: FAIL with module/file not found for `src/app.js`.

**Step 3: Write minimal implementation**

```js
// src/app.js
import express from 'express';

export function createApp() {
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
```

```js
// src/server.js
import { createApp } from './app.js';

const app = createApp();
app.listen(3000, '127.0.0.1', () => {
  console.log('listening on http://127.0.0.1:3000');
});
```

```json
// package.json
{
  "name": "bl-log",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.21.2"
  },
  "devDependencies": {
    "supertest": "^7.1.1",
    "vitest": "^3.2.4"
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/health.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json src/app.js src/server.js .gitignore tests/api/health.test.js
git commit -m "chore: bootstrap express app with health endpoint"
```

### Task 2: Add SQLite initialization and schema

**Files:**
- Create: `src/db/client.js`
- Create: `src/db/init.js`
- Modify: `src/app.js`
- Test: `tests/db/init.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initDb } from '../../src/db/init.js';
import { getDb } from '../../src/db/client.js';

describe('db init', () => {
  it('creates entries and entry_images tables', () => {
    const dbFile = path.join(process.cwd(), 'tmp', 'init-test.db');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    initDb(dbFile);
    const db = getDb(dbFile);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toContain('entries');
    expect(tables).toContain('entry_images');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/db/init.test.js`
Expected: FAIL with missing `better-sqlite3` and db modules.

**Step 3: Write minimal implementation**

```js
// src/db/client.js
import Database from 'better-sqlite3';

export function getDb(filePath) {
  return new Database(filePath);
}
```

```js
// src/db/init.js
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './client.js';

export function initDb(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = getDb(filePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      keyword TEXT NOT NULL,
      note_text TEXT NOT NULL,
      icon_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entry_images (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );
  `);
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/db/init.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json src/db/client.js src/db/init.js tests/db/init.test.js
git commit -m "feat: initialize sqlite schema for entries and images"
```

### Task 3: Implement repository layer (entry CRUD + image relations)

**Files:**
- Create: `src/repositories/entriesRepo.js`
- Test: `tests/repositories/entriesRepo.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { createEntriesRepo } from '../../src/repositories/entriesRepo.js';
import { getDb } from '../../src/db/client.js';
import { initDb } from '../../src/db/init.js';

describe('entries repository', () => {
  it('creates and fetches entry with images', () => {
    const file = 'tmp/repo-test.db';
    initDb(file);
    const db = getDb(file);
    const repo = createEntriesRepo(db);

    const id = repo.createEntry({
      keyword: 'O 排骨汤 -WSC6688-',
      noteText: '五耳鱼520a365tmm激发态',
      iconPath: null,
      images: ['images/a.png']
    });

    const row = repo.getEntryById(id);
    expect(row.keyword).toBe('O 排骨汤 -WSC6688-');
    expect(row.images).toEqual(['images/a.png']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/repositories/entriesRepo.test.js`
Expected: FAIL with missing repo functions.

**Step 3: Write minimal implementation**

```js
// src/repositories/entriesRepo.js
export function createEntriesRepo(db) {
  const insertEntry = db.prepare(`
    INSERT INTO entries (keyword, note_text, icon_path, created_at, updated_at)
    VALUES (@keyword, @note_text, @icon_path, @created_at, @updated_at)
  `);
  const insertImage = db.prepare(`
    INSERT INTO entry_images (entry_id, image_path, sort_order)
    VALUES (?, ?, ?)
  `);

  return {
    createEntry({ keyword, noteText, iconPath, images }) {
      const now = new Date().toISOString();
      const info = insertEntry.run({
        keyword,
        note_text: noteText,
        icon_path: iconPath,
        created_at: now,
        updated_at: now
      });
      images.forEach((p, idx) => insertImage.run(info.lastInsertRowid, p, idx));
      return Number(info.lastInsertRowid);
    },

    getEntryById(id) {
      const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
      if (!entry) return null;
      const images = db
        .prepare('SELECT image_path FROM entry_images WHERE entry_id = ? ORDER BY sort_order ASC')
        .all(id)
        .map((r) => r.image_path);
      return {
        id: entry.id,
        keyword: entry.keyword,
        noteText: entry.note_text,
        iconPath: entry.icon_path,
        images
      };
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/repositories/entriesRepo.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/repositories/entriesRepo.js tests/repositories/entriesRepo.test.js
git commit -m "feat: add entries repository for create/read with images"
```

### Task 4: Add search repository methods and default icon fallback mapping

**Files:**
- Modify: `src/repositories/entriesRepo.js`
- Create: `src/services/searchService.js`
- Test: `tests/services/searchService.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { createSearchService } from '../../src/services/searchService.js';

describe('search service', () => {
  it('returns default icon when entry has no icon', () => {
    const repo = {
      searchEntries: () => [{ id: 1, keyword: 'abc', noteText: 'text', iconPath: null }]
    };
    const service = createSearchService({ repo, defaultIconUrl: '/assets/default-icon.svg' });
    const rows = service.search('abc');
    expect(rows[0].iconUrl).toBe('/assets/default-icon.svg');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/services/searchService.test.js`
Expected: FAIL with missing search service.

**Step 3: Write minimal implementation**

```js
// src/services/searchService.js
export function createSearchService({ repo, defaultIconUrl }) {
  return {
    search(q) {
      return repo.searchEntries(q).map((row) => ({
        ...row,
        iconUrl: row.iconPath || defaultIconUrl
      }));
    }
  };
}
```

```js
// add to src/repositories/entriesRepo.js
searchEntries(q) {
  const term = `%${q}%`;
  return db
    .prepare(`
      SELECT id, keyword, note_text, icon_path, updated_at
      FROM entries
      WHERE keyword LIKE ? OR note_text LIKE ?
      ORDER BY updated_at DESC
      LIMIT 20
    `)
    .all(term, term)
    .map((r) => ({
      id: r.id,
      keyword: r.keyword,
      noteText: r.note_text,
      iconPath: r.icon_path
    }));
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/services/searchService.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/repositories/entriesRepo.js src/services/searchService.js tests/services/searchService.test.js
git commit -m "feat: add keyword/body search service with default icon mapping"
```

### Task 5: Implement upload storage utility and upload routes

**Files:**
- Create: `src/services/fileStorage.js`
- Create: `src/routes/uploads.js`
- Modify: `src/app.js`
- Test: `tests/api/uploads.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('upload api', () => {
  it('rejects non-image files', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/upload/icon')
      .attach('file', Buffer.from('hello'), 'a.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/uploads.test.js`
Expected: FAIL because route not implemented.

**Step 3: Write minimal implementation**

```js
// src/services/fileStorage.js
import fs from 'node:fs';
import path from 'node:path';

export const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export function ensureStorageDirs() {
  fs.mkdirSync('data/icons', { recursive: true });
  fs.mkdirSync('data/images', { recursive: true });
}

export function validateImageName(name) {
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXT.has(ext);
}
```

```js
// src/routes/uploads.js
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { validateImageName } from '../services/fileStorage.js';

const upload = multer({ storage: multer.memoryStorage() });

export function createUploadRouter() {
  const router = express.Router();

  router.post('/icon', upload.single('file'), (req, res) => {
    if (!req.file || !validateImageName(req.file.originalname)) {
      return res.status(400).json({ error: 'Only image files are allowed.' });
    }
    return res.json({ path: path.join('icons', `${Date.now()}-${req.file.originalname}`) });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/uploads.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/fileStorage.js src/routes/uploads.js src/app.js tests/api/uploads.test.js
git commit -m "feat: add image upload validation endpoints"
```

### Task 6: Implement create entry API (with transaction)

**Files:**
- Create: `src/routes/entries.js`
- Modify: `src/repositories/entriesRepo.js`
- Modify: `src/app.js`
- Test: `tests/api/create-entry.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('POST /api/entries', () => {
  it('creates an entry and returns id', async () => {
    const app = createApp();
    const res = await request(app).post('/api/entries').send({
      keyword: 'O 排骨汤 -WSC6688-',
      noteText: '五耳鱼520a365tmm激发态',
      iconPath: null,
      images: []
    });

    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('number');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/create-entry.test.js`
Expected: FAIL with missing route.

**Step 3: Write minimal implementation**

```js
// src/routes/entries.js (create route)
router.post('/', (req, res) => {
  const { keyword, noteText, iconPath = null, images = [] } = req.body;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const id = repo.createEntry({
    keyword: keyword.trim(),
    noteText: noteText ?? '',
    iconPath,
    images
  });

  return res.status(201).json({ id });
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/create-entry.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/entries.js src/repositories/entriesRepo.js src/app.js tests/api/create-entry.test.js
git commit -m "feat: add create entry api"
```

### Task 7: Implement search API and empty-query fallback

**Files:**
- Create: `src/routes/search.js`
- Modify: `src/repositories/entriesRepo.js`
- Modify: `src/app.js`
- Test: `tests/api/search.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /api/search', () => {
  it('searches by keyword and note text', async () => {
    const app = createApp();
    await request(app).post('/api/entries').send({
      keyword: 'O 排骨汤 -WSC6688-',
      noteText: '五耳鱼520a365tmm激发态',
      iconPath: null,
      images: []
    });

    const res = await request(app).get('/api/search').query({ q: '五耳鱼520a365' });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].keyword).toContain('排骨汤');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/search.test.js`
Expected: FAIL with missing endpoint.

**Step 3: Write minimal implementation**

```js
// src/routes/search.js
import express from 'express';

export function createSearchRouter({ searchService, repo }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const q = `${req.query.q ?? ''}`.trim();
    if (!q) {
      return res.json({ items: repo.listRecentEntries(20) });
    }
    return res.json({ items: searchService.search(q) });
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/search.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/search.js src/repositories/entriesRepo.js src/app.js tests/api/search.test.js
git commit -m "feat: add search endpoint for keyword and note content"
```

### Task 8: Implement update/delete entry API and file cleanup hooks

**Files:**
- Modify: `src/routes/entries.js`
- Create: `src/services/cleanupService.js`
- Modify: `src/repositories/entriesRepo.js`
- Test: `tests/api/update-delete-entry.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('entry update/delete', () => {
  it('updates and then deletes entry', async () => {
    const app = createApp();
    const createRes = await request(app).post('/api/entries').send({
      keyword: 'k1', noteText: 't1', iconPath: null, images: []
    });
    const id = createRes.body.id;

    const updateRes = await request(app).put(`/api/entries/${id}`).send({ keyword: 'k2', noteText: 't2' });
    expect(updateRes.status).toBe(200);

    const delRes = await request(app).delete(`/api/entries/${id}`);
    expect(delRes.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/update-delete-entry.test.js`
Expected: FAIL because update/delete handlers not complete.

**Step 3: Write minimal implementation**

```js
// in src/routes/entries.js
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = repo.updateEntry(id, req.body);
  if (!ok) return res.status(404).json({ error: 'not found' });
  return res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const deleted = repo.deleteEntry(id);
  if (!deleted) return res.status(404).json({ error: 'not found' });
  return res.json({ ok: true });
});
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/api/update-delete-entry.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/entries.js src/services/cleanupService.js src/repositories/entriesRepo.js tests/api/update-delete-entry.test.js
git commit -m "feat: add update and delete entry api"
```

### Task 9: Build minimal HTML UI (search list + editor)

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/styles.css`
- Create: `public/assets/default-icon.svg`
- Modify: `src/app.js`
- Test: `tests/ui/default-page.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('default page', () => {
  it('serves index html', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('keyword-search-input');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ui/default-page.test.js`
Expected: FAIL because static files are not mounted.

**Step 3: Write minimal implementation**

```html
<!-- public/index.html -->
<input id="keyword-search-input" placeholder="搜索关键词或正文" />
<div id="results"></div>
<form id="entry-form">
  <input id="keyword" required />
  <textarea id="noteText"></textarea>
  <input id="iconFile" type="file" accept="image/*" />
  <input id="imagesFile" type="file" accept="image/*" multiple />
  <button type="submit">保存</button>
</form>
<script src="/app.js" defer></script>
```

```js
// src/app.js snippet
app.use(express.static('public'));
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ui/default-page.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add public/index.html public/app.js public/styles.css public/assets/default-icon.svg src/app.js tests/ui/default-page.test.js
git commit -m "feat: add minimal local ui for search and editing"
```

### Task 10: Final verification and usage docs

**Files:**
- Create: `README.md`
- Modify: `package.json`
- Test: `tests/api/e2e-flow.test.js`

**Step 1: Write the failing test**

```js
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';

describe('e2e flow', () => {
  it('create -> search -> update -> delete', async () => {
    const app = createApp();

    const createRes = await request(app).post('/api/entries').send({ keyword: 'k', noteText: 'n', iconPath: null, images: [] });
    const id = createRes.body.id;

    const searchRes = await request(app).get('/api/search').query({ q: 'n' });
    expect(searchRes.body.items.some((x) => x.id === id)).toBe(true);

    await request(app).put(`/api/entries/${id}`).send({ keyword: 'k2', noteText: 'n2' });
    const delRes = await request(app).delete(`/api/entries/${id}`);
    expect(delRes.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/e2e-flow.test.js`
Expected: FAIL until all APIs are wired correctly.

**Step 3: Write minimal implementation/doc updates**

```md
# README.md
## Start
npm install
npm start

Open http://127.0.0.1:3000

## Test
npm test
```

Add scripts:

```json
"scripts": {
  "start": "node src/server.js",
  "test": "vitest run",
  "dev": "node --watch src/server.js"
}
```

**Step 4: Run full verification**

Run:
- `npm test`
- `npm start` then open `http://127.0.0.1:3000`

Expected:
- All tests PASS.
- UI can create/search/update/delete entries.
- No uncaught server errors during manual flow.

**Step 5: Commit**

```bash
git add README.md package.json tests/api/e2e-flow.test.js
git commit -m "docs: add runbook and final e2e verification"
```

---

## Acceptance Checklist
- [ ] Search by `keyword` works with partial matching.
- [ ] Search by `note_text` works with partial matching.
- [ ] Optional icon is supported; missing icon uses default placeholder.
- [ ] Entry supports multiple content images.
- [ ] All data is persisted locally via SQLite + local files.
- [ ] App listens only on `127.0.0.1`.
- [ ] All automated tests pass.

## Suggested branch workflow
- Branch name: `code/local-keyword-notes-service`
- Commit at the end of each task.
- Open PR only after Task 10 verification is green.
