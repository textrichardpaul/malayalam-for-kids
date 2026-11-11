/**
 * Sound Match scoring — pure TypeScript port of the shipped web algorithm
 * (Malayalam for Kids web prototype v44, SM_ALGO = 4).
 *
 * Source of truth: deploy/index.html, the Sound Match block beginning at
 * `var SM_ALGO=4;` (smEnvelope … computeSoundMatch). This module reproduces
 * that code's math function-for-function and constant-for-constant; it is a
 * port, not a re-derivation. Do not re-tune anything here without re-running
 * the web calibration (verify_v44) — the constants below were tuned together.
 *
 * What the caller supplies: already-decoded MONO PCM for the model clip, the
 * user's take, and the competitor clips (the other items in the same lesson,
 * as the web app collects them in recCompetitorSrcsForCurrent). Decoding is
 * the caller's job, exactly as WebAudio decodeAudioData was the web app's.
 *
 * Deviations from the web implementation (all unavoidable / by design):
 *  1. Input is mono PCM instead of an AudioBuffer. The web code down-mixes
 *     stereo to mono by averaging channels (smSamples); callers must do the
 *     equivalent before calling scoreTake.
 *  2. The web code decodes every clip at the single AudioContext sample
 *     rate, so model/take/competitors always share one rate. Here each clip
 *     is analysed at its own `sampleRate` (the analysis is rate-relative:
 *     all windows/hops/FFT sizes derive from sr), which is equivalent when
 *     the rates match — callers should decode everything at one rate.
 *  3. WebAudio decodeAudioData (browser MP3 decoder + resampler) is not
 *     reproduced; decoder differences shift samples slightly. The offline
 *     validation harness decodes with ffmpeg at 44100 Hz — evidently the
 *     verify browser's AudioContext rate — and reproduces the recorded v44
 *     numbers matrix 100/100 cells exactly (calib43's offline tuning used
 *     22050 Hz, which lands within ±3 but not exact). See
 *     tools/validate_soundmatch.mjs.
 *  4. The web FFT (smFFT) is already plain JS in the source; it is ported
 *     verbatim (iterative radix-2, Float64Array) — no WebAudio AnalyserNode
 *     or OfflineAudioContext is involved anywhere in the algorithm.
 *  5. Competitor handling: the web filters out the model's own src and caps
 *     the list at 16 by URL; here competitors are PCM clips, so scoreTake
 *     caps the list at 16 and silently skips competitors with no audible
 *     voice (the web does the same via its null model analyses).
 *  6. If the MODEL clip itself has no audible voice, the web's
 *     computeSoundMatch returns null (no result at all). scoreTake returns
 *     { score: null, heard: true } in that case (the take was heard; there
 *     is simply nothing to score against).
 *  7. Session memoization (performance only, added after the v44
 *     calibration): smFull is a pure function of (samples, sampleRate), so
 *     scoreTake caches each clip's analysis on its Pcm object's identity
 *     (see smFullFor). Callers decode the model and competitor clips once
 *     per session and pass the same Pcm objects on every take, so repeat
 *     takes skip straight to comparing against the cached analyses; only
 *     the fresh take (a new Pcm each time) is analysed from scratch.
 *     Outputs are bit-identical — verified by tools/validate_soundmatch.mjs
 *     (100/100 cells, ALL CHECKS PASSED) after the change.
 *  8. Rate normalization (fix round 2): on device, decode.ts now resamples
 *     EVERY clip to exactly 44100 Hz before it reaches scoreTake (see
 *     resample.ts). Note 2's "equivalent when the rates match" was true in
 *     theory but not in practice at 48000 Hz — the discretization differs
 *     and the calibrated constants no longer land where they were tuned.
 *     The harness's device simulation (48000 decode -> the app's own
 *     resampler -> score) must reproduce the 44100 matrix exactly.
 */

export const SM_ALGO = 4;

export type Pcm = { data: Float32Array; sampleRate: number };

export type SoundMatchResult = { score: number | null; heard: boolean };

