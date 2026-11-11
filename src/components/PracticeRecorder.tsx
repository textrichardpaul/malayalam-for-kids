import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { getPractice, practiceFileUri, saveTake, type PracticeRec } from '../lib/practice';
import { playUri, setRecordingMode, stopPlayback } from '../lib/player';
import { C } from '../theme';

// Fix round 3 (build-32 bug list): the pronunciation-scoring feature is
// REMOVED — its percentage was inconsistent on Rich's iPhone and a judge
// that misjudges is worse than none. The practice recorder stays: record
// a take, it is saved on this device, Play mine plays it back. No score
// is computed anywhere in the lesson path and the old scoring module is
// unreferenced by every screen and component.
//
// The recorder is also rebuilt for reliability (bug #3). The old failure:
// the native recorder was created once when the component mounted — in the
// same commit as (and racing) the lesson's fire-and-forget session flip —
// and Record did "prepare + record only" against that one instance. One
// failed prepare (session not yet recording-capable, recorder wedged)
// set the "not available" status, which then persisted for the whole
// phrase: the status text was only reset when the phrase changed, there
// was no retry and no way to get a fresh recorder without leaving the
// phrase, and every further tap failed identically against the same
// instance, so Record looked inert. Now: no mount-time availability gate;
// every Record tap runs the full setup (stop playback, mic permission,
// awaited recording session, prepare + start), and any failure recreates
// the recorder (epoch remount of RecorderSlot) and retries once. The
// "not available" message can only appear after both attempts fail, and
// it never latches — the next tap starts the sequence fresh.

const STATUS_DEFAULT = 'Tap Record, say it out loud, then play yourself back.';
const STATUS_SAVED = 'Saved on this device — tap Play mine to hear it.';
const STATUS_GOT_IT = 'Got it! Tap Play mine to hear yourself.';
const STATUS_RECORDING = 'Recording... say it out loud!';
const STATUS_MIC_OFF =
  'The microphone is off. A grown-up can allow it in the device settings.';
const STATUS_UNAVAILABLE = 'Recording is not available on this device.';

interface RecorderApi {
  epoch: number;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
}

/**
 * Owns ONE native AudioRecorder (created by the hook on mount, released on
 * unmount). Remounting this slot with a new epoch is how a wedged recorder
 * gets replaced with a fresh instance. It registers an imperative API for
 * the parent and, when the phrase changes or it unmounts mid-take, stops
 * the take and hands the file up to be saved (web v41 behaviour).
 */
function RecorderSlot({
  epoch,
  recKey,
  apiRef,
  onRecordingChange,
  onTakeSaved,
}: {
  epoch: number;
  recKey: string;
  apiRef: React.RefObject<RecorderApi | null>;
  onRecordingChange: (recording: boolean) => void;
  onTakeSaved: (key: string, uri: string) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recordingRef = useRef(false);

  // Keep the ref in sync with the polled recorder state (effect, not
  // render). On a phrase change all effect cleanups run before any new
  // effect, so the leave-phrase cleanup below still reads the value for
  // the phrase being left.
  useEffect(() => {
    recordingRef.current = recorderState.isRecording;
  });

  useEffect(() => {
    const api: RecorderApi = {
      epoch,
      start: async () => {
        await recorder.prepareToRecordAsync();
        recorder.record();
      },
      stop: async () => {
        await recorder.stop();
        return recorder.uri;
      },
    };
    apiRef.current = api;
    return () => {
      if (apiRef.current === api) apiRef.current = null;
    };
  }, [recorder, epoch, apiRef]);

  useEffect(() => {
    onRecordingChange(recorderState.isRecording);
  }, [recorderState.isRecording, onRecordingChange]);

  // Leaving the phrase (recKey change) or unmounting mid-take: stop and
  // keep the take. The cleanup's closure holds the recKey of the phrase
  // being left, which is exactly the key the take belongs under. (The
  // audio-session mode is NOT touched here — LessonScreen restores
  // playback mode when the lesson closes.)
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        const keyAtLeave = recKey;
        recorder
          .stop()
          .then(() => {
            const uri = recorder.uri;
            if (uri) onTakeSaved(keyAtLeave, uri);
          })
          .catch(() => {});
      }
    };
  }, [recKey, recorder, onTakeSaved]);

  return null;
}

interface Props {
  recKey: string;
}

