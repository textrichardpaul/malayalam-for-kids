import React, { useState } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CHARACTERS, characterById } from '../lib/characters';
import { MAX_PROFILES, type LearnerProfile } from '../lib/storage';
import { C, shared } from '../theme';

interface Props {
  mode: 'picker' | 'create';
  profiles: LearnerProfile[];
  onPick: (id: string) => void;
  onAddLearner: () => void;
  onCreate: (name: string, characterId: string) => void;
  /** Null on the very first run: there is nothing to go back to. */
  onCancelCreate: (() => void) | null;
}

/**
 * The app's front door (fix round 4): "Who is learning today?" — pick a
 * learner profile, or create one (max MAX_PROFILES). With zero profiles
 * the app opens straight on the create flow: a profile is required to
 * enter, because all progress belongs to a profile.
 */
export default function ProfileGateScreen({
  mode,
  profiles,
  onPick,
  onAddLearner,
  onCreate,
  onCancelCreate,
}: Props) {
  const sorted = [...profiles].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.brandRow}>
        <Image source={require('../../assets/icon.png')} style={styles.brandIcon} />
        <Text style={styles.brandText}>Malayalam for Kids</Text>
      </View>

      {mode === 'picker' ? (
        <>
          <Text style={styles.title}>Who is learning today?</Text>
          <Text style={styles.sub}>
            Tap your picture to keep going with your own stars and adventures.
          </Text>
          <View style={styles.grid}>
            {sorted.map((p) => {
              const ch = characterById(p.character);
              return (
                <BounceCard
                  key={p.id}
                  style={styles.card}
                  onPress={() => onPick(p.id)}
                  accessibilityLabel={`Learn as ${p.name}`}
                >
                  <View style={[styles.avatar, { backgroundColor: ch.color }]}>
                    <Text style={styles.avatarEmoji}>{ch.emoji}</Text>
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {p.name}
                  </Text>
                </BounceCard>
              );
            })}
            {profiles.length < MAX_PROFILES && (
              <TouchableOpacity
                style={[styles.card, styles.addCard]}
                onPress={onAddLearner}
                activeOpacity={0.85}
                accessibilityLabel="Add a learner"
              >
                <View style={styles.addCircle}>
                  <Text style={styles.addPlus}>+</Text>
                </View>
                <Text style={styles.addText}>Add a learner</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <CreateForm
          firstRun={profiles.length === 0}
          onCreate={onCreate}
          onCancel={onCancelCreate}
        />
      )}
    </ScrollView>
  );
}

function CreateForm({
  firstRun,
  onCreate,
  onCancel,
}: {
  firstRun: boolean;
  onCreate: (name: string, characterId: string) => void;
  onCancel: (() => void) | null;
}) {
  const [name, setName] = useState('');
  const [character, setCharacter] = useState(CHARACTERS[0].id);
  const trimmed = name.trim();
  const canStart = trimmed.length > 0;

  return (
    <>
      <Text style={styles.title}>
        {firstRun ? 'Who is learning today?' : 'Add a learner'}
      </Text>
      <Text style={styles.sub}>
        {firstRun
          ? "Let's make a profile first, so stars and adventures are saved for the right learner."
          : 'Make a profile so their stars and adventures stay their own.'}
      </Text>

      <Text style={styles.fieldLabel}>Learner&apos;s name</Text>
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Zoey"
        placeholderTextColor={C.faint}
        maxLength={12}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Learner's name"
      />

      <Text style={styles.fieldLabel}>Pick a character</Text>
      <View style={styles.charGrid}>
        {CHARACTERS.map((c) => {
          const selected = c.id === character;
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.charCell}
              onPress={() => setCharacter(c.id)}
              activeOpacity={0.85}
              accessibilityLabel={`Character ${c.label}`}
            >
              <View
                style={[
                  styles.charCircle,
                  { backgroundColor: c.color },
                  selected && styles.charCircleSelected,
                ]}
              >
                <Text style={styles.charEmoji}>{c.emoji}</Text>
              </View>
              <Text style={[styles.charLabel, selected && styles.charLabelSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[shared.primaryBtn, styles.startBtn, !canStart && styles.startBtnOff]}
        onPress={() => canStart && onCreate(trimmed, character)}
        activeOpacity={0.85}
        accessibilityLabel="Start learning"
      >
        <Text style={shared.primaryBtnText}>Start learning →</Text>
      </TouchableOpacity>
      {onCancel && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

/** Profile card with a subtle spring bounce on press (core Animated only). */
function BounceCard({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: object;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const bounce = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 38,
      bounciness: 14,
    }).start();
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={styles.cardInner}
        onPress={onPress}
        onPressIn={() => bounce(0.94)}
        onPressOut={() => bounce(1)}
        activeOpacity={1}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 28 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  brandIcon: { width: 40, height: 40, borderRadius: 11 },
  brandText: { fontSize: 20, fontWeight: '800', color: '#33275e' },
  title: { fontSize: 26, fontWeight: '800', color: C.ink, lineHeight: 32 },
  sub: { fontSize: 14.5, color: C.muted, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.cardBorder,
    minHeight: 158,
    shadowColor: '#5a3cb4',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 42 },
  cardName: { fontSize: 18, fontWeight: '800', color: C.ink },
  addCard: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: C.recBorder,
    shadowOpacity: 0,
    elevation: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  addCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: { fontSize: 40, fontWeight: '800', color: C.purple, lineHeight: 44 },
  addText: { fontSize: 16, fontWeight: '800', color: C.purpleText },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: C.purpleText,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  nameInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: C.chipBorder,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
  },
  charGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  charCell: { width: '25%', alignItems: 'center' },
  charCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  charCircleSelected: { borderColor: C.purple },
  charEmoji: { fontSize: 32 },
  charLabel: { fontSize: 12, fontWeight: '700', color: C.faint, marginTop: 4 },
  charLabelSelected: { color: C.purpleText },
  startBtn: { marginTop: 24 },
  startBtnOff: { opacity: 0.45 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, fontWeight: '700', color: C.muted },
});