/* ------------------------------------------------------------------ */
/* Envelope shape (v42 lineage)                                        */
/* ------------------------------------------------------------------ */

function smEnvelope(
  samples: Float32Array,
  startS: number,
  endS: number,
  bins: number,
): number[] {
  const len = Math.max(1, endS - startS);
  const env: number[] = [];
  for (let b = 0; b < bins; b++) {
    const a = startS + Math.floor((len * b) / bins);
    const c = startS + Math.floor((len * (b + 1)) / bins);
    let s = 0;
    let cnt = 0;
    for (let j = a; j < c; j += 2) {
      s += samples[j] * samples[j];
      cnt++;
    }
    env.push(Math.sqrt(s / Math.max(1, cnt)));
  }
  const o = env.slice();
  for (let i = 0; i < bins; i++) {
    const l = env[Math.max(0, i - 1)];
    const m = env[i];
    const r = env[Math.min(bins - 1, i + 1)];
    o[i] = (l + 2 * m + r) / 4;
  }
  let mx = 0;
  for (let i = 0; i < bins; i++) if (o[i] > mx) mx = o[i];
  if (!(mx > 0)) mx = 1;
  return o.map((v) => Math.sqrt(v / mx));
}

function smPearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mbv = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mbv += b[i];
  }
  ma /= n;
  mbv /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mbv;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da <= 0 || db <= 0) return 0;
  const c = num / Math.sqrt(da * db);
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

function smDtwSim(a: number[], b: number[]): number {
  const n = a.length;
  const m = b.length;
  const BAND = Math.ceil(n * 0.35);
  const INF = Infinity;
  let prev: number[] = [];
  let cur: number[] = [];
  for (let j = 0; j < m; j++) {
    prev.push(INF);
    cur.push(INF);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) cur[j] = INF;
    const j0 = Math.max(0, i - BAND);
    const j1 = Math.min(m, i + BAND + 1);
    for (let j = j0; j < j1; j++) {
      const cost = Math.abs(a[i] - b[j]);
      if (i === 0 && j === 0) {
        cur[j] = cost;
        continue;
      }
      if (i === 0) {
        cur[j] = cost + cur[j - 1];
        continue;
      }
      if (j === 0) {
        cur[j] = cost + prev[j];
        continue;
      }
      cur[j] = cost + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  const avg = prev[m - 1] / Math.max(n, m);
  const s = 1 - avg / 0.22;
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

/* ------------------------------------------------------------------ */
/* Spectral analysis (v43)                                             */
/* ------------------------------------------------------------------ */

const SM_NB = 24;
let SM_EDGES: number[] | null = null;
let SM_BANDSUB: number[] | null = null;

function smEdges(): number[] {
  if (SM_EDGES) return SM_EDGES;
  const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  const invm = (x: number) => 700 * (Math.pow(10, x / 2595) - 1);
  const lo = mel(100);
  const hi = mel(8000);
  const e: number[] = [];
  for (let b = 0; b <= SM_NB; b++) e.push(invm(lo + ((hi - lo) * b) / SM_NB));
  SM_EDGES = e;
  return e;
}

function smBandSub(): number[] {
  if (SM_BANDSUB) return SM_BANDSUB;
  const e = smEdges();
  const out: number[] = [];
  for (let b = 0; b < SM_NB; b++) {
    const c = Math.sqrt(e[b] * e[b + 1]);
    if (c >= 250 && c <= 3600) out.push(b);
  }
  SM_BANDSUB = out;
  return out;
}

function smFFT(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wre = Math.cos(ang);
    const wim = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let pre = 1;
      let pim = 0;
      for (let k = 0; k < half; k++) {
        const a1 = i + k;
        const a2 = i + k + half;
        const ure = re[a2] * pre - im[a2] * pim;
        const uim = re[a2] * pim + im[a2] * pre;
        re[a2] = re[a1] - ure;
        im[a2] = im[a1] - uim;
        re[a1] += ure;
        im[a1] += uim;
        const nre = pre * wre - pim * wim;
        pim = pre * wim + pim * wre;
        pre = nre;
      }
    }
  }
}

