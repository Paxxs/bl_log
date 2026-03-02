# Entry Custom Fields (Value-Only Search) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-entry custom key-value fields (text/image), include default UI row `wechat_id:text`, and make search match field values only.

**Architecture:** Extend the SQLite schema with a dedicated `entry_fields` table and wire repository-level CRUD + search joins against field values. Keep API contracts backward compatible by making `fields` optional, and filter empty-value fields at service boundaries so non-required defaults never write to DB. Update frontend form state to edit multiple fields with type-aware inputs and reuse existing upload endpoints for image values.

**Tech Stack:** Bun, Node.js (ESM), Express, better-sqlite3, Multer, Vitest, Supertest, vanilla HTML/CSS/JS.

---

**Execution discipline:** `@test-driven-development`, `@systematic-debugging`, `@verification-before-completion`.

### Task 1: Add DB migration for `entry_fields`

**Files:**
- Modify: `src/db/init.js`
- Test: `tests/db/init.test.js`

**Step 1: Write the failing test**

```js
it('creates entry_fields table', () => {
  initDb(dbFile);
  const db = getDb(dbFile);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);

  expect(tables).toContain('entry_fields');
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test tests/db/init.test.js`
Expected: FAIL because `entry_fields` table does not exist.

**Step 3: Write minimal implementation**

```js
// Add to db.exec(...) in src/db/init.js
CREATE TABLE IF NOT EXISTS entry_fields (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL,
  text_value TEXT,
  image_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);
```

**Step 4: Run test to verify it passes**

Run: `bun run test tests/db/init.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/db/init.js tests/db/init.test.js
git commit -m "feat: add entry_fields table schema"
```

### Task 2: Extend repository with field CRUD and mapping

**Files:**
- Modify: `src/repositories/entriesRepo.js`
- Create: `tests/repositories/entriesRepo-fields.test.js`

**Step 1: Write the failing test**

```js
it('persists and returns custom fields with entry detail', () => {
  const id = repo.createEntry({
    keyword: 'k',
    noteText: 'n',
    iconPath: null,
    images: [],
    fields: [
      { key: 'wechat_id', type: 'text', textValue: 'w123' },
      { key: 'profile_qr', type: 'image', imagePath: 'images/a.png' }
    ]
  });

  const entry = repo.getEntryById(id);
  expect(entry.fields).toEqual([
    { key: 'wechat_id', type: 'text', textValue: 'w123', imagePath: null },
    { key: 'profile_qr', type: 'image', textValue: null, imagePath: 'images/a.png' }
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test tests/repositories/entriesRepo-fields.test.js`
Expected: FAIL because `fields` are not inserted/read.

**Step 3: Write minimal implementation**

