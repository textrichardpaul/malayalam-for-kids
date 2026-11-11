/**
 * Sample-rate normalization for Sound Match — the single choke point every
 * decoded clip passes through before analysis (see decode.ts).
 *
 * Why: the Sound Match calibration (SM_ALGO 4) is only valid at 44100 Hz.
 * On iPhone, react-native-audio-api decodes at the device rate (48000 Hz),
 * and expo-audio takes are likewise decoded at whatever rate the device
 * hands back. At 48000 the analysis discretization shifts (frame/hop sizes
 * in samples, mel frame selection) and genuine takes score far below their
 * calibrated values (Rich's correct "naal'" scored 17% on device while the
 * 44100 offline harness reproduces the calibration matrix 100/100).
 *
 * The fix is not to re-tune the scorer — it is to make the device present
 * the same 44100 Hz waveform the calibration saw. Everything (model clips
 * AND recorded takes) is resampled to exactly 44100 here, with a
 * band-limited windowed-sinc resampler. The offline harness
 * (tools/validate_soundmatch.mjs) runs its 48000 Hz device simulation
 * through THIS function and requires the identical score matrix.
 *
 * Pure TypeScript, no native imports, so the Node harness can import this
 * exact module — there is no second copy of the resampler anywhere.
 */

export const TARGET_SAMPLE_RATE = 44100;

export interface RatePcm {
  data: Float32Array;
  sampleRate: number;
}

/**
 * Band-limited resampling (windowed sinc, Blackman window) from one sample
 * rate to another. Partial kernels at the clip edges are renormalized so
 * short clips don't fade at the ends.
 */
export function resamplePcm(
  data: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return data;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.round(data.length * ratio));
  const out = new Float32Array(outLen);
  // Anti-alias cutoff when downsampling: never let content above the new
  // Nyquist into the kernel.
  const cutoff = Math.min(1, ratio);
  const HALF = 24; // kernel half-width in input samples at cutoff = 1
  const width = HALF / cutoff;
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio;
    const j0 = Math.ceil(pos - width);
    const j1 = Math.floor(pos + width);
    let sum = 0;
    let wsum = 0;
    for (let j = j0; j <= j1; j++) {
      if (j < 0 || j >= data.length) continue;
      const t = (j - pos) * cutoff;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const u = (j - pos) / width; // -1..1 across the kernel
      const win =
        0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
      const w = sinc * win;
      sum += data[j] * w;
      wsum += w;
    }
    out[i] = wsum !== 0 ? sum / wsum : 0;
  }
  return out;
}

/**
 * The choke point: return the clip at exactly TARGET_SAMPLE_RATE, resampled
 * if (and only if) it arrived at any other rate. Already-44100 clips are
 * returned untouched, object identity preserved (the Sound Match analysis
 * cache keys on it).
 */
export function ensureTargetRate<T extends RatePcm>(pcm: T): T {
  if (pcm.sampleRate === TARGET_SAMPLE_RATE) return pcm;
  return {
    ...pcm,
    data: resamplePcm(pcm.data, pcm.sampleRate, TARGET_SAMPLE_RATE),
    sampleRate: TARGET_SAMPLE_RATE,
  };
}