function smLogmel(
  samples: Float32Array,
  startS: number,
  endS: number,
  sr: number,
): number[][] {
  const segLen = endS - startS;
  let nfft = 1;
  while (nfft < sr * 0.04) nfft *= 2;
  const hop = Math.max(1, Math.round(sr * 0.01));
  const win: number[] = [];
  for (let i = 0; i < nfft; i++)
    win.push(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (nfft - 1)));
  const edges = smEdges();
  const bandLo: number[] = [];
  const bandHi: number[] = [];
  for (let b = 0; b < SM_NB; b++) {
    bandLo.push(Math.ceil((edges[b] * nfft) / sr));
    bandHi.push(Math.ceil((edges[b + 1] * nfft) / sr));
  }
  const half = nfft / 2;
  function frameAt(p: number): { logE: number[]; rms: number } {
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    let raw = 0;
    let cnt = 0;
    for (let jj = 0; jj < nfft; jj++) {
      const v = p + jj < segLen ? samples[startS + p + jj] : 0;
      re[jj] = v * win[jj];
      if (p + jj < segLen) {
        raw += v * v;
        cnt++;
      }
    }
    smFFT(re, im);
    const logE: number[] = [];
    for (let b = 0; b < SM_NB; b++) {
      let e = 0;
      for (let k = bandLo[b]; k < bandHi[b] && k <= half; k++)
        e += re[k] * re[k] + im[k] * im[k];
      logE.push(Math.log(e + 1e-10));
    }
    return { logE, rms: Math.sqrt(raw / Math.max(1, cnt)) };
  }
  let frames: number[][] = [];
  const espe: number[] = [];
  if (segLen >= nfft) {
    for (let pos = 0; pos + nfft <= segLen; pos += hop) {
      const f = frameAt(pos);
      frames.push(f.logE);
      espe.push(f.rms);
    }
  }
  if (!frames.length) {
    const f0 = frameAt(0);
    frames.push(f0.logE);
    espe.push(1.0);
  }
  let mx = 0;
  for (let i2 = 0; i2 < espe.length; i2++) if (espe[i2] > mx) mx = espe[i2];
  const kept: number[][] = [];
  for (let i2 = 0; i2 < frames.length; i2++) {
    if (espe[i2] >= 0.04 * mx) kept.push(frames[i2]);
  }
  if (kept.length >= 3 && kept.length < frames.length) frames = kept;
  return frames;
}

/* ------------------------------------------------------------------ */
/* Full per-clip analysis: trim, envelopes, mel frames                 */
/* ------------------------------------------------------------------ */

type SmAnalysis = {
  heard: true;
  dur: number;
  envP: number[];
  envD: number[];
  logmel: number[][];
};

type SmNoHeard = { heard: false };

/* Trim near-silence (same rule as v42), then envelopes + mel frames.
   heard=false when the clip has essentially no voice in it
   (peak frame RMS < 0.015). */
function smFull(samples: Float32Array, sr: number): SmAnalysis | SmNoHeard {
  const frameLen = Math.max(1, Math.floor(sr * 0.02));
  const hopF = Math.max(1, Math.floor(sr * 0.01));
  const nF = Math.max(1, Math.floor((samples.length - frameLen) / hopF) + 1);
  const fr: number[] = [];
  let peak = 0;
  for (let i = 0; i < nF; i++) {
    let s = 0;
    let cnt = 0;
    const st = i * hopF;
    for (let j = 0; j < frameLen && st + j < samples.length; j += 2) {
      const v = samples[st + j];
      s += v * v;
      cnt++;
    }
    const rms = Math.sqrt(s / Math.max(1, cnt));
    fr.push(rms);
    if (rms > peak) peak = rms;
  }
  if (peak < 0.015) return { heard: false };
  const thr = Math.max(peak * 0.12, 0.004);
  let lo = 0;
  while (lo < nF && fr[lo] <= thr) lo++;
  let hi = nF - 1;
  while (hi > lo && fr[hi] <= thr) hi--;
  const startS = lo * hopF;
  const endS = Math.min(samples.length, hi * hopF + frameLen);
  return {
    heard: true,
    dur: (endS - startS) / sr,
    envP: smEnvelope(samples, startS, endS, 16),
    envD: smEnvelope(samples, startS, endS, 24),
    logmel: smLogmel(samples, startS, endS, sr),
  };
}

