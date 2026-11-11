import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  audioModuleFor,
  autoChoices,
  recKeyFor,
  voiceKeyFor,
  type Choice,
  type Phrase,
} from '../data';
import { playModule, setRecordingMode, stopPlayback } from '../lib/player';
import PracticeRecorder from '../components/PracticeRecorder';
import { SpeakerIcon } from '../components/icons';
import { C, shared } from '../theme';

export interface LessonInfo {
  /** unit id (talk) or set id (basics) */
  id: string;
  title: string;
  basic: boolean;
  personaId: string | null;
  phrases: Phrase[];
  /** progress key: "unitId:Persona" or "setId" */
  progressKey: string;
  /** points key: "unitId:Persona" or "basics:setId" */
  pointsKey: string;
  /** stars key: "unit:unitId:Persona" or "unit:setId" */
  starKey: string;
  pointsValue: number;
  initialIndex: number;
}

interface Props {
  lesson: LessonInfo;
  onExit: () => void;
  onProgress: (progressKey: string, index: number) => void;
  /** Called once when the lesson completes. Returns the award presentation. */
  onComplete: (info: LessonInfo) => { already: boolean; total: number };
  /** Practice-recording key namespace of the active learner profile (fix round 4). */
  recKeyPrefix: string;
}

type Stage = 'hear' | 'listen' | 'complete';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emojiLen(e: string): number {
  return [...e].length;
}

