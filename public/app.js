function createDefaultField() {
  return {
    key: 'wechat_id',
    type: 'text',
    textValue: '',
    imagePath: null,
    pendingFile: null
  };
}

function createFieldFromDetail(field) {
  return {
    key: field.key,
    type: field.type,
    textValue: field.textValue || '',
    imagePath: field.imagePath || null,
    pendingFile: null
  };
}

const state = {
  items: [],
  currentId: null,
  currentIconPath: null,
  currentImages: [],
  currentFields: [createDefaultField()]
};

const els = {
  search: document.getElementById('keyword-search-input'),
  newBtn: document.getElementById('new-entry-btn'),
  results: document.getElementById('results-list'),
  form: document.getElementById('entry-form'),
  keyword: document.getElementById('keyword-input'),
  noteText: document.getElementById('note-text-input'),
  iconFile: document.getElementById('icon-file-input'),
  imagesFile: document.getElementById('images-file-input'),
  imageList: document.getElementById('image-list'),
  customFieldsList: document.getElementById('custom-fields-list'),
  addCustomFieldBtn: document.getElementById('add-custom-field-btn'),
  deleteBtn: document.getElementById('delete-entry-btn'),
  status: document.getElementById('status-text')
};

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.style.color = isError ? '#c13a2c' : '#2d69c7';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function ensureAtLeastOneFieldRow() {
  if (state.currentFields.length === 0) {
    state.currentFields = [createDefaultField()];
  }
}

function renderResults() {
  els.results.innerHTML = '';

  for (const item of state.items) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-item';
    if (item.id === state.currentId) {
      button.classList.add('active');
    }

    button.innerHTML = `
      <img class="result-icon" src="${item.iconUrl}" alt="icon" />
      <div>
        <div class="result-keyword">${escapeHtml(item.keyword)}</div>
        <div class="result-preview">${escapeHtml(item.preview || '')}</div>
      </div>
    `;

    button.addEventListener('click', () => {
      openEntry(item.id);
    });

    li.appendChild(button);
    els.results.appendChild(li);
  }
}

function renderImageList() {
  els.imageList.innerHTML = '';

  for (const imagePath of state.currentImages) {
    const chip = document.createElement('div');
    chip.className = 'image-chip';

    const image = document.createElement('img');
    image.src = `/files/${imagePath}`;
    image.alt = 'entry image';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      state.currentImages = state.currentImages.filter((item) => item !== imagePath);
      renderImageList();
    });

    chip.appendChild(image);
    chip.appendChild(removeBtn);
    els.imageList.appendChild(chip);
  }
}