/* ------------------------------------------------------------------ */
/* Spectral representations and comparisons                            */
/* ------------------------------------------------------------------ */

function smNormRows(V: number[][]): number[][] {
  return V.map((row) => {
    let n = 0;
    for (let i = 0; i < row.length; i++) n += row[i] * row[i];
    n = Math.sqrt(n);
    if (n < 1e-9) n = 1e-9;
    return row.map((x) => x / n);
  });
}

function smFsRep(lm: number[][], bands: number[] | null): number[][] {
  let V = lm.map((row) => {
    let m = 0;
    for (let i = 0; i < row.length; i++) m += row[i];
    m /= row.length;
    return row.map((x) => x - m);
  });
  if (bands)
    V = V.map((row) => bands.map((b) => row[b]));
  return smNormRows(V);
}

let SM_DCT: number[][] | null = null;
let SM_LIFT: number[] | null = null;

function smMfRep(lm: number[][]): number[][] {
  if (!SM_DCT || !SM_LIFT) {
    SM_DCT = [];
    SM_LIFT = [];
    for (let k = 0; k < 13; k++) {
      const row: number[] = [];
      for (let n = 0; n < SM_NB; n++)
        row.push(Math.cos((Math.PI * k * (n + 0.5)) / SM_NB));
      SM_DCT.push(row);
    }
    for (let k = 1; k < 13; k++) SM_LIFT.push(1 + 11 * Math.sin((Math.PI * k) / 22));
  }
  const dct = SM_DCT;
  const lift = SM_LIFT;
  const T = lm.length;
  let C: number[][] = [];
  for (let t = 0; t < T; t++) {
    const coeffs: number[] = [];
    for (let k2 = 0; k2 < 13; k2++) {
      let s = 0;
      for (let j = 0; j < SM_NB; j++) s += dct[k2][j] * lm[t][j];
      coeffs.push(s);
    }
    C.push(coeffs.slice(1).map((v, idx) => v * lift[idx]));
  }
  const means: number[] = [];
  for (let d = 0; d < 12; d++) {
    let s2 = 0;
    for (let t = 0; t < T; t++) s2 += C[t][d];
    means.push(s2 / T);
  }
  C = C.map((row) => row.map((v, idx) => v - means[idx]));
  return smNormRows(C);
}

function smShift(V: number[][], s: number): number[][] {
  if (!s) return V;
  return V.map((row) => {
    const n = row.length;
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let src = i - s;
      if (src < 0) src = 0;
      if (src > n - 1) src = n - 1;
      out[i] = row[src];
    }
    return out;
  });
}

function smResample(V: number[][], T: number): number[][] {
  const n = V.length;
  const out: number[][] = [];
  if (n === T) return V.map((r) => r.slice());
  for (let t = 0; t < T; t++) {
    const pos = ((n - 1) * t) / (T - 1);
    const loI = Math.floor(pos);
    const hiI = Math.min(loI + 1, n - 1);
    const f = pos - loI;
    const row: number[] = [];
    for (let d = 0; d < V[0].length; d++)
      row.push(V[loI][d] * (1 - f) + V[hiI][d] * f);
    out.push(row);
  }
  return out;
}

