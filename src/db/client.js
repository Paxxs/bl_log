import Database from 'better-sqlite3';

export function getDb(filePath) {
  const db = new Database(filePath);
  db.pragma('foreign_keys = ON');
  return db;
}
