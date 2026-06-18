const SYNC_KEYS = Object.freeze({
  savedForLater: 'savedForLater',
  archived: 'archived',
});

const chromeApi = globalThis.chrome;
const QUOTA_BYTES = chromeApi?.storage?.sync?.QUOTA_BYTES || 102400;
const QUOTA_BYTES_PER_ITEM = chromeApi?.storage?.sync?.QUOTA_BYTES_PER_ITEM || 8192;

class StorageSyncError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageSyncError';
    this.cause = cause;
  }
}

function assertChromeSyncAvailable() {
  if (!chromeApi?.storage?.sync) {
    throw new StorageSyncError('chrome.storage.sync is not available in this context.');
  }
}

function getByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return Date.now();
}

function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new StorageSyncError('Storage item must be an object.');
  }

  const url = String(record.url || '').trim();
  if (!url) {
    throw new StorageSyncError('Storage item requires a url.');
  }

  const title = String(record.title || url).trim();

  return {
    url,
    title,
    timestamp: normalizeTimestamp(record.timestamp),
  };
}

function sanitizeList(items) {
  if (!Array.isArray(items)) return [];

  return items.reduce((records, item) => {
    try {
      records.push(sanitizeRecord(item));
    } catch {
      // Ignore malformed old records instead of blocking sync reads.
    }
    return records;
  }, []);
}

function isQuotaError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('quota') || message.includes('max write') || message.includes('exceeded');
}

function toStorageError(action, error) {
  if (error instanceof StorageSyncError) return error;

  const suffix = isQuotaError(error)
    ? ' Chrome sync storage quota was exceeded; keep only url, title, and timestamp, or remove older records.'
    : '';

  return new StorageSyncError(`Failed to ${action}.${suffix}`, error);
}

function storageGet(keys) {
  assertChromeSyncAvailable();

  return new Promise((resolve, reject) => {
    chromeApi.storage.sync.get(keys, result => {
      const error = chromeApi.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(result || {});
    });
  });
}

function storageSet(payload) {
  assertChromeSyncAvailable();

  return new Promise((resolve, reject) => {
    chromeApi.storage.sync.set(payload, () => {
      const error = chromeApi.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function storageRemove(key) {
  assertChromeSyncAvailable();

  return new Promise((resolve, reject) => {
    chromeApi.storage.sync.remove(key, () => {
      const error = chromeApi.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function assertSyncPayloadQuota(nextPayload) {
  for (const [nextKey, nextList] of Object.entries(nextPayload)) {
    const nextItemPayload = { [nextKey]: nextList };
    const nextItemBytes = getByteLength(nextItemPayload);

    if (nextItemBytes > QUOTA_BYTES_PER_ITEM) {
      throw new StorageSyncError(
        `${nextKey} is ${nextItemBytes} bytes, which exceeds the ${QUOTA_BYTES_PER_ITEM} byte per-item sync limit.`,
      );
    }
  }

  const current = await storageGet(Object.values(SYNC_KEYS));
  const nextState = {
    [SYNC_KEYS.savedForLater]: sanitizeList(current[SYNC_KEYS.savedForLater]),
    [SYNC_KEYS.archived]: sanitizeList(current[SYNC_KEYS.archived]),
    ...nextPayload,
  };
  const nextTotalBytes = getByteLength(nextState);

  if (nextTotalBytes > QUOTA_BYTES) {
    throw new StorageSyncError(
      `Saved records would use ${nextTotalBytes} bytes, which exceeds the ${QUOTA_BYTES} byte total sync limit.`,
    );
  }
}

async function assertSyncQuota(nextKey, nextList) {
  await assertSyncPayloadQuota({ [nextKey]: nextList });
}

async function getRecordList(key) {
  try {
    const result = await storageGet(key);
    return sanitizeList(result[key]);
  } catch (error) {
    throw toStorageError(`read ${key}`, error);
  }
}

async function setRecordList(key, items) {
  try {
    const sanitized = sanitizeList(items);
    await assertSyncQuota(key, sanitized);
    await storageSet({ [key]: sanitized });
    return sanitized;
  } catch (error) {
    throw toStorageError(`save ${key}`, error);
  }
}

async function addRecord(key, item) {
  try {
    const record = sanitizeRecord(item);
    const current = await getRecordList(key);
    const next = [
      ...current.filter(saved => saved.url !== record.url),
      record,
    ];
    return setRecordList(key, next);
  } catch (error) {
    throw toStorageError(`add item to ${key}`, error);
  }
}

async function removeRecord(key, matcher) {
  try {
    const current = await getRecordList(key);
    const shouldRemove = typeof matcher === 'function'
      ? matcher
      : item => item.url === matcher;
    const next = current.filter(item => !shouldRemove(item));
    return setRecordList(key, next);
  } catch (error) {
    throw toStorageError(`remove item from ${key}`, error);
  }
}

export async function getSavedForLater() {
  return getRecordList(SYNC_KEYS.savedForLater);
}

export async function addSavedForLater(item) {
  return addRecord(SYNC_KEYS.savedForLater, item);
}

export async function setSavedForLater(items) {
  return setRecordList(SYNC_KEYS.savedForLater, items);
}

export async function removeSavedForLater(urlOrPredicate) {
  return removeRecord(SYNC_KEYS.savedForLater, urlOrPredicate);
}

export async function getArchived() {
  return getRecordList(SYNC_KEYS.archived);
}

export async function addArchived(item) {
  return addRecord(SYNC_KEYS.archived, item);
}

export async function setArchived(items) {
  return setRecordList(SYNC_KEYS.archived, items);
}

export async function setSyncedDeferredLists({ savedForLater = [], archived = [] }) {
  try {
    const nextPayload = {
      [SYNC_KEYS.savedForLater]: sanitizeList(savedForLater),
      [SYNC_KEYS.archived]: sanitizeList(archived),
    };

    await assertSyncPayloadQuota(nextPayload);
    await storageSet(nextPayload);

    return {
      savedForLater: nextPayload[SYNC_KEYS.savedForLater],
      archived: nextPayload[SYNC_KEYS.archived],
    };
  } catch (error) {
    throw toStorageError('save synced deferred lists', error);
  }
}

export async function removeArchived(urlOrPredicate) {
  return removeRecord(SYNC_KEYS.archived, urlOrPredicate);
}

export async function clearSavedForLater() {
  try {
    await storageRemove(SYNC_KEYS.savedForLater);
    return [];
  } catch (error) {
    throw toStorageError(`clear ${SYNC_KEYS.savedForLater}`, error);
  }
}

export async function clearArchived() {
  try {
    await storageRemove(SYNC_KEYS.archived);
    return [];
  } catch (error) {
    throw toStorageError(`clear ${SYNC_KEYS.archived}`, error);
  }
}

export {
  StorageSyncError,
  sanitizeRecord,
  SYNC_KEYS,
};