function smSegMeans(V: number[][], K: number): number[][] {
  const T = V.length;
  const out: number[][] = [];
  for (let k = 0; k < K; k++) {
    const a = Math.floor((T * k) / K);
    const bnd = Math.max(a + 1, Math.floor((T * (k + 1)) / K));
    const s = new Array<number>(V[0].length).fill(0);
    for (let i = a; i < bnd; i++)
      for (let d = 0; d < s.length; d++) s[d] += V[i][d];
    for (let d = 0; d < s.length; d++) s[d] /= bnd - a;
    let n = 0;
    for (let d = 0; d < s.length; d++) n += s[d] * s[d];
    n = Math.sqrt(n);
    if (n > 1e-9) {
      for (let d = 0; d < s.length; d++) s[d] /= n;
    }
    out.push(s);
  }
  return out;
}

function smDot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function smClip1(c: number): number {
  return c > 1 ? 1 : c < -1 ? -1 : c;
}

function smTnCos(A: number[][], B: number[][], T?: number): number {
  const TT = T || 24;
  const A2 = smResample(A, TT);
  const B2 = smResample(B, TT);
  let s = 0;
  for (let i = 0; i < TT; i++) s += smClip1(smDot(A2[i], B2[i]));
  return s / TT;
}

function smSegCos(A: number[][], B: number[][], K: number): number {
  const Sm = smSegMeans(A, K);
  const Su = smSegMeans(B, K);
  let s = 0;
  for (let i = 0; i < K; i++) s += smClip1(smDot(Sm[i], Su[i]));
  return s / K;
}

function smCrossChance(A2: number[][], B2: number[][]): number {
  const T = A2.length;
  let s = 0;
  let cnt = 0;
  for (let i = 0; i < T; i++)
    for (let j = 0; j < T; j++) {
      if (Math.abs(i - j) > 1) {
        s += smDot(A2[i], B2[j]);
        cnt++;
      }
    }
  return cnt ? s / cnt : 0;
}

function smTnRel(A: number[][], B: number[][]): number {
  let best = -1;
  const A2 = smResample(A, 24);
  for (let si = -2; si <= 2; si++) {
    const B2 = smResample(smShift(B, si), 24);
    let al = 0;
    for (let i = 0; i < 24; i++) al += smClip1(smDot(A2[i], B2[i]));
    al /= 24;
    const ch = smCrossChance(A2, B2);
    const rel = (al - ch) / Math.max(1e-6, 1 - ch);
    if (rel > best) best = rel;
  }
  return best;
}

function smSegRel(A: number[][], B: number[][], K: number): number {
  let best = -1;
  const Sm = smSegMeans(A, K);
  const half = Math.floor(K / 2);
  for (let si = -2; si <= 2; si++) {
    const Su = smSegMeans(smShift(B, si), K);
    let al = 0;
    let ch = 0;
    for (let i = 0; i < K; i++) al += smClip1(smDot(Sm[i], Su[i]));
    al /= K;
    for (let i = 0; i < K; i++) ch += smClip1(smDot(Sm[i], Su[(i + half) % K]));
    ch /= K;
    const rel = (al - ch) / Math.max(1e-6, 1 - ch);
    if (rel > best) best = rel;
  }
  return best;
}

function smNdtw(A: number[][], B: number[][]): number {
  const n = A.length;
  const m = B.length;
  const D: number[][] = [];
  const all: number[] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < m; j++) {
      const d = 1 - smDot(A[i], B[j]);
      row.push(d);
      all.push(d);
    }
    D.push(row);
  }
  all.sort((x, y) => x - y);
  const med =
    all.length % 2
      ? all[Math.floor(all.length / 2)]
      : (all[all.length / 2 - 1] + all[all.length / 2]) / 2;
  const scale = med + 1e-9;
  const BAND = Math.max(Math.abs(n - m) + 2, Math.ceil(Math.max(n, m) * 0.35));
  let prev: number[] = [];
  let plen: number[] = [];
  let cur: number[] = [];
  let clen: number[] = [];
  for (let j = 0; j < m; j++) {
    prev.push(Infinity);
    plen.push(0);
    cur.push(Infinity);
    clen.push(0);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      cur[j] = Infinity;
      clen[j] = 0;
    }
    const j0 = Math.max(0, i - BAND);
    const j1 = Math.min(m, i + BAND + 1);
    for (let j = j0; j < j1; j++) {
      const cost = D[i][j] / scale;
      if (i === 0 && j === 0) {
        cur[j] = cost;
        clen[j] = 1;
        continue;
      }
      const opts: Array<[number, number]> = [];
      if (i > 0) opts.push([prev[j], plen[j]]);
      if (j > 0) opts.push([cur[j - 1], clen[j - 1]]);
      if (i > 0 && j > 0) opts.push([prev[j - 1], plen[j - 1]]);
      if (!opts.length) continue;
      let bi = 0;
      for (let oi = 1; oi < opts.length; oi++) {
        if (
          opts[oi][0] < opts[bi][0] ||
          (opts[oi][0] === opts[bi][0] && opts[oi][1] < opts[bi][1])
        )
          bi = oi;
      }
      cur[j] = cost + opts[bi][0];
      clen[j] = opts[bi][1] + 1;
    }
    const tp = prev;
    prev = cur;
    cur = tp;
    const tl = plen;
    plen = clen;
    clen = tl;
  }
  if (!plen[m - 1]) return 0;
  return prev[m - 1] / plen[m - 1];
}

function smClamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/* Spectral similarity: the mean of eight chance-aware, pitch-tolerant
   comparisons of the two mel patterns. High only when the take really
   sounds like the model. */
function smSimSpec(ma: SmAnalysis, ua: SmAnalysis): number {
  const sub = smBandSub();
  const mB = smFsRep(ma.logmel, sub);
  const uB = smFsRep(ua.logmel, sub);
  const mF = smFsRep(ma.logmel, null);
  const uF = smFsRep(ua.logmel, null);
  const mM = smMfRep(ma.logmel);
  const uM = smMfRep(ua.logmel);
  let segB4 = -Infinity;
  let segB6 = -Infinity;
  let segF6 = -Infinity;
  for (let s = -2; s <= 2; s++) {
    const uBs = smShift(uB, s);
    const uFs = smShift(uF, s);
    let v = smSegCos(mB, uBs, 4);
    if (v > segB4) segB4 = v;
    v = smSegCos(mB, uBs, 6);
    if (v > segB6) segB6 = v;
    v = smSegCos(mF, uFs, 6);
    if (v > segF6) segF6 = v;
  }
  let nd = Infinity;
  for (let s = -1; s <= 1; s++) {
    const v = smNdtw(mB, smShift(uB, s));
    if (v < nd) nd = v;
  }
  const comps = [
    smClamp01((segB4 - 0.45) / 0.5),
    smClamp01((segB6 - 0.5) / 0.45),
    smClamp01(smSegRel(mB, uB, 6)),
    smClamp01(smSegRel(mB, uB, 4)),
    smClamp01(smTnRel(mB, uB)),
    smClamp01((1.05 - nd) / 0.75),
    smClamp01((smTnCos(mM, uM, 24) + 0.05) / 0.45),
    smClamp01((segF6 - 0.5) / 0.45),
  ];
  let sum = 0;
  for (let i = 0; i < comps.length; i++) sum += comps[i];
  return sum / comps.length;
}

/* ------------------------------------------------------------------ */
/* Session cache of per-clip analyses (see header note 7)              */
/* ------------------------------------------------------------------ */

const smAnalysisCache = new WeakMap<
  Pcm,
  { sampleRate: number; result: SmAnalysis | SmNoHeard }
>();

/** smFull, memoized on the Pcm object's identity for the session. */
function smFullFor(pcm: Pcm): SmAnalysis | SmNoHeard {
  const hit = smAnalysisCache.get(pcm);
  if (hit && hit.sampleRate === pcm.sampleRate) return hit.result;
  const result = smFull(pcm.data, pcm.sampleRate);
  smAnalysisCache.set(pcm, { sampleRate: pcm.sampleRate, result });
  return result;
}

/**
 * Run (and cache) a clip's analysis ahead of time. The lesson screen calls
 * this in the background when a phrase mounts — for the model clip and all
 * its competitors — so the first take on the phrase is scored from cache
 * instead of paying the full analysis cost after the child records.
 */
