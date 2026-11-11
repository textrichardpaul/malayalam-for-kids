import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BASICS_SETS,
  JOURNEY_COUNT,
  PERSONAS,
  PLANNED_COUNT,
  TALK_UNITS,
  swapName,
  type BasicsSet,
  type TalkUnit,
} from '../data';
import type { LearnerProfile, Points, Progress, Settings } from '../lib/storage';
import { characterById } from '../lib/characters';
import { C } from '../theme';

export type StepSelection = 0 | 1 | 2;

interface Props {
  step: StepSelection;
  onSelectStep: (s: StepSelection) => void;
  settings: Settings;
  stars: Record<string, boolean>;
  points: Points;
  progress: Progress;
  /** Active learner profile (fix round 4): drives the switch chip and the progress heading. */
  profile: LearnerProfile;
  onSwitchProfile: () => void;
  onSelectPersona: (personaId: string) => void;
  onOpenTalk: (unit: TalkUnit) => void;
  onOpenBasics: (set: BasicsSet) => void;
  onLockedChurch: () => void;
  scrollRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
}

/** "Zoey's progress" / "James' progress" */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function talkPct(
  unit: TalkUnit,
  personaId: string,
  stars: Record<string, boolean>,
  progress: Progress,
): number {
  if (stars[`unit:${unit.id}:${personaId}`]) return 100;
  const pos = progress.pos[`${unit.id}:${personaId}`] ?? 0;
  const total = (unit.sets[personaId]?.length ?? 0) + 2;
  return pos > 0 ? Math.round((pos / total) * 100) : 0;
}

function basicsPct(
  set: BasicsSet,
  stars: Record<string, boolean>,
  progress: Progress,
): number {
  if (stars[`unit:${set.id}`]) return 100;
  const pos = progress.pos[set.id] ?? 0;
  return pos > 0 ? Math.round((pos / set.phrases.length) * 100) : 0;
}

