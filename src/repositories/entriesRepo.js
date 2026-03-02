function mapFieldRow(row) {
  return {
    key: row.field_key,
    type: row.field_type,
    textValue: row.text_value,
    imagePath: row.image_path
  };
}

function mapEntryRow(row, images, fields) {
  return {
    id: row.id,
    keyword: row.keyword,
    noteText: row.note_text,
    iconPath: row.icon_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images,
    fields
  };
}

export function createEntriesRepo(db) {
  const insertEntryStmt = db.prepare(`
    INSERT INTO entries (keyword, note_text, icon_path, created_at, updated_at)
    VALUES (@keyword, @note_text, @icon_path, @created_at, @updated_at)
  `);
  const insertImageStmt = db.prepare(`
    INSERT INTO entry_images (entry_id, image_path, sort_order)
    VALUES (?, ?, ?)
  `);
  const insertFieldStmt = db.prepare(`
    INSERT INTO entry_fields (entry_id, field_key, field_type, text_value, image_path, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const entryByIdStmt = db.prepare('SELECT * FROM entries WHERE id = ?');
  const imagesByEntryStmt = db.prepare(
    'SELECT image_path FROM entry_images WHERE entry_id = ? ORDER BY sort_order ASC'
  );
  const fieldsByEntryStmt = db.prepare(
    'SELECT field_key, field_type, text_value, image_path FROM entry_fields WHERE entry_id = ? ORDER BY sort_order ASC'
  );

  const deleteImagesByEntryStmt = db.prepare('DELETE FROM entry_images WHERE entry_id = ?');
  const deleteFieldsByEntryStmt = db.prepare('DELETE FROM entry_fields WHERE entry_id = ?');
  const updateEntryStmt = db.prepare(
    'UPDATE entries SET keyword = @keyword, note_text = @note_text, icon_path = @icon_path, updated_at = @updated_at WHERE id = @id'
  );
  const deleteEntryStmt = db.prepare('DELETE FROM entries WHERE id = ?');

  const recentEntriesStmt = db.prepare(`
    SELECT id, keyword, note_text, icon_path, created_at, updated_at
    FROM entries
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  const searchEntriesStmt = db.prepare(`
    SELECT DISTINCT
      e.id,
      e.keyword,
      e.note_text,
      e.icon_path,
      e.created_at,
      e.updated_at
    FROM entries e
    LEFT JOIN entry_fields f ON f.entry_id = e.id
    WHERE e.keyword LIKE @term
      OR e.note_text LIKE @term
      OR f.text_value LIKE @term
      OR f.image_path LIKE @term
    ORDER BY e.updated_at DESC
    LIMIT @limit
  `);

  const createEntryTx = db.transaction(({ keyword, noteText, iconPath, images, fields }) => {
    const now = new Date().toISOString();
    const info = insertEntryStmt.run({
      keyword,
      note_text: noteText,
      icon_path: iconPath,
      created_at: now,
      updated_at: now
    });

    const entryId = Number(info.lastInsertRowid);

    images.forEach((imagePath, index) => {
      insertImageStmt.run(entryId, imagePath, index);
    });

    fields.forEach((field, index) => {
      insertFieldStmt.run(
        entryId,
        field.key,
        field.type,
        field.textValue ?? null,
        field.imagePath ?? null,
        index
      );
    });

    return entryId;
  });

  const updateEntryTx = db.transaction(({ id, keyword, noteText, iconPath, images, fields }) => {
    const now = new Date().toISOString();
    const updateInfo = updateEntryStmt.run({
      id,
      keyword,
      note_text: noteText,
      icon_path: iconPath,
      updated_at: now
    });

    if (updateInfo.changes === 0) {
      return false;
    }

    deleteImagesByEntryStmt.run(id);
    images.forEach((imagePath, index) => {
      insertImageStmt.run(id, imagePath, index);
    });

    deleteFieldsByEntryStmt.run(id);
    fields.forEach((field, index) => {
      insertFieldStmt.run(
        id,
        field.key,
        field.type,
        field.textValue ?? null,
        field.imagePath ?? null,
        index
      );
    });

    return true;
  });

  const deleteEntryTx = db.transaction((id) => {
    const info = deleteEntryStmt.run(id);
    return info.changes > 0;
  });

  function getEntryById(id) {
    const row = entryByIdStmt.get(id);
    if (!row) {
      return null;
    }

    const images = imagesByEntryStmt.all(id).map((item) => item.image_path);
    const fields = fieldsByEntryStmt.all(id).map(mapFieldRow);
    return mapEntryRow(row, images, fields);
  }

  function listRecentEntries(limit = 20) {
    return recentEntriesStmt.all(limit).map((row) => {
      const images = imagesByEntryStmt.all(row.id).map((item) => item.image_path);
      const fields = fieldsByEntryStmt.all(row.id).map(mapFieldRow);
      return mapEntryRow(row, images, fields);
    });
  }

  function searchEntries(query, limit = 20) {
    const term = `%${query}%`;
    return searchEntriesStmt.all({ term, limit }).map((row) => {
      const images = imagesByEntryStmt.all(row.id).map((item) => item.image_path);
      const fields = fieldsByEntryStmt.all(row.id).map(mapFieldRow);
      return mapEntryRow(row, images, fields);
    });
  }

  function createEntry(payload) {
    return createEntryTx({ ...payload, fields: payload.fields || [] });
  }

  function updateEntry(id, payload) {
    return updateEntryTx({ id, ...payload, fields: payload.fields || [] });
  }

  function deleteEntry(id) {
    const current = getEntryById(id);
    if (!current) {
      return null;
    }

    const deleted = deleteEntryTx(id);
    return deleted ? current : null;
  }

  return {
    createEntry,
    deleteEntry,
    getEntryById,
    listRecentEntries,
    searchEntries,
    updateEntry
  };
}
