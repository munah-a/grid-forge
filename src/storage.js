// GridForge GIS – IndexedDB Storage Module
// Persistent settings, auto-save, recent files, and gridding presets.

const DB_NAME = "GridForgeGIS";
const DB_VERSION = 1;

const STORES = {
    settings: "settings",    // key-value store for user preferences
    autosave: "autosave",    // single auto-save snapshot
    recent: "recentFiles", // last 20 imported files
    presets: "griddingPresets", // named gridding parameter presets
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE INIT
// ═══════════════════════════════════════════════════════════════════════════════

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORES.settings))
                db.createObjectStore(STORES.settings);
            if (!db.objectStoreNames.contains(STORES.autosave))
                db.createObjectStore(STORES.autosave);
            if (!db.objectStoreNames.contains(STORES.recent))
                db.createObjectStore(STORES.recent, { keyPath: "id", autoIncrement: true });
            if (!db.objectStoreNames.contains(STORES.presets))
                db.createObjectStore(STORES.presets, { keyPath: "name" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function tx(storeName, mode = "readonly") {
    return openDB().then(db => {
        const t = db.transaction(storeName, mode);
        return t.objectStore(storeName);
    });
}

function idbGet(storeName, key) {
    return tx(storeName).then(store => new Promise((res, rej) => {
        const r = store.get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    }));
}

function idbPut(storeName, value, key) {
    return tx(storeName, "readwrite").then(store => new Promise((res, rej) => {
        const r = key !== undefined ? store.put(value, key) : store.put(value);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    }));
}

function idbDelete(storeName, key) {
    return tx(storeName, "readwrite").then(store => new Promise((res, rej) => {
        const r = store.delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
    }));
}

function idbGetAll(storeName) {
    return tx(storeName).then(store => new Promise((res, rej) => {
        const r = store.getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

/** Save a single setting value */
export async function saveSetting(key, value) {
    try { await idbPut(STORES.settings, value, key); } catch { /* silently fail */ }
}

/** Load a single setting value */
export async function loadSetting(key, defaultValue) {
    try {
        const val = await idbGet(STORES.settings, key);
        return val !== undefined ? val : defaultValue;
    } catch { return defaultValue; }
}

/** Save all settings as a batch */
export async function saveAllSettings(settings) {
    try {
        const store = await tx(STORES.settings, "readwrite");
        for (const [key, value] of Object.entries(settings)) {
            store.put(value, key);
        }
    } catch { /* silently fail */ }
}

/** Load all settings as an object */
export async function loadAllSettings() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const t = db.transaction(STORES.settings, "readonly");
            const store = t.objectStore(STORES.settings);
            const result = {};
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    result[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(result);
                }
            };
            cursorReq.onerror = () => resolve({});
        });
    } catch { return {}; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-SAVE (Crash Recovery)
// ═══════════════════════════════════════════════════════════════════════════════

const AUTOSAVE_KEY = "current";

/** Save project auto-save snapshot */
export async function saveAutoSave(state) {
    try {
        await idbPut(STORES.autosave, {
            state,
            timestamp: Date.now(),
        }, AUTOSAVE_KEY);
    } catch { /* silently fail */ }
}

/** Load auto-save snapshot. Returns { state, timestamp } or null. */
export async function loadAutoSave() {
    try {
        const data = await idbGet(STORES.autosave, AUTOSAVE_KEY);
        return data || null;
    } catch { return null; }
}

/** Clear auto-save */
export async function clearAutoSave() {
    try { await idbDelete(STORES.autosave, AUTOSAVE_KEY); } catch { /* */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECENT FILES
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_RECENT = 20;

/** Add a file to recent files list */
export async function addRecentFile(fileInfo) {
    // fileInfo: { name, size, date, type }
    try {
        const all = await idbGetAll(STORES.recent);
        // Remove existing entry with same name
        for (const entry of all) {
            if (entry.name === fileInfo.name) {
                await idbDelete(STORES.recent, entry.id);
            }
        }
        // Add new entry
        await idbPut(STORES.recent, { ...fileInfo, date: Date.now() });
        // Trim to MAX_RECENT
        const updated = await idbGetAll(STORES.recent);
        if (updated.length > MAX_RECENT) {
            const sorted = updated.sort((a, b) => a.date - b.date);
            const toDelete = sorted.slice(0, updated.length - MAX_RECENT);
            for (const entry of toDelete) {
                await idbDelete(STORES.recent, entry.id);
            }
        }
    } catch { /* silently fail */ }
}

/** Get recent files, newest first */
export async function getRecentFiles() {
    try {
        const all = await idbGetAll(STORES.recent);
        return all.sort((a, b) => b.date - a.date);
    } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRIDDING PRESETS
// ═══════════════════════════════════════════════════════════════════════════════

/** Save a named gridding preset */
export async function saveGriddingPreset(name, params) {
    try {
        await idbPut(STORES.presets, { name, params, date: Date.now() });
    } catch { /* silently fail */ }
}

/** Get all gridding presets */
export async function getGriddingPresets() {
    try {
        return await idbGetAll(STORES.presets);
    } catch { return []; }
}

/** Delete a gridding preset */
export async function deleteGriddingPreset(name) {
    try { await idbDelete(STORES.presets, name); } catch { /* */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

/** Export all settings + presets as a JSON string */
export async function exportSettingsJSON() {
    const settings = await loadAllSettings();
    const presets = await getGriddingPresets();
    return JSON.stringify({ settings, presets, exportDate: Date.now() }, null, 2);
}

/** Import settings from a JSON string */
export async function importSettingsJSON(json) {
    try {
        const data = JSON.parse(json);
        if (data.settings) await saveAllSettings(data.settings);
        if (data.presets && Array.isArray(data.presets)) {
            for (const preset of data.presets) {
                if (preset.name && preset.params) {
                    await saveGriddingPreset(preset.name, preset.params);
                }
            }
        }
        return true;
    } catch { return false; }
}
