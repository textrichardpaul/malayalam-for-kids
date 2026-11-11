// Practice recordings store — the React Native mirror of the web app's
// IndexedDB store (mfk-practice-db). Takes live as files in the app's
// document directory; a small AsyncStorage index holds the metadata the
// web app kept on each record: { score, heard, algo, ts }.
// Recordings are NEVER uploaded anywhere; there is no network code here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export interface PracticeRec {
  /** file name (basename) inside the practice directory */
  file: string;
  score: number | null;
  heard: boolean | null;
  algo: number;
  ts: number;
}

const INDEX_KEY = 'mfk-practice-index-v1';
const DIR = `${FileSystem.documentDirectory ?? ''}practice/`;

// Fix round 4 (learner profiles): recording keys are namespaced per
// profile as "p:<profileId>|<recKey>", so one child's takes are never
// visible under another child's profile. Pre-profiles takes carry no
// prefix; adoptLegacyPractice() re-keys them to the first profile.
export function practicePrefix(profileId: string): string {
  return `p:${profileId}|`;
}

type Index = Record<string, PracticeRec>;

let indexCache: Index | null = null;

async function loadIndex(): Promise<Index> {
  if (indexCache) return indexCache;
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    indexCache = raw ? (JSON.parse(raw) as Index) : {};
  } catch {
    indexCache = {};
  }
  return indexCache;
}

async function saveIndex(idx: Index): Promise<void> {
  indexCache = idx;
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    // non-fatal
  }
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    }
  } catch {
    // non-fatal: saveTake will surface failure by returning false
  }
}

function sanitize(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function practiceFileUri(rec: PracticeRec): string {
  return DIR + rec.file;
}

export async function getPractice(key: string): Promise<PracticeRec | null> {
  const idx = await loadIndex();
  const rec = idx[key];
  if (!rec) return null;
  try {
    const info = await FileSystem.getInfoAsync(DIR + rec.file);
    if (!info.exists) return null;
  } catch {
    return null;
  }
  return rec;
}

/**
 * Move a freshly recorded temp file into the practice store under `key`,
 * replacing any previous take (web behaviour). Returns the stored record
 * (unscored) or null on failure.
 */
export async function saveTake(key: string, tempUri: string): Promise<PracticeRec | null> {
  await ensureDir();
  const idx = await loadIndex();
  const extMatch = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(tempUri);
  const ext = extMatch ? extMatch[1] : 'm4a';
  const name = `${sanitize(key)}.${ext}`;
  try {
    const dest = DIR + name;
    const prev = idx[key];
    if (prev && prev.file !== name) {
      await FileSystem.deleteAsync(DIR + prev.file, { idempotent: true });
    }
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: tempUri, to: dest });
  } catch {
    return null;
  }
  const rec: PracticeRec = { file: name, score: null, heard: null, algo: 0, ts: Date.now() };
  idx[key] = rec;
  await saveIndex(idx);
  return rec;
}

export async function updatePracticeScore(
  key: string,
  score: number | null,
  heard: boolean,
  algo: number,
): Promise<void> {
  const idx = await loadIndex();
  const rec = idx[key];
  if (!rec) return;
  rec.score = score;
  rec.heard = heard;
  rec.algo = algo;
  await saveIndex(idx);
}

export async function countPractice(prefix?: string): Promise<number> {
  const idx = await loadIndex();
  const keys = Object.keys(idx);
  if (!prefix) return keys.length;
  return keys.filter((k) => k.startsWith(prefix)).length;
}

/**
 * Clear practice recordings. With a profile prefix, only that profile's
 * takes (files + index entries) are removed; without one, everything is
 * cleared (the pre-profiles behaviour).
 */
export async function clearPractice(prefix?: string): Promise<void> {
  const idx = await loadIndex();
  if (!prefix) {
    try {
      await FileSystem.deleteAsync(DIR, { idempotent: true });
    } catch {
      // non-fatal
    }
    await saveIndex({});
    return;
  }
  const next: Index = {};
  for (const [key, rec] of Object.entries(idx)) {
    if (key.startsWith(prefix)) {
      try {
        await FileSystem.deleteAsync(DIR + rec.file, { idempotent: true });
      } catch {
        // non-fatal
      }
    } else {
      next[key] = rec;
    }
  }
  await saveIndex(next);
}

/**
 * One-time migration: re-key every legacy (unprefixed) recording to the
 * first profile. The stored file names do not change — the index record
 * keeps pointing at the same file, and future takes for the phrase save
 * under the namespaced key as usual. Returns how many takes moved.
 */
export async function adoptLegacyPractice(profileId: string): Promise<number> {
  const idx = await loadIndex();
  const prefix = practicePrefix(profileId);
  let moved = 0;
  const next: Index = {};
  for (const [key, rec] of Object.entries(idx)) {
    if (key.startsWith('p:')) {
      next[key] = rec;
    } else {
      next[prefix + key] = rec;
      moved += 1;
    }
  }
  if (moved > 0) await saveIndex(next);
  return moved;
}