function renderCustomFields() {
  ensureAtLeastOneFieldRow();
  els.customFieldsList.innerHTML = '';

  state.currentFields.forEach((field, index) => {
    const row = document.createElement('div');
    row.className = 'custom-field-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'key';
    keyInput.value = field.key;
    keyInput.addEventListener('input', () => {
      field.key = keyInput.value;
    });

    const typeSelect = document.createElement('select');
    const textOption = document.createElement('option');
    textOption.value = 'text';
    textOption.textContent = 'text';
    const imageOption = document.createElement('option');
    imageOption.value = 'image';
    imageOption.textContent = 'image';
    typeSelect.append(textOption, imageOption);
    typeSelect.value = field.type;

    typeSelect.addEventListener('change', () => {
      field.type = typeSelect.value;
      if (field.type === 'text') {
        field.imagePath = null;
        field.pendingFile = null;
      } else {
        field.textValue = '';
      }
      renderCustomFields();
    });

    const valueWrap = document.createElement('div');
    valueWrap.className = 'custom-field-value';

    if (field.type === 'text') {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.placeholder = 'value';
      textInput.value = field.textValue;
      textInput.addEventListener('input', () => {
        field.textValue = textInput.value;
      });
      valueWrap.appendChild(textInput);
    } else {
      const imageInput = document.createElement('input');
      imageInput.type = 'file';
      imageInput.accept = 'image/*';
      imageInput.addEventListener('change', () => {
        field.pendingFile = imageInput.files?.[0] || null;
      });
      valueWrap.appendChild(imageInput);

      if (field.imagePath) {
        const preview = document.createElement('img');
        preview.className = 'custom-field-preview';
        preview.src = `/files/${field.imagePath}`;
        preview.alt = 'field image';
        valueWrap.appendChild(preview);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = '清除';
        clearBtn.addEventListener('click', () => {
          field.imagePath = null;
          field.pendingFile = null;
          renderCustomFields();
        });
        valueWrap.appendChild(clearBtn);
      }
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '删除';
    removeBtn.addEventListener('click', () => {
      state.currentFields.splice(index, 1);
      ensureAtLeastOneFieldRow();
      renderCustomFields();
    });

    row.appendChild(keyInput);
    row.appendChild(typeSelect);
    row.appendChild(valueWrap);
    row.appendChild(removeBtn);
    els.customFieldsList.appendChild(row);
  });
}

function resetForm() {
  state.currentId = null;
  state.currentIconPath = null;
  state.currentImages = [];
  state.currentFields = [createDefaultField()];
  els.keyword.value = '';
  els.noteText.value = '';
  els.iconFile.value = '';
  els.imagesFile.value = '';
  renderImageList();
  renderCustomFields();
  renderResults();
}

function applyEntry(entry) {
  state.currentId = entry.id;
  state.currentIconPath = entry.iconPath;
  state.currentImages = entry.images.slice();
  state.currentFields =
    Array.isArray(entry.fields) && entry.fields.length > 0
      ? entry.fields.map(createFieldFromDetail)
      : [createDefaultField()];

  els.keyword.value = entry.keyword;
  els.noteText.value = entry.noteText;
  els.iconFile.value = '';
  els.imagesFile.value = '';
  renderImageList();
  renderCustomFields();
  renderResults();
}

async function uploadFile(file, url) {
  const formData = new FormData();
  formData.append('file', file);
  const result = await fetchJson(url, { method: 'POST', body: formData });
  return result.path;
}

async function buildFieldsPayload() {
  const fields = [];

  for (const field of state.currentFields) {
    const key = field.key.trim();

    if (field.type === 'text') {
      const textValue = field.textValue.trim();
      if (!textValue) {
        continue;
      }

      if (!key) {
        throw new Error('字段 key 不能为空。');
      }

      fields.push({ key, type: 'text', textValue });
      continue;
    }

    let imagePath = field.imagePath;
    if (field.pendingFile) {
      imagePath = await uploadFile(field.pendingFile, '/api/upload/image');
    }

    if (!imagePath) {
      continue;
    }

    if (!key) {
      throw new Error('字段 key 不能为空。');
    }

    fields.push({ key, type: 'image', imagePath });
  }

  return fields;
}

async function openEntry(id) {
  const entry = await fetchJson(`/api/entries/${id}`);
  applyEntry(entry);
}

async function refreshResults() {
  const q = els.search.value.trim();
  const payload = await fetchJson(`/api/search?q=${encodeURIComponent(q)}`);
  state.items = payload.items;
  renderResults();
}

async function handleSave(event) {
  event.preventDefault();
  setStatus('保存中...');

  try {
    const keyword = els.keyword.value.trim();
    const noteText = els.noteText.value;

    if (!keyword) {
      throw new Error('关键词不能为空。');
    }

    let iconPath = state.currentIconPath;
    const iconFile = els.iconFile.files?.[0];
    if (iconFile) {
      iconPath = await uploadFile(iconFile, '/api/upload/icon');
    }

    const newImages = [];
    for (const file of els.imagesFile.files || []) {
      const uploadedPath = await uploadFile(file, '/api/upload/image');
      newImages.push(uploadedPath);
    }

    const images = [...state.currentImages, ...newImages];
    const fields = await buildFieldsPayload();
    const payload = { keyword, noteText, iconPath, images, fields };

    if (state.currentId) {
      await fetchJson(`/api/entries/${state.currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setStatus('更新成功。');
    } else {
      const created = await fetchJson('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      state.currentId = created.id;
      setStatus('创建成功。');
    }

    await refreshResults();
    if (state.currentId) {
      await openEntry(state.currentId);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleDelete() {
  if (!state.currentId) {
    setStatus('当前没有可删除条目。', true);
    return;
  }

  if (!window.confirm('确认删除这个条目吗？')) {
    return;
  }

  setStatus('删除中...');
  try {
    await fetchJson(`/api/entries/${state.currentId}`, { method: 'DELETE' });
    resetForm();
    await refreshResults();
    setStatus('删除成功。');
  } catch (error) {
    setStatus(error.message, true);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    refreshResults().catch((error) => setStatus(error.message, true));
  }, 200);
});

els.form.addEventListener('submit', (event) => {
  handleSave(event);
});
els.newBtn.addEventListener('click', () => {
  resetForm();
  setStatus('已切换到新建模式。');
});
els.addCustomFieldBtn.addEventListener('click', () => {
  state.currentFields.push({ key: '', type: 'text', textValue: '', imagePath: null, pendingFile: null });
  renderCustomFields();
});
els.deleteBtn.addEventListener('click', () => {
  handleDelete();
});

resetForm();
refreshResults().catch((error) => setStatus(error.message, true));