export default function PracticeRecorder({ recKey }: Props) {
  const [rec, setRec] = useState<PracticeRec | null>(null);
  const [status, setStatus] = useState(STATUS_DEFAULT);
  // Latest phrase key, for async completions that must only touch the
  // UI if their phrase is still on screen. Updated inside the load
  // effect below (not during render).
  const keyRef = useRef(recKey);
  // Mic permission, once granted, is not re-checked on every Record tap
  // (the native round-trip was a visible delay before recording).
  const permGrantedRef = useRef(false);
  // Transition guard (bug #8): overlapping Record/Stop taps used to
  // interleave native start/stop calls and wedge the recorder. While a
  // transition is in flight, further taps are ignored.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  // Optimistic recording state for the UI: the recorder state poll
  // (~500ms) used to make the button lag the tap by up to half a second.
  // Handlers set this synchronously; the poll reconciles it when idle.
  const [uiRecording, setUiRecording] = useState(false);
  const recordingRef = useRef(false);
  // Recorder instance management: the slot mounted under this epoch owns
  // the live native recorder; bumping the epoch remounts the slot with a
  // fresh one (the retry path after a failed start).
  const [epoch, setEpoch] = useState(0);
  const epochRef = useRef(0);
  const apiRef = useRef<RecorderApi | null>(null);

  const handleRecordingChange = useCallback((recording: boolean) => {
    // The slot's poll reconciles the optimistic UI state while idle; the
    // tap handlers own it during transitions.
    if (!busyRef.current) {
      recordingRef.current = recording;
      setUiRecording(recording);
    }
  }, []);

  const handleTakeSaved = useCallback((key: string, uri: string) => {
    void saveTake(key, uri).then((stored) => {
      if (stored && key === keyRef.current) {
        setRec(stored);
        setStatus(STATUS_SAVED);
      }
    });
  }, []);

  // Load any saved take for this phrase.
  useEffect(() => {
    keyRef.current = recKey;
    let cancelled = false;
    setRec(null);
    setStatus(STATUS_DEFAULT);
    (async () => {
      const stored = await getPractice(recKey);
      if (cancelled || !stored) return;
      setRec(stored);
      setStatus(STATUS_SAVED);
    })();
    return () => {
      cancelled = true;
    };
  }, [recKey]);

  /** Resolve once the slot for `targetEpoch` has registered its API. */
  const waitForRecorder = async (targetEpoch: number): Promise<RecorderApi> => {
    for (let i = 0; i < 100; i++) {
      const api = apiRef.current;
      if (api && api.epoch === targetEpoch) return api;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('recorder did not mount');
  };

  /** Permission gate for one start sequence: true = granted. Native
   *  errors throw (they belong to the retryable sequence); an actual
   *  denial returns false and is NOT retried — it gets the gentle
   *  message instead. */
  const ensurePermission = async (): Promise<boolean> => {
    if (permGrantedRef.current) return true;
    const current = await AudioModule.getRecordingPermissionsAsync();
    if (current.granted) {
      permGrantedRef.current = true;
      return true;
    }
    const requested = await AudioModule.requestRecordingPermissionsAsync();
    if (requested.granted) {
      permGrantedRef.current = true;
      return true;
    }
    return false;
  };

  /**
   * One full Record-tap setup sequence, in order: stop any playing
   * audio (model clip / Play mine), ensure mic permission, await the
   * recording audio session, then prepare + start the recorder.
   * Returns 'denied' for a mic denial; throws on any other failure.
   */
  const attemptStart = async (): Promise<'started' | 'denied'> => {
    stopPlayback();
    if (!(await ensurePermission())) return 'denied';
    if (!(await setRecordingMode(true))) throw new Error('audio session failed');
    const api = await waitForRecorder(epochRef.current);
    await api.start();
    return 'started';
  };

  const toggleRecord = async () => {
    // Ignore taps while a start/stop transition is in flight — overlapping
    // native calls were wedging the recorder (bug #8).
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (recordingRef.current) {
        const api = apiRef.current;
        let uri: string | null = null;
        try {
          uri = api ? await api.stop() : null;
        } catch {
          uri = null;
        }
        recordingRef.current = false;
        setUiRecording(false);
        if (!uri) return;
        const stored = await saveTake(recKey, uri);
        if (!stored) return;
        setRec(stored);
        setStatus(STATUS_GOT_IT);
        return;
      }
      let outcome: 'started' | 'denied';
      try {
        outcome = await attemptStart();
      } catch {
        // Any failure in the sequence: throw the recorder away, mount a
        // fresh one, and run the whole sequence once more.
        const nextEpoch = epochRef.current + 1;
        epochRef.current = nextEpoch;
        setEpoch(nextEpoch);
        try {
          outcome = await attemptStart();
        } catch {
          // Both attempts failed. The message does NOT latch: nothing is
          // remembered, so the next tap starts the sequence fresh.
          setStatus(STATUS_UNAVAILABLE);
          return;
        }
      }
      if (outcome === 'denied') {
        setStatus(STATUS_MIC_OFF);
        return;
      }
      recordingRef.current = true;
      setUiRecording(true);
      setStatus(STATUS_RECORDING);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const playMine = () => {
    // Playback is a direct replace+play (immediate); ignore taps while a
    // record transition is running or a take is being recorded.
    if (!rec || recordingRef.current || busyRef.current) return;
    playUri(practiceFileUri(rec));
  };

  const isRecording = uiRecording;

  return (
    <View style={styles.box}>
      <RecorderSlot
        key={epoch}
        epoch={epoch}
        recKey={recKey}
        apiRef={apiRef}
        onRecordingChange={handleRecordingChange}
        onTakeSaved={handleTakeSaved}
      />
      <Text style={styles.title}>Record your practice</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.btn,
            styles.recBtn,
            isRecording && styles.recBtnActive,
            busy && styles.btnBusy,
          ]}
          onPress={toggleRecord}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.recBtnText}>
            {isRecording ? '■ Stop' : rec ? '● Record again' : '● Record'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.btn,
            styles.playBtn,
            (!rec || isRecording || busy) && styles.btnDisabled,
          ]}
          onPress={playMine}
          disabled={!rec || isRecording || busy}
          activeOpacity={0.85}
        >
          <Text style={styles.playBtnText}>▶ Play mine</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 14,
    backgroundColor: C.recBg,
    borderWidth: 1.5,
    borderColor: C.recBorder,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: '100%',
  },
  title: {
    fontWeight: '900',
    color: C.purpleDark,
    fontSize: 14.5,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 9,
  },
  btn: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  recBtn: {
    backgroundColor: C.purple,
  },
  recBtnActive: {
    backgroundColor: C.red,
  },
  recBtnText: {
    fontWeight: '800',
    fontSize: 13.5,
    color: '#fff',
  },
  playBtn: {
    backgroundColor: C.lavender,
  },
  playBtnText: {
    fontWeight: '800',
    fontSize: 13.5,
    color: C.purpleDark,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnBusy: {
    opacity: 0.75,
  },
  status: {
    marginTop: 9,
    textAlign: 'center',
    color: C.muted,
    fontSize: 13,
  },
});
