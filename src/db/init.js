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
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );

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
  `);
  db.close();
}
