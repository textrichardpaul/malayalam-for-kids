// PCM decoding for Sound Match, on-device via react-native-audio-api
// (Web Audio API implementation). decodeAudioData accepts a bundled asset
// module id (number) or a local file path/URI string.
// Returns mono PCM: channels are averaged, the same mixdown the Node
// validation harness gets from `ffmpeg -ac 1`.
//
// RATE CHOKE POINT: every buffer decoded here — model clips AND recorded
// takes — leaves at exactly 44100 Hz, the only rate the Sound Match
// calibration is valid at. iPhones decode at 48000 Hz; left alone, that
// shifted every on-device score (a correct take scored 17%). We first ask
// the AudioContext for 44100 Hz, and whatever rate actually arrives is
// resampled by ensureTargetRate (resample.ts) as the guarantee.
import { AudioContext, type AudioBuffer } from 'react-native-audio-api';
import type { Pcm } from './soundMatch';
import { ensureTargetRate, TARGET_SAMPLE_RATE } from './resample';

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!ctx) {
    try {
      ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      ctx = new AudioContext();
    }
  }
  return ctx;
}

const modelCache = new Map<number, Promise<Pcm>>();

function toMono(buf: AudioBuffer): Pcm {
  const channels = Math.max(1, buf.numberOfChannels);
  const len = buf.length;
  const out = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / channels;
  }
  return ensureTargetRate({ data: out, sampleRate: buf.sampleRate });
}

/** Decode a bundled model clip (module id from AUDIO_ASSETS). Cached per session. */
export function pcmFromModule(moduleId: number): Promise<Pcm> {
  let p = modelCache.get(moduleId);
  if (!p) {
    p = audioCtx()
      .decodeAudioData(moduleId)
      .then(toMono);
    modelCache.set(moduleId, p);
    // A rejected decode must not poison the cache for the whole session:
    // evict it so the next request retries the decode. (Callers awaiting
    // `p` itself still see the rejection, exactly as before.)
    p.catch(() => {
      if (modelCache.get(moduleId) === p) modelCache.delete(moduleId);
    });
  }
  return p;
}

/** Decode a local audio file (a saved practice take). */
export async function pcmFromFile(uri: string): Promise<Pcm> {
  const buf = await audioCtx().decodeAudioData(uri);
  return toMono(buf);
}