export default function HomeScreen({
  step,
  onSelectStep,
  settings,
  stars,
  points,
  progress,
  profile,
  onSwitchProfile,
  onSelectPersona,
  onOpenTalk,
  onOpenBasics,
  onLockedChurch,
  scrollRef,
}: Props) {
  const personaId = settings.character;
  const profileChar = characterById(profile.character);
  const visibleUnits = TALK_UNITS.filter((u) => u.sets[personaId]);

  // Homepage progress (Rich, Nov 5): one entry in points.earned per completed
  // unit (Step 1 set or Talk journey), and points.total is the same star
  // count the hero pill shows — so this section always agrees with the pill.
  const TOTAL_UNITS = BASICS_SETS.length + JOURNEY_COUNT;
  const completedCount = Object.keys(points.earned).length;
  const progressPct =
    TOTAL_UNITS > 0
      ? Math.min(100, Math.round((completedCount / TOTAL_UNITS) * 100))
      : 0;

  // Hero image sizing (bug #2): aspectRatio + percentage width rendered the
  // illustration massively zoomed/cropped on device. Use explicit numbers:
  // the frame is the window minus the hero card's 12pt screen margins and
  // 16pt padding on each side; the artwork is exactly 1920x1280.
  const { width: windowWidth } = useWindowDimensions();
  const heroFrameW = windowWidth - 24 - 32;
  const heroFrameH = Math.round(heroFrameW * (1280 / 1920));

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {step === 0 && (
        <TouchableOpacity
          style={styles.profileChip}
          onPress={onSwitchProfile}
          activeOpacity={0.85}
          accessibilityLabel={`Learning as ${profile.name}. Tap to switch learner.`}
        >
          <View
            style={[styles.profileChipAvatar, { backgroundColor: profileChar.color }]}
          >
            <Text style={styles.profileChipEmoji}>{profileChar.emoji}</Text>
          </View>
          <Text style={styles.profileChipName} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={styles.profileChipSwitch}>Switch</Text>
        </TouchableOpacity>
      )}

      {step === 0 && (
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>LEARN TO SPEAK TO FAMILY &amp; FRIENDS</Text>
          <Text style={styles.h1}>Let&apos;s talk in Malayalam!</Text>
          <View
            style={[styles.heroWrap, { width: heroFrameW, height: heroFrameH }]}
          >
            <View style={styles.heroFrame}>
              <Image
                source={require('../../assets/family.png')}
                style={{ width: heroFrameW, height: heroFrameH }}
                resizeMode="contain"
              />
            </View>
            <HeroBubble
              text="Sukhamano?"
              style={styles.bubbleTL}
              tailStyle={styles.bubbleTailBL}
            />
            <HeroBubble
              text="Kazhicho?"
              style={styles.bubbleTR}
              tailStyle={styles.bubbleTailBR}
            />
            <HeroBubble
              text="Vaa, kalikkaam!"
              style={styles.bubbleBL}
              tailStyle={styles.bubbleTailTL}
            />
            <HeroBubble
              text="Nanni!"
              style={styles.bubbleBR}
              tailStyle={styles.bubbleTailTR}
            />
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statText}>★ {points.total} stars</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statText}>{JOURNEY_COUNT} talk journeys</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statText}>{PLANNED_COUNT} lessons</Text>
            </View>
          </View>
        </View>
      )}

      {step === 0 && (
        <View style={styles.progressSection}>
          <Text style={styles.progressHeading}>
            {possessive(profile.name)} progress
          </Text>
          <View style={styles.homeProgressTrack}>
            <View
              style={[styles.homeProgressFill, { width: `${progressPct}%` }]}
            />
          </View>
          <Text style={styles.progressCaption}>
            {completedCount} of {TOTAL_UNITS} completed · ★ {points.total}{' '}
            stars collected
          </Text>
        </View>
      )}

      <View style={styles.stepRow}>
        <TouchableOpacity
          style={[styles.stepBtn, step === 1 && styles.stepBtnActive]}
          onPress={() => onSelectStep(1)}
          activeOpacity={0.85}
        >
          <Text style={styles.stepKicker}>STEP 1</Text>
          <Text style={styles.stepName}>First Words</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.stepBtn, step === 2 && styles.stepBtnActive]}
          onPress={() => onSelectStep(2)}
          activeOpacity={0.85}
        >
          <Text style={styles.stepKicker}>STEP 2</Text>
          <Text style={styles.stepName}>Talk Adventures</Text>
        </TouchableOpacity>
      </View>

      {step === 1 && (
        <View style={styles.section}>
          <View style={styles.grid}>
            {BASICS_SETS.map((set) => {
              const pct = basicsPct(set, stars, progress);
              const finished = !!stars[`unit:${set.id}`];
              return (
                <TouchableOpacity
                  key={set.id}
                  style={styles.card}
                  onPress={() => onOpenBasics(set)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.cardIcon, { backgroundColor: set.color }]}>
                    <Text style={styles.cardEmoji}>{set.emoji}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{set.title}</Text>
                  <Text style={styles.cardMeta}>
                    {finished
                      ? '★ Finished'
                      : pct > 0
                        ? `${set.phrases.length} phrases · ${pct}%`
                        : `${set.phrases.length} phrases`}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={styles.section}>
          <Text style={styles.pickerTitle}>Who do you want to talk to?</Text>
          <View style={styles.chips}>
            {PERSONAS.map((p) => {
              const active = p.id === personaId;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onSelectPersona(p.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {p.emoji} {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.h2}>Pick an adventure</Text>
          <Text style={styles.mutedSmall}>
            Pick a person, then pick an adventure and start talking.
          </Text>

          <View style={styles.grid}>
            {visibleUnits.map((unit, idx) => {
              const pct = talkPct(unit, personaId, stars, progress);
              const finished = !!stars[`unit:${unit.id}:${personaId}`];
              const setLen = unit.sets[personaId]?.length ?? 0;
              const locked = !!unit.optional && !settings.church;
              return (
                <TouchableOpacity
                  key={unit.id}
                  style={styles.card}
                  onPress={() => (locked ? onLockedChurch() : onOpenTalk(unit))}
                  activeOpacity={0.85}
                >
                  <View style={[styles.cardIcon, { backgroundColor: unit.color }]}>
                    <Text style={styles.cardNumber}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{swapName(unit.title, personaId)}</Text>
                  <Text style={styles.cardMeta}>
                    {locked
                      ? `Opt-in · ${unit.planned ?? setLen + 2} phrases · Soon`
                      : finished
                        ? '★ Finished'
                        : pct > 0
                          ? `${setLen} phrases · ${pct}%`
                          : `${setLen} phrases`}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {step !== 0 && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            <Text style={{ fontWeight: '800' }}>For grown-ups:</Text> This is a
            speaking-first app. Every voice you hear is a real recorded Malayalam
            voice. Step 1 teaches first words. Step 2 teaches talking with family
            and friends - pick a person and start a conversation.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

/**
 * A speech bubble straddling one corner of the hero image, as in the
 * approved home mockup. The bubbles hang mostly outside the image edges
 * (over the hero card), so they never sit on a face.
 */
function HeroBubble({
  text,
  style,
  tailStyle,
}: {
  text: string;
  style: StyleProp<ViewStyle>;
  tailStyle: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bubble, style]}>
      <View style={[styles.bubbleTail, tailStyle]} />
      <Text style={styles.bubbleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 18 },
  hero: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 22,
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fdeedd',
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: '#7c5cbf',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroWrap: {
    position: 'relative',
    // Clearance for the top hero bubbles: they are anchored at top: -13 and
    // their shadow reaches ~4pt above the bubble edge, so marginTop 30
    // leaves a visible ~13pt gap between the headline and the bubbles.
    marginTop: 30,
    marginBottom: 24,
    alignSelf: 'center',
  },
  heroFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#cdbcf5',
  },
  h1: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  bubble: {
    position: 'absolute',
    zIndex: 3,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    shadowColor: '#5b21b6',
    shadowOpacity: 0.2,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bubbleText: {
    color: '#5b21b6',
    fontWeight: '800',
    fontSize: 13.5,
  },
  bubbleTail: {
    position: 'absolute',
    width: 10,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  bubbleTL: { top: -13, left: -4, transform: [{ rotate: '-4deg' }] },
  bubbleTR: { top: -13, right: -2, transform: [{ rotate: '3deg' }] },
  bubbleBL: { bottom: -16, left: 2, transform: [{ rotate: '-2deg' }] },
  bubbleBR: { bottom: -16, right: 2, transform: [{ rotate: '3deg' }] },
  bubbleTailBL: { bottom: -4, left: 22 },
  bubbleTailBR: { bottom: -4, right: 22 },
  bubbleTailTL: { top: -4, left: 26 },
  bubbleTailTR: { top: -4, right: 20 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
  },
  stat: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.inkSoft,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 13,
    shadowColor: '#5a3cb4',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  profileChipAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileChipEmoji: { fontSize: 19 },
  profileChipName: { fontSize: 14.5, fontWeight: '800', color: C.ink, maxWidth: 140 },
  profileChipSwitch: { fontSize: 12.5, fontWeight: '800', color: C.purpleText },
  progressSection: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  progressHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 7,
  },
  homeProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: C.track,
    overflow: 'hidden',
  },
  homeProgressFill: {
    height: '100%',
    backgroundColor: C.purple,
    borderRadius: 999,
  },
  progressCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    marginTop: 6,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 8,
    shadowColor: '#5a3cb4',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  stepBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: C.lavender,
    alignItems: 'center',
  },
  stepBtnActive: {
    backgroundColor: '#ddd0fb',
  },
  stepKicker: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.purpleText,
    opacity: 0.7,
  },
  stepName: {
    fontSize: 18,
    fontWeight: '800',
    color: C.purpleDeep,
    marginTop: 2,
  },
  section: {
    marginHorizontal: 12,
    marginTop: 14,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 14,
  },
  chip: {
    borderWidth: 2,
    borderColor: C.chipBorder,
    backgroundColor: C.chipBg,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: C.purple,
    backgroundColor: C.lavenderLight,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.inkSoft,
  },
  chipTextActive: {
    color: C.purpleText,
  },
  h2: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  mutedSmall: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    minHeight: 118,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardEmoji: { fontSize: 21 },
  cardNumber: { fontSize: 20, fontWeight: '900', color: '#5b21b6' },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#332b4d',
    lineHeight: 19,
  },
  cardMeta: {
    fontSize: 12,
    color: C.faint,
    marginTop: 3,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: C.track,
    marginTop: 9,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.purple,
    borderRadius: 999,
  },
  notice: {
    marginHorizontal: 12,
    marginTop: 16,
    backgroundColor: '#f8f4ff',
    borderRadius: 16,
    padding: 13,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    color: C.inkSoft,
  },
});