```js
// entriesRepo.js: add statements for entry_fields
const insertFieldStmt = db.prepare(`
  INSERT INTO entry_fields (entry_id, field_key, field_type, text_value, image_path, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const fieldsByEntryStmt = db.prepare(`
  SELECT field_key, field_type, text_value, image_path
  FROM entry_fields WHERE entry_id = ? ORDER BY sort_order ASC
`);
const deleteFieldsByEntryStmt = db.prepare('DELETE FROM entry_fields WHERE entry_id = ?');

// createEntryTx/updateEntryTx: write fields in order
// mapEntryRow: include fields
```

**Step 4: Run test to verify it passes**

Run: `bun run test tests/repositories/entriesRepo-fields.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/repositories/entriesRepo.js tests/repositories/entriesRepo-fields.test.js
git commit -m "feat: persist entry custom fields in repository"
```

### Task 3: Add API validation/normalization for optional `fields`

**Files:**
- Modify: `src/app.js`
- Modify: `tests/api/entries.test.js`

**Step 1: Write the failing tests**

```js
it('does not store empty default wechat_id text field', async () => {
  const createRes = await request(app).post('/api/entries').send({
    keyword: 'k',
    noteText: 'n',
    iconPath: null,
    images: [],
    fields: [{ key: 'wechat_id', type: 'text', textValue: '' }]
  });

  const detail = await request(app).get(`/api/entries/${createRes.body.id}`);
  expect(detail.body.fields).toEqual([]);
});

it('returns 400 for image field with invalid path', async () => {
  const res = await request(app).post('/api/entries').send({
    keyword: 'k',
    noteText: 'n',
    iconPath: null,
    images: [],
    fields: [{ key: 'x', type: 'image', imagePath: '../bad.png' }]
  });

  expect(res.status).toBe(400);
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run test tests/api/entries.test.js`
Expected: FAIL because `fields` not validated/filtered.

**Step 3: Write minimal implementation**

```js
function normalizeFields(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const result = [];
  for (const raw of value) {
    const key = typeof raw.key === 'string' ? raw.key.trim() : '';
    if (!key) return null;

    if (raw.type === 'text') {
      const textValue = typeof raw.textValue === 'string' ? raw.textValue.trim() : '';
      if (textValue) {
        result.push({ key, type: 'text', textValue, imagePath: null });
      }
      continue;
    }

    if (raw.type === 'image') {
      const imagePath = validateStoredPath(raw.imagePath, 'images');
      if (!imagePath) return null;
      result.push({ key, type: 'image', textValue: null, imagePath });
      continue;
    }

    return null;
  }

  return result;
}
```

Wire `fields` into create/update payloads and into `toDetail` response.

**Step 4: Run tests to verify they pass**

Run: `bun run test tests/api/entries.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app.js tests/api/entries.test.js
git commit -m "feat: validate and filter optional custom fields in api"
```

### Task 4: Implement search by field values only

**Files:**
- Modify: `src/repositories/entriesRepo.js`
- Modify: `tests/api/entries.test.js`

**Step 1: Write the failing tests**

```js
it('finds entry by custom text field value', async () => {
  await request(app).post('/api/entries').send({
    keyword: 'A',
    noteText: 'B',
    fields: [{ key: 'wechat_id', type: 'text', textValue: 'WSC6688' }],
    images: []
  });

  const res = await request(app).get('/api/search').query({ q: 'WSC6688' });
  expect(res.body.items.length).toBe(1);
});

it('does not match by field key', async () => {
  await request(app).post('/api/entries').send({
    keyword: 'A',
    noteText: 'B',
    fields: [{ key: 'wechat_id', type: 'text', textValue: 'foo' }],
    images: []
  });

  const res = await request(app).get('/api/search').query({ q: 'wechat_id' });
  expect(res.body.items.length).toBe(0);
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run test tests/api/entries.test.js`
Expected: FAIL because search does not include `entry_fields` values.

**Step 3: Write minimal implementation**

```js
// Update search SQL in entriesRepo.js
SELECT DISTINCT e.id, e.keyword, e.note_text, e.icon_path, e.created_at, e.updated_at
FROM entries e
LEFT JOIN entry_fields f ON f.entry_id = e.id
WHERE e.keyword LIKE @term
   OR e.note_text LIKE @term
   OR f.text_value LIKE @term
   OR f.image_path LIKE @term
ORDER BY e.updated_at DESC
LIMIT @limit;
```

No `field_key` predicate is added.

**Step 4: Run tests to verify they pass**

Run: `bun run test tests/api/entries.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/repositories/entriesRepo.js tests/api/entries.test.js
git commit -m "feat: include custom field values in search results"
```

### Task 5: Add frontend UI for dynamic custom fields

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Test: `tests/ui/index.test.js`

**Step 1: Write the failing test**

```js
it('serves custom fields section with default wechat row ui marker', async () => {
  const res = await request(app).get('/');
  expect(res.text).toContain('id="custom-fields-list"');
  expect(res.text).toContain('data-default-field="wechat_id"');
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test tests/ui/index.test.js`
Expected: FAIL because section does not exist.

**Step 3: Write minimal implementation**

```html
<!-- index.html: add section -->
<div class="custom-fields">
  <div id="custom-fields-list" data-default-field="wechat_id"></div>
  <button id="add-custom-field-btn" type="button">添加字段</button>
</div>
```

```js
// app.js: maintain state.currentFields
// reset: [{ key:'wechat_id', type:'text', textValue:'', imagePath:null }]
// serialize: drop empty text rows, upload image rows, send payload.fields
// applyEntry: render saved fields; fallback to default row when none
```

```css
/* styles.css: basic row layout for key/type/value controls */
.custom-field-row {
  display: grid;
  grid-template-columns: 1fr 100px 1fr auto;
  gap: 8px;
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test tests/ui/index.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add public/index.html public/app.js public/styles.css tests/ui/index.test.js
git commit -m "feat: add custom key-value fields ui with default wechat row"
```

### Task 6: Add API-level regression tests for end-to-end fields flow

**Files:**
- Modify: `tests/api/entries.test.js`

**Step 1: Write the failing test**

```js
it('updates fields and removes previous value from search', async () => {
  const createRes = await request(app).post('/api/entries').send({
    keyword: 'k',
    noteText: 'n',
    fields: [{ key: 'wechat_id', type: 'text', textValue: 'old-value' }],
    images: []
  });

  await request(app).put(`/api/entries/${createRes.body.id}`).send({
    fields: [{ key: 'wechat_id', type: 'text', textValue: 'new-value' }]
  });

  const oldSearch = await request(app).get('/api/search').query({ q: 'old-value' });
  const newSearch = await request(app).get('/api/search').query({ q: 'new-value' });

  expect(oldSearch.body.items.length).toBe(0);
  expect(newSearch.body.items.length).toBe(1);
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test tests/api/entries.test.js`
Expected: FAIL if field replacement/search not fully correct.

**Step 3: Write minimal implementation adjustments**

Implement any missing replacement behavior in repo update transaction (delete + insert fields) and keep sort order stable.

**Step 4: Run test to verify it passes**

Run: `bun run test tests/api/entries.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/repositories/entriesRepo.js tests/api/entries.test.js
git commit -m "test: cover custom field update and search regression"
```

### Task 7: Final verification on full suite and manual smoke run

**Files:**
- Modify: `README.md` (if any API/UI usage notes are needed)

**Step 1: Write the failing test (if README updates include behavior assumptions)**

No new test required if existing suite covers behavior.

**Step 2: Run targeted suite**

Run: `bun run test tests/db/init.test.js tests/api/entries.test.js tests/ui/index.test.js`
Expected: PASS.

**Step 3: Run full suite**

Run: `bun run test`
Expected: PASS all tests.

**Step 4: Run manual smoke**

Run: `bun run start`
Manual checks:
- Open `http://127.0.0.1:3000`
- Add entry with empty default `wechat_id` (confirm detail has no stored fields)
- Add text/image custom fields and search by value
- Search by `wechat_id` key string should not match unless value contains it

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document custom fields behavior and value-only search"
```

---

## Acceptance Checklist
- [ ] `entry_fields` table exists and is linked by FK to entries.
- [ ] `fields` are supported in create/update/get detail flows.
- [ ] Default `wechat_id:text` row can stay empty without DB write.
- [ ] Search matches custom field values only (not keys).
- [ ] Existing entry/image/icon behavior remains intact.
- [ ] `bun run test` passes in current branch.
