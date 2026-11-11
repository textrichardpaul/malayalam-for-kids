import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { countPractice, clearPractice } from '../lib/practice';
import { CHARACTERS, characterById } from '../lib/characters';
import type { LearnerProfile, Settings } from '../lib/storage';
import { C, shared } from '../theme';

interface Props {
  visible: boolean;
  settings: Settings;
  onClose: () => void;
  onToggleChurch: (on: boolean) => void;
  onResetStars: () => void;
  /** Fix round 4: learner-profile management (the modal is grown-ups only). */
  profiles: LearnerProfile[];
  activeProfileId: string | null;
  /** Practice-store namespace of the active profile; counts/clears apply to it. */
  practicePrefix: string;
  onRenameProfile: (id: string, name: string) => void;
  onChangeProfileCharacter: (id: string, characterId: string) => void;
  onDeleteProfile: (id: string) => void;
}

/**
 * Settings behind a parental gate (Apple Kids requirement): a grown-up
 * must press and hold the button for ~1.5 seconds to get in.
 */
export default function SettingsModal({
  visible,
  settings,
  onClose,
  onToggleChurch,
  onResetStars,
  profiles,
  activeProfileId,
  practicePrefix,
  onRenameProfile,
  onChangeProfileCharacter,
  onDeleteProfile,
}: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [recCount, setRecCount] = useState(0);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible) {
      setUnlocked(false);
      setHoldProgress(0);
      setConfirmDeleteId(null);
      void countPractice(practicePrefix).then(setRecCount);
    }
  }, [visible, practicePrefix]);

  // Name fields read nameDrafts[p.id] ?? p.name, so drafts only ever hold
  // in-progress edits — no snapshot effect needed.
  const commitName = (p: LearnerProfile) => {
    const next = (nameDrafts[p.id] ?? '').trim().slice(0, 12);
    if (next && next !== p.name) onRenameProfile(p.id, next);
    else if (!next)
      setNameDrafts((d) => ({ ...d, [p.id]: p.name }));
  };

  const startHold = () => {
    const started = Date.now();
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / 1500);
      setHoldProgress(p);
      if (p >= 1) {
        if (holdTimer.current) clearInterval(holdTimer.current);
        setUnlocked(true);
      }
    }, 50);
  };

  const endHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    if (!unlocked) setHoldProgress(0);
  };

  const handleClearRecs = async () => {
    await clearPractice(practicePrefix);
    setRecCount(0);
  };

  // Bug #11: with react-native's Modal, the backdrop presented on device
  // but the bottom-anchored sheet never entered the visible frame — the
  // native modal window + slide animation + a flex-end child hosted inside
  // the app's SafeAreaView tree left Rich staring at a dark overlay. The
  // sheet is now rendered in the normal view tree as an absolute overlay:
  // no native modal window, layout is deterministic and verifiable.
  if (!visible) return null;

  return (
    <View style={styles.overlayRoot}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>×</Text>
            </TouchableOpacity>
          </View>

          {!unlocked ? (
            <View style={styles.gate}>
              <Text style={styles.gateTitle}>Grown-ups only</Text>
              <Text style={styles.gateText}>
                Settings are for the grown-ups helping little voices grow. Press
                and hold the button below to open them.
              </Text>
              <TouchableOpacity
                style={styles.holdBtn}
                onPressIn={startHold}
                onPressOut={endHold}
                activeOpacity={0.9}
              >
                <View style={[styles.holdFill, { width: `${holdProgress * 100}%` }]} />
                <Text style={styles.holdBtnText}>Hold to open Settings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.unlockedScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sub}>
                A few controls for the grown-ups helping little voices grow.
              </Text>

              <View style={styles.setting}>
                <Text style={styles.label}>Learner profiles</Text>
                <Text style={styles.small}>
                  Up to 3 learners, each with their own stars, progress and
                  practice recordings on this device.
                </Text>
                {profiles.map((p) => {
                  const ch = characterById(p.character);
                  const isActive = p.id === activeProfileId;
                  return (
                    <View key={p.id} style={styles.profileRow}>
                      <View style={styles.profileHead}>
                        <View
                          style={[
                            styles.profileAvatar,
                            { backgroundColor: ch.color },
                          ]}
                        >
                          <Text style={styles.profileAvatarEmoji}>{ch.emoji}</Text>
                        </View>
                        <TextInput
                          style={styles.profileNameInput}
                          value={nameDrafts[p.id] ?? p.name}
                          onChangeText={(t) =>
                            setNameDrafts((d) => ({ ...d, [p.id]: t }))
                          }
                          onBlur={() => commitName(p)}
                          onSubmitEditing={() => commitName(p)}
                          maxLength={12}
                          autoCapitalize="words"
                          autoCorrect={false}
                          accessibilityLabel={`Name for ${p.name}`}
                        />
                        {isActive && (
                          <View style={styles.activePill}>
                            <Text style={styles.activePillText}>Learning now</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.profileCharRow}>
                        {CHARACTERS.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => onChangeProfileCharacter(p.id, c.id)}
                            activeOpacity={0.85}
                            accessibilityLabel={`Give ${p.name} the ${c.label} character`}
                          >
                            <View
                              style={[
                                styles.profileCharCircle,
                                { backgroundColor: c.color },
                                p.character === c.id &&
                                  styles.profileCharCircleSel,
                              ]}
                            >
                              <Text style={styles.profileCharEmoji}>{c.emoji}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {confirmDeleteId === p.id ? (
                        <View style={styles.deleteConfirm}>
                          <Text style={styles.deleteConfirmText}>
                            Delete {p.name} and all their progress?
                          </Text>
                          <View style={styles.deleteBtns}>
                            <TouchableOpacity
                              style={styles.deleteYes}
                              onPress={() => {
                                setConfirmDeleteId(null);
                                onDeleteProfile(p.id);
                              }}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.deleteYesText}>Yes, delete</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.deleteNo}
                              onPress={() => setConfirmDeleteId(null)}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.deleteNoText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setConfirmDeleteId(p.id)}
                          activeOpacity={0.7}
                          style={styles.deleteLink}
                        >
                          <Text style={styles.deleteLinkText}>
                            Delete this profile
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={styles.setting}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.label}>Enable church and family prayers</Text>
                    <Text style={styles.small}>
                      Optional faith-themed adventure. Turn this on to play it.
                    </Text>
                  </View>
                  <Switch
                    value={settings.church}
                    onValueChange={onToggleChurch}
                    trackColor={{ true: C.purple, false: '#d8d2e8' }}
                  />
                </View>
              </View>

              <View style={styles.setting}>
                <Text style={styles.label}>About recording</Text>
                <Text style={styles.small}>
                  Practice recordings are saved on this device only, so they can
                  be played again later. They are never uploaded to a server.
                  Stars are stored on this device too.
                </Text>
              </View>

              <View style={styles.setting}>
                <Text style={styles.label}>Gentle learning</Text>
                <Text style={styles.small}>
                  Children earn a star for trying. There is no pronunciation
                  score, no speech recognition test, and no penalty for mistakes.
                </Text>
              </View>

              <View style={styles.setting}>
                <Text style={styles.label}>Practice recordings</Text>
                <Text style={styles.small}>
                  {recCount} saved for the current learner on this device.
                  They are never uploaded.
                </Text>
                <TouchableOpacity
                  style={[shared.secondaryBtn, styles.clearBtn]}
                  onPress={handleClearRecs}
                  activeOpacity={0.85}
                >
                  <Text style={shared.secondaryBtnText}>Clear practice recordings</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[shared.secondaryBtn, { flex: 1 }]}
                  onPress={onResetStars}
                  activeOpacity={0.85}
                >
                  <Text style={shared.secondaryBtnText}>Reset stars</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[shared.primaryBtn, { flex: 1 }]}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={shared.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    elevation: 60,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(36,27,51,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    maxHeight: '88%',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 21, fontWeight: '800', color: C.ink },
  close: { fontSize: 28, color: C.faint, lineHeight: 30 },
  sub: { fontSize: 13, color: C.muted, marginTop: 4 },
  gate: { alignItems: 'center', paddingVertical: 18 },
  gateTitle: { fontSize: 17, fontWeight: '800', color: C.ink },
  gateText: {
    fontSize: 13.5,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 18,
  },
  holdBtn: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: C.lavender,
    paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  holdFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#d9c8fa',
  },
  holdBtnText: { fontSize: 16, fontWeight: '800', color: C.purpleDeep },
  setting: {
    borderTopWidth: 1,
    borderTopColor: '#f0eaf8',
    paddingVertical: 13,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: C.ink },
  small: { fontSize: 13, color: C.muted, lineHeight: 18, marginTop: 5 },
  clearBtn: { marginTop: 10, paddingVertical: 11 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  unlockedScroll: { flexShrink: 1 },
  profileRow: {
    borderTopWidth: 1,
    borderTopColor: '#f0eaf8',
    paddingTop: 12,
    marginTop: 12,
  },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarEmoji: { fontSize: 24 },
  profileNameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.chipBorder,
    paddingVertical: 5,
  },
  activePill: {
    backgroundColor: C.lavender,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  activePillText: { fontSize: 11, fontWeight: '800', color: C.purpleText },
  profileCharRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  profileCharCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  profileCharCircleSel: { borderColor: C.purple },
  profileCharEmoji: { fontSize: 18 },
  deleteLink: { marginTop: 10, alignSelf: 'flex-start' },
  deleteLinkText: { fontSize: 13, fontWeight: '700', color: C.red },
  deleteConfirm: {
    marginTop: 10,
    backgroundColor: '#fdecec',
    borderRadius: 12,
    padding: 11,
  },
  deleteConfirmText: { fontSize: 13.5, fontWeight: '700', color: '#8a2a2a' },
  deleteBtns: { flexDirection: 'row', gap: 8, marginTop: 9 },
  deleteYes: {
    backgroundColor: C.red,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  deleteYesText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  deleteNo: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  deleteNoText: { color: C.inkSoft, fontSize: 13, fontWeight: '800' },
});