export default function LessonScreen({ lesson, onExit, onProgress, onComplete, recKeyPrefix }: Props) {
  const total = lesson.phrases.length;
  const [index, setIndex] = useState(Math.min(lesson.initialIndex, total - 1));
  const [stage, setStage] = useState<Stage>('hear');
  const [award, setAward] = useState<{ already: boolean; total: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrongPick, setWrongPick] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phrase = lesson.phrases[index];
  const voiceKey = voiceKeyFor(lesson.personaId, index, lesson.basic);
  const modelModule = audioModuleFor(phrase.ml, voiceKey);

  const choices: (Choice & { correct: boolean })[] = useMemo(() => {
    if (stage !== 'listen') return [];
    const base = autoChoices(lesson.phrases, index);
    return shuffle(base.map((c, i) => ({ ...c, correct: i === 0 })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index, lesson.id]);

  useEffect(() => {
    return () => {
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      stopPlayback();
    };
  }, []);

  // Audio-session lifecycle (bug #8, reconciled in fix round 3): the
  // session is set recording-capable when the lesson opens and restored
  // to playback when it closes, so the common case never waits on a
  // flip. The recorder no longer RELIES on this having succeeded,
  // though: the old code's fire-and-forget flip could silently fail
  // (its errors are swallowed) and the recorder created in the same
  // commit then failed every prepare for the whole phrase. The
  // recorder now awaits the recording session itself at Record-tap
  // time and retries with a fresh recorder instance on any failure;
  // this mount/unmount pair just keeps the steady state right and
  // restores playback mode (and stops playback) on exit. An
  // in-progress take is stopped and saved by the recorder itself
  // when it unmounts.
  useEffect(() => {
    void setRecordingMode(true);
    return () => {
      void setRecordingMode(false);
    };
  }, []);

  const playPhrase = () => {
    if (modelModule != null) playModule(modelModule);
  };

  const pickChoice = (i: number) => {
    if (done) return;
    if (choices[i].correct) {
      setDone(true);
      setPicked(i);
    } else {
      setWrongPick(i);
      playPhrase();
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => setWrongPick(null), 850);
    }
  };

  const nextFromListen = () => {
    stopPlayback();
    if (index < total - 1) {
      const ni = index + 1;
      onProgress(lesson.progressKey, ni);
      setIndex(ni);
      setStage('hear');
      setPicked(null);
      setWrongPick(null);
      setDone(false);
    } else {
      const res = onComplete(lesson);
      setAward(res);
      setStage('complete');
    }
  };

  // In-lesson step back (fix round 3 — Rich's clarified definition from
  // the build-32 bug list): the floating ‹ button steps back ONE step in
  // the lesson's step sequence (hear A then quiz B per phrase, so the
  // sequence runs ... 2A, 2B, 3A ...). From a quiz step it returns to
  // that phrase's hear step; from a hear step it returns to the previous
  // phrase's quiz step; from the very first step (1A) it exits the
  // lesson with the usual returnStep behaviour. The persisted
  // in-progress position follows the stepped-back position; stars are
  // untouched (completion still fires only at the end).
  const stepBack = () => {
    stopPlayback();
    if (stage === 'listen') {
      setStage('hear');
      setPicked(null);
      setWrongPick(null);
      setDone(false);
    } else if (stage === 'hear' && index > 0) {
      const ni = index - 1;
      onProgress(lesson.progressKey, ni);
      setIndex(ni);
      setStage('listen');
      setPicked(null);
      setWrongPick(null);
      setDone(false);
    } else {
      onExit();
    }
  };

  const restart = () => {
    setIndex(0);
    setStage('hear');
    setPicked(null);
    setWrongPick(null);
    setDone(false);
    setAward(null);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onExit} activeOpacity={0.7}>
            <Text style={styles.backLink}>
              ← {lesson.basic ? 'First Words' : 'Adventures'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.counter}>
            {stage === 'complete' ? 'Adventure complete!' : `${index + 1} of ${total}`}
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${stage === 'complete' ? 100 : (index / total) * 100}%` },
            ]}
          />
        </View>

        {stage === 'hear' && (
          <View style={styles.card}>
            <Text style={shared.stepPill}>{index + 1}A · LISTEN &amp; SAY</Text>
            <Text style={styles.mutedCenter}>Hear it, then say it out loud.</Text>
            {lesson.basic && (
              <Text
                style={[
                  styles.wordVisual,
                  {
                    fontSize:
                      emojiLen(phrase.emoji) > 8 ? 32 : emojiLen(phrase.emoji) > 3 ? 46 : 66,
                  },
                ]}
              >
                {phrase.emoji}
              </Text>
            )}
            <Text style={styles.bigPhrase}>{phrase.text}</Text>
            <Text style={styles.meaning}>{phrase.english}</Text>
            <TouchableOpacity style={styles.speakBtn} onPress={playPhrase} activeOpacity={0.85}>
              <SpeakerIcon size={34} />
            </TouchableOpacity>
            <Text style={styles.listenCap}>Listen to the pronunciation</Text>

            <PracticeRecorder
              recKey={
                recKeyPrefix +
                recKeyFor(
                  { id: lesson.id, basic: lesson.basic },
                  lesson.personaId,
                  phrase,
                  index,
                )
              }
            />

            <TouchableOpacity
              style={[shared.primaryBtn, styles.nextBtn]}
              onPress={() => {
                stopPlayback();
                setStage('listen');
                setPicked(null);
                setWrongPick(null);
                setDone(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={shared.primaryBtnText}>I said it! Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {stage === 'listen' && (
          <View style={styles.card}>
            <Text style={shared.stepPill}>{index + 1}B · PICK THE PICTURE</Text>
            <Text style={styles.h2}>What did you hear?</Text>
            <TouchableOpacity style={styles.speakBtn} onPress={playPhrase} activeOpacity={0.85}>
              <SpeakerIcon size={34} />
            </TouchableOpacity>
            <View style={styles.choiceGrid}>
              {choices.map((choice, i) => {
                const isCorrectPick = done && picked === i;
                const isWrong = wrongPick === i;
                return (
                  <TouchableOpacity
                    key={`${choice.emoji}|${choice.label}`}
                    style={[
                      styles.choice,
                      isCorrectPick && styles.choiceCorrect,
                      isWrong && styles.choiceWrong,
                    ]}
                    onPress={() => pickChoice(i)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.picture,
                        {
                          fontSize:
                            emojiLen(choice.emoji) > 8 ? 24 : emojiLen(choice.emoji) > 3 ? 30 : 40,
                        },
                      ]}
                    >
                      {choice.emoji}
                    </Text>
                    <Text style={styles.caption}>{choice.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {done ? (
              <Text style={[styles.feedback, styles.feedbackGood]}>Yes! You found it! ★</Text>
            ) : wrongPick != null ? (
              <Text style={[styles.feedback, styles.feedbackTry]}>
                Good try! Listen once more and pick again.
              </Text>
            ) : null}
            {done && (
              <TouchableOpacity
                style={[shared.primaryBtn, styles.nextBtn]}
                onPress={nextFromListen}
                activeOpacity={0.85}
              >
                <Text style={shared.primaryBtnText}>Next →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {stage === 'complete' && (
          <View style={[styles.card, styles.completeCard]}>
            <Text style={styles.completeStar}>★</Text>
            <Text style={styles.completeTitle}>Congratulations!</Text>
            <Text style={styles.completeText}>
              You finished <Text style={{ fontWeight: '800' }}>{lesson.title}</Text>!{'\n'}
              You practised {total} Malayalam phrases.
            </Text>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsBadgeText}>
                {award && !award.already
                  ? `+${lesson.pointsValue} stars!`
                  : '★ Adventure star earned!'}
              </Text>
            </View>
            <View style={styles.totalPill}>
              <Text style={styles.totalText}>⭐ Total stars: {award ? award.total : 0}</Text>
            </View>
            <View style={styles.completeBtns}>
              <TouchableOpacity
                style={[shared.secondaryBtn, { flex: 1 }]}
                onPress={restart}
                activeOpacity={0.85}
              >
                <Text style={shared.secondaryBtnText}>Play again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[shared.primaryBtn, { flex: 1 }]}
                onPress={onExit}
                activeOpacity={0.85}
              >
                <Text style={shared.primaryBtnText}>More adventures</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {stage !== 'complete' && (
        <TouchableOpacity style={styles.roundBack} onPress={stepBack} activeOpacity={0.85}>
          <Text style={styles.roundBackText}>‹</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 30 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backLink: { color: C.purpleText, fontWeight: '700', fontSize: 15 },
  counter: { color: C.muted, fontSize: 13 },
  track: {
    height: 10,
    borderRadius: 999,
    backgroundColor: C.track,
    overflow: 'hidden',
    marginBottom: 14,
  },
  fill: { height: '100%', backgroundColor: C.purple, borderRadius: 999 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#5a3cb4',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  mutedCenter: { color: C.muted, fontSize: 15, marginTop: 12, textAlign: 'center' },
  wordVisual: { marginTop: 14, textAlign: 'center' },
  bigPhrase: {
    fontSize: 29,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 36,
  },
  meaning: { fontSize: 16.5, color: C.muted, textAlign: 'center', marginTop: 5 },
  speakBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  listenCap: { color: C.faint, fontSize: 13, fontWeight: '600', marginTop: 9 },
  nextBtn: { width: '100%', marginTop: 16 },
  h2: { fontSize: 21, fontWeight: '800', color: C.ink, marginTop: 12, textAlign: 'center' },
  choiceGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },
  choice: {
    flex: 1,
    minHeight: 102,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: C.cardBorder,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 6,
  },
  choiceCorrect: { borderColor: C.green, backgroundColor: C.greenBg },
  choiceWrong: { borderColor: '#f0a3a3', backgroundColor: '#fdecec' },
  picture: { textAlign: 'center' },
  caption: { fontSize: 13.5, fontWeight: '700', color: C.inkSoft, textAlign: 'center' },
  feedback: {
    marginTop: 12,
    fontSize: 15.5,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  feedbackGood: { color: '#157347', backgroundColor: C.greenBg },
  feedbackTry: { color: '#8a5a00', backgroundColor: '#fff3d6' },
  completeCard: { paddingTop: 26, paddingBottom: 24 },
  completeStar: { fontSize: 62, color: C.gold, lineHeight: 68 },
  completeTitle: { fontSize: 24, fontWeight: '800', color: C.ink, marginTop: 4 },
  completeText: {
    fontSize: 15.5,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  pointsBadge: {
    backgroundColor: '#fef0c0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  pointsBadgeText: { fontSize: 16, fontWeight: '900', color: '#8a5a00' },
  totalPill: {
    backgroundColor: C.lavender,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
    marginTop: 12,
    marginBottom: 22,
  },
  totalText: { fontSize: 13.5, fontWeight: '700', color: C.inkSoft },
  completeBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  roundBack: {
    position: 'absolute',
    left: 14,
    bottom: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5a3cb4',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  roundBackText: { fontSize: 24, color: C.purpleText, lineHeight: 26, fontWeight: '700' },
});
