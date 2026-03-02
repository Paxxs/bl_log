import path from 'node:path';
import express from 'express';
import { getDb } from './db/client.js';
import { initDb } from './db/init.js';
import { createEntriesRepo } from './repositories/entriesRepo.js';
import {
  createImageUploader,
  deleteStoredFile,
  ensureDataLayout,
  runUpload,
  validateStoredPath
} from './services/fileStorage.js';

const DEFAULT_ICON_URL = '/assets/default-icon.svg';

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeKeyword(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const keyword = value.trim();
  return keyword || null;
}

function normalizeNoteText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value;
}

function normalizeIconPath(value) {
  if (value == null || value === '') {
    return null;
  }

  return validateStoredPath(value, 'icons');
}

function normalizeImagePaths(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const list = [];
  for (const item of value) {
    const normalized = validateStoredPath(item, 'images');
    if (!normalized) {
      return null;
    }
    list.push(normalized);
  }

  return list;
}

function normalizeFields(value) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const fields = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const key = typeof item.key === 'string' ? item.key.trim() : '';
    if (!key) {
      return null;
    }

    if (item.type === 'text') {
      const textValue = typeof item.textValue === 'string' ? item.textValue.trim() : '';
      if (!textValue) {
        continue;
      }

      fields.push({
        key,
        type: 'text',
        textValue,
        imagePath: null
      });
      continue;
    }

    if (item.type === 'image') {
      const imagePath = validateStoredPath(item.imagePath, 'images');
      if (!imagePath) {
        return null;
      }

      fields.push({
        key,
        type: 'image',
        textValue: null,
        imagePath
      });
      continue;
    }

    return null;
  }

  return fields;
}

function getFieldImagePaths(fields) {
  return fields
    .filter((field) => field.type === 'image' && typeof field.imagePath === 'string')
    .map((field) => field.imagePath);
}

function toSummary(entry) {
  return {
    id: entry.id,
    keyword: entry.keyword,
    noteText: entry.noteText,
    iconPath: entry.iconPath,
    iconUrl: entry.iconPath ? `/files/${entry.iconPath}` : DEFAULT_ICON_URL,
    preview: entry.noteText.slice(0, 120),
    updatedAt: entry.updatedAt
  };
}

function toDetail(entry) {
  return {
    id: entry.id,
    keyword: entry.keyword,
    noteText: entry.noteText,
    iconPath: entry.iconPath,
    iconUrl: entry.iconPath ? `/files/${entry.iconPath}` : DEFAULT_ICON_URL,
    images: entry.images,
    imageUrls: entry.images.map((imagePath) => `/files/${imagePath}`),
    fields: entry.fields,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

export function createApp(options = {}) {
  const rootDir = path.resolve(options.cwd || process.cwd());
  const dataDir = path.resolve(options.dataDir || path.join(rootDir, 'data'));
  const dbPath = path.resolve(options.dbPath || path.join(dataDir, 'app.db'));
  const publicDir = path.resolve(options.publicDir || path.join(rootDir, 'public'));

  ensureDataLayout(dataDir);
  initDb(dbPath);

  const db = getDb(dbPath);
  const repo = createEntriesRepo(db);

  const uploadIcon = createImageUploader(dataDir, 'icons');
  const uploadImage = createImageUploader(dataDir, 'images');

  const app = express();
  app.use(express.json());

  app.locals.close = () => {
    db.close();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/upload/icon', (req, res) => {
    runUpload(uploadIcon, req, res, () => {
      res.json({ path: `icons/${req.file.filename}` });
    });
  });

  app.post('/api/upload/image', (req, res) => {
    runUpload(uploadImage, req, res, () => {
      res.json({ path: `images/${req.file.filename}` });
    });
  });

  app.post('/api/entries', (req, res) => {
    const keyword = normalizeKeyword(req.body.keyword);
    const noteText = normalizeNoteText(req.body.noteText);
    const iconPath = normalizeIconPath(req.body.iconPath);
    const images = normalizeImagePaths(req.body.images || []);
    const fields = normalizeFields(req.body.fields === undefined ? [] : req.body.fields);

    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required.' });
    }

    if (req.body.iconPath != null && req.body.iconPath !== '' && !iconPath) {
      return res.status(400).json({ error: 'Invalid icon path.' });
    }

    if (!images) {
      return res.status(400).json({ error: 'Invalid images list.' });
    }

    if (!fields) {
      return res.status(400).json({ error: 'Invalid fields list.' });
    }

    const id = repo.createEntry({ keyword, noteText, iconPath, images, fields });
    return res.status(201).json({ id });
  });

  app.get('/api/entries/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid id.' });
    }

    const entry = repo.getEntryById(id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    return res.json(toDetail(entry));
  });

  app.put('/api/entries/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid id.' });
    }

    const current = repo.getEntryById(id);
    if (!current) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    const keyword =
      req.body.keyword === undefined ? current.keyword : normalizeKeyword(req.body.keyword);
    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required.' });
    }

    const noteText =
      req.body.noteText === undefined ? current.noteText : normalizeNoteText(req.body.noteText);

    let iconPath = current.iconPath;
    if (req.body.iconPath !== undefined) {
      if (req.body.iconPath == null || req.body.iconPath === '') {
        iconPath = null;
      } else {
        const normalized = normalizeIconPath(req.body.iconPath);
        if (!normalized) {
          return res.status(400).json({ error: 'Invalid icon path.' });
        }
        iconPath = normalized;
      }
    }

    let images = current.images;
    if (req.body.images !== undefined) {
      const normalizedImages = normalizeImagePaths(req.body.images);
      if (!normalizedImages) {
        return res.status(400).json({ error: 'Invalid images list.' });
      }
      images = normalizedImages;
    }

    let fields = current.fields;
    if (req.body.fields !== undefined) {
      const normalizedFields = normalizeFields(req.body.fields);
      if (!normalizedFields) {
        return res.status(400).json({ error: 'Invalid fields list.' });
      }
      fields = normalizedFields;
    }

    const updated = repo.updateEntry(id, { keyword, noteText, iconPath, images, fields });
    if (!updated) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    if (current.iconPath && current.iconPath !== iconPath) {
      deleteStoredFile(dataDir, current.iconPath);
    }

    for (const imagePath of current.images) {
      if (!images.includes(imagePath)) {
        deleteStoredFile(dataDir, imagePath);
      }
    }

    const currentFieldImages = getFieldImagePaths(current.fields);
    const nextFieldImages = getFieldImagePaths(fields);
    for (const imagePath of currentFieldImages) {
      if (!nextFieldImages.includes(imagePath)) {
        deleteStoredFile(dataDir, imagePath);
      }
    }

    return res.json({ ok: true });
  });

  app.delete('/api/entries/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid id.' });
    }

    const deleted = repo.deleteEntry(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    if (deleted.iconPath) {
      deleteStoredFile(dataDir, deleted.iconPath);
    }

    for (const imagePath of deleted.images) {
      deleteStoredFile(dataDir, imagePath);
    }

    for (const imagePath of getFieldImagePaths(deleted.fields)) {
      deleteStoredFile(dataDir, imagePath);
    }

    return res.json({ ok: true });
  });

  app.get('/api/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const entries = query ? repo.searchEntries(query, 20) : repo.listRecentEntries(20);
    res.json({ items: entries.map(toSummary) });
  });

  app.use('/files/icons', express.static(path.join(dataDir, 'icons')));
  app.use('/files/images', express.static(path.join(dataDir, 'images')));
  app.use(express.static(publicDir));

  return app;
}