export function prewarmAnalysis(pcm: Pcm): void {
  void smFullFor(pcm);
}

/* ------------------------------------------------------------------ */
/* Pair scoring, competitor margin, display mapping (v43 + v44)        */
/* ------------------------------------------------------------------ */

const SM_W = 0.67;

type SmPair = { sim: number; shape: number; envDur: number; ratio: number };

function smPairAll(ma: SmAnalysis, ua: SmAnalysis): SmPair {
  const envSim = Math.max(smPearson(ma.envP, ua.envP), smDtwSim(ma.envD, ua.envD));
  const ratio = Math.min(ma.dur, ua.dur) / Math.max(ma.dur, ua.dur);
  let durBand = (ratio - 0.3) / 0.3;
  if (durBand < 0) durBand = 0;
  if (durBand > 1) durBand = 1;
  const envDur = 0.7 * envSim + 0.3 * durBand;
  const sim = smSimSpec(ma, ua);
  return { sim, shape: SM_W * sim + (1 - SM_W) * envDur, envDur, ratio };
}

const SM_SLACK = 0.054;
const SM_SCALE = 0.138;
const SM_AMP = 0.481;
const SM_DISCW = 0.252;
const SM_DISCMS = 0.438;
const SM_T = 0.536;
const SM_TIEEPS = 0.01;
const SM_TIECAP = 68;

/**
 * Score a user's take against a model clip, with competitor clips from the
 * same lesson for the margin/tie-cap logic. Faithful port of the web app's
 * computeSoundMatch (v44 / SM_ALGO 4), minus fetching/decoding.
 *
 * Returns { score: null, heard: false } for a silent take
 * (peak frame RMS < 0.015); otherwise { score: 0..100, heard: true }
 * (score is null only when the model clip itself is inaudible — see header).
 */
export function scoreTake(
  model: Pcm,
  take: Pcm,
  competitors: Pcm[],
): SoundMatchResult {
  const ma = smFullFor(model);
  const ua = smFullFor(take);
  if (!ua.heard) return { score: null, heard: false };
  if (!ma.heard) return { score: null, heard: true };

  const t = smPairAll(ma, ua);
  let maxCompSpec: number | null = null;
  let maxCompPair: number | null = null;
  const comps = (competitors || []).slice(0, 16);
  for (let i = 0; i < comps.length; i++) {
    if (!comps[i]) continue;
    const ca = smFullFor(comps[i]);
    if (!ca.heard) continue;
    const cp = smPairAll(ca, ua);
    if (maxCompSpec === null || cp.sim > maxCompSpec) maxCompSpec = cp.sim;
    if (maxCompPair === null || cp.shape > maxCompPair) maxCompPair = cp.shape;
  }

  let specF: number;
  if (maxCompSpec === null) {
    specF = t.sim;
  } else {
    const pen = SM_AMP * smClamp01((maxCompSpec - t.sim - SM_SLACK) / SM_SCALE);
    const penSpec = smClamp01(t.sim - pen);
    const mscore = smClamp01(0.5 + (t.sim - maxCompSpec) / SM_DISCMS);
    specF = smClamp01((1 - SM_DISCW) * penSpec + SM_DISCW * mscore);
  }

  const shape = SM_W * specF + (1 - SM_W) * t.envDur;
  let sc: number;
  if (shape >= SM_T) {
    /* v44 concave top-band stretch */
    const _smT = (shape - SM_T) / (1 - SM_T);
    sc = Math.round(100 - 10 * Math.pow(1 - _smT, 2.2));
  } else {
    sc = Math.round((70 * shape) / SM_T);
  }
  if (t.ratio < 0.3 && sc > 40) sc = 40;
  if (maxCompPair !== null && t.shape - maxCompPair < SM_TIEEPS && sc > SM_TIECAP)
    sc = SM_TIECAP;
  if (sc > 100) sc = 100;
  if (sc < 0) sc = 0;
  return { score: sc, heard: true };
}
