// Single shared audio player (expo-audio) for model clips and "Play mine".
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;
let modeReady = false;

export async function initAudioMode(): Promise<void> {
  if (modeReady) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    modeReady = true;
  } catch {
    // non-fatal: playback still attempted
  }
}

/**
 * Flip the audio session between playback and recording. Returns whether
 * the native call succeeded — the practice recorder's tap-time setup
 * (fix round 3) needs a real failure signal so it can retry with a fresh
 * recorder; fire-and-forget callers may ignore the result.
 */
export async function setRecordingMode(on: boolean): Promise<boolean> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: on });
    return true;
  } catch {
    return false;
  }
}

function getPlayer(): AudioPlayer {
  if (!player) player = createAudioPlayer(null);
  return player;
}

/** Play a bundled model clip by module id (from AUDIO_ASSETS). */
export function playModule(moduleId: number): void {
  const p = getPlayer();
  try {
    p.replace(moduleId);
    p.play();
  } catch {
    // ignore playback errors, same spirit as web .catch(()=>{})
  }
}

/** Play a local file (a saved practice take). */
export function playUri(uri: string): void {
  const p = getPlayer();
  try {
    p.replace({ uri });
    p.play();
  } catch {
    // ignore
  }
}

export function stopPlayback(): void {
  try {
    player?.pause();
  } catch {
    // ignore
  }
}
