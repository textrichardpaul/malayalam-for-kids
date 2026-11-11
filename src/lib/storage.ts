// On-device persistence, mirroring the web app's storage model 1:1.
// Web keys: samsaarikam-settings-v1, samsaarikam-stars-v1, mfk-points-v1, mfk-progress-v1.
//
// Fix round 4 (learner profiles): stars / points / progress are stored
// PER PROFILE under "<legacy key>:<profileId>". The un-suffixed legacy
// keys are read only for the one-time migration: the first profile ever
// created adopts whatever the legacy stores held (and the legacy keys
// are then removed, so the data lives in exactly one place).
// Parent-level settings stay global, as before.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  church: boolean;
  character: string; // selected persona name
}

export interface Points {
  earned: Record<string, number>;
  total: number;
}

export interface Progress {
  pos: Record<string, number>;
}

export interface LearnerProfile {
  id: string;
  name: string;
  /** character id from src/lib/characters.ts */
  character: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface ProfilesState {
  profiles: LearnerProfile[];
  activeId: string | null;
}

export const MAX_PROFILES = 3;

const SETTINGS_KEY = 'samsaarikam-settings-v1';
const STARS_KEY = 'samsaarikam-stars-v1';
const POINTS_KEY = 'mfk-points-v1';
const PROGRESS_KEY = 'mfk-progress-v1';
const PROFILES_KEY = 'mfk-profiles-v1';

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable: app keeps working in-memory, like the web try/catch
  }
}

export async function loadSettings(): Promise<Settings> {
  const s = await readJSON<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    church: !!s.church,
    character: typeof s.character === 'string' ? s.character : 'Ammachi',
  };
}
export function saveSettings(s: Settings): Promise<void> {
  return writeJSON(SETTINGS_KEY, s);
}

// ---------------------------------------------------------------------------
// Profiles registry

let idCounter = 0;
export function newProfileId(): string {
  idCounter += 1;
  return `p${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(
    Math.random() * 1296,
  ).toString(36)}`;
}

export async function loadProfilesState(): Promise<ProfilesState> {
  const raw = await readJSON<Partial<ProfilesState>>(PROFILES_KEY, {});
  const list = Array.isArray(raw.profiles) ? raw.profiles : [];
  const profiles: LearnerProfile[] = [];
  for (const p of list) {
    if (
      p &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.character === 'string'
    ) {
      profiles.push({
        id: p.id,
        name: p.name,
        character: p.character,
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
        lastUsedAt: typeof p.lastUsedAt === 'number' ? p.lastUsedAt : 0,
      });
    }
  }
  const capped = profiles.slice(0, MAX_PROFILES);
  const activeId =
    typeof raw.activeId === 'string' &&
    capped.some((p) => p.id === raw.activeId)
      ? raw.activeId
      : null;
  return { profiles: capped, activeId };
}

export function saveProfilesState(s: ProfilesState): Promise<void> {
  return writeJSON(PROFILES_KEY, s);
}

// ---------------------------------------------------------------------------
// Per-profile learning data (stars / points / progress)

const starsKeyFor = (profileId: string) => `${STARS_KEY}:${profileId}`;
const pointsKeyFor = (profileId: string) => `${POINTS_KEY}:${profileId}`;
const progressKeyFor = (profileId: string) => `${PROGRESS_KEY}:${profileId}`;

function normalizePoints(p: Partial<Points>): Points {
  return { earned: p.earned ?? {}, total: p.total ?? 0 };
}
function normalizeProgress(p: Partial<Progress>): Progress {
  return { pos: p.pos ?? {} };
}

export async function loadStarsFor(
  profileId: string,
): Promise<Record<string, boolean>> {
  return readJSON<Record<string, boolean>>(starsKeyFor(profileId), {});
}
export function saveStarsFor(
  profileId: string,
  s: Record<string, boolean>,
): Promise<void> {
  return writeJSON(starsKeyFor(profileId), s);
}

export async function loadPointsFor(profileId: string): Promise<Points> {
  return normalizePoints(
    await readJSON<Partial<Points>>(pointsKeyFor(profileId), {}),
  );
}
export function savePointsFor(profileId: string, p: Points): Promise<void> {
  return writeJSON(pointsKeyFor(profileId), p);
}

export async function loadProgressFor(profileId: string): Promise<Progress> {
  return normalizeProgress(
    await readJSON<Partial<Progress>>(progressKeyFor(profileId), {}),
  );
}
export function saveProgressFor(profileId: string, p: Progress): Promise<void> {
  return writeJSON(progressKeyFor(profileId), p);
}

/** Settings "Reset stars" for one learner: clears their stars, points and saved positions. */
export async function resetLearningDataFor(profileId: string): Promise<void> {
  await AsyncStorage.multiRemove([
    starsKeyFor(profileId),
    pointsKeyFor(profileId),
    progressKeyFor(profileId),
  ]);
}

/** Deleting a profile removes all of its learning data too. */
export async function deleteProfileData(profileId: string): Promise<void> {
  await resetLearningDataFor(profileId);
}

// ---------------------------------------------------------------------------
// Legacy (pre-profiles) stores — read once for the migration, then removed.

export async function loadLegacyLearningData(): Promise<{
  stars: Record<string, boolean>;
  points: Points;
  progress: Progress;
  hasData: boolean;
}> {
  const [stars, pointsRaw, progressRaw] = await Promise.all([
    readJSON<Record<string, boolean>>(STARS_KEY, {}),
    readJSON<Partial<Points>>(POINTS_KEY, {}),
    readJSON<Partial<Progress>>(PROGRESS_KEY, {}),
  ]);
  const points = normalizePoints(pointsRaw);
  const progress = normalizeProgress(progressRaw);
  const hasData =
    Object.keys(stars).length > 0 ||
    points.total > 0 ||
    Object.keys(points.earned).length > 0 ||
    Object.keys(progress.pos).length > 0;
  return { stars, points, progress, hasData };
}

/**
 * One-time migration: move the legacy global learning data into the first
 * profile's stores and remove the legacy keys. Returns true when there was
 * legacy data to adopt.
 */
export async function adoptLegacyLearningData(
  profileId: string,
): Promise<boolean> {
  const legacy = await loadLegacyLearningData();
  if (legacy.hasData) {
    await Promise.all([
      saveStarsFor(profileId, legacy.stars),
      savePointsFor(profileId, legacy.points),
      saveProgressFor(profileId, legacy.progress),
    ]);
  }
  await AsyncStorage.multiRemove([STARS_KEY, POINTS_KEY, PROGRESS_KEY]);
  return legacy.hasData;
}
