/**
 * localStorage adapter for bagirata.v3.
 *
 * Only reads and writes the raw store. All arithmetic and schema rules live in
 * domain.js. The v2 key is read once for migration and never written or removed.
 */

import {
  LEGACY_STORAGE_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  createStore,
  migrateV2,
} from './domain.js';

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Gagal membaca ${key}`, error);
    return null;
  }
}

function normalize(store) {
  return {
    version: SCHEMA_VERSION,
    tims: Array.isArray(store.tims) ? store.tims : [],
    activeTimId: store.activeTimId || null,
    savedAt: store.savedAt || null,
  };
}

export function loadStore() {
  const current = readJson(STORAGE_KEY);
  if (current && Array.isArray(current.tims)) return normalize(current);

  const legacy = readJson(LEGACY_STORAGE_KEY);
  if (legacy) {
    const migrated = normalize(migrateV2(legacy));
    saveStore(migrated);
    return migrated;
  }

  return createStore();
}

export function saveStore(store) {
  try {
    const payload = { ...normalize(store), savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch (error) {
    console.error('Gagal menyimpan BagiRata', error);
    return store;
  }
}

/** Persist which Tim is open so a reload lands in the same place. */
export function saveActive(store, timId) {
  const next = normalize(store);
  next.activeTimId = timId || null;
  return saveStore(next);
}