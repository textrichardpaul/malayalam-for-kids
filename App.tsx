import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildBasicsLesson,
  buildTalkLesson,
  swapName,
  type BasicsSet,
  type TalkUnit,
} from './src/data';
import {
  adoptLegacyLearningData,
  deleteProfileData,
  loadPointsFor,
  loadProfilesState,
  loadProgressFor,
  loadSettings,
  loadStarsFor,
  newProfileId,
  resetLearningDataFor,
  savePointsFor,
  saveProfilesState,
  saveProgressFor,
  saveSettings,
  saveStarsFor,
  MAX_PROFILES,
  type LearnerProfile,
  type Points,
  type ProfilesState,
  type Progress,
  type Settings,
} from './src/lib/storage';
import {
  adoptLegacyPractice,
  clearPractice,
  practicePrefix,
} from './src/lib/practice';
import { initAudioMode, stopPlayback } from './src/lib/player';
import HomeScreen, { type StepSelection } from './src/screens/HomeScreen';
import LessonScreen, { type LessonInfo } from './src/screens/LessonScreen';
import ProfileGateScreen from './src/screens/ProfileGateScreen';
import SettingsModal from './src/screens/SettingsModal';
import { BookIcon, GearIcon, HomeIcon } from './src/components/icons';
import { C } from './src/theme';

type Route =
  | { name: 'home' }
  // returnStep: where the lesson's back button lands — the section the
  // child came from (bug #3: back used to reset to the pristine home).
  | { name: 'lesson'; lesson: LessonInfo; returnStep: 1 | 2 };

type Tab = 'home' | 'adventures';

// Fix round 4: the app opens on the learner gate — the profile picker, or
// the create flow when no profile exists yet. 'app' is the main shell,
// entered with an active profile whose data has been loaded.
type Gate = 'picker' | 'create' | 'app';

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

function Shell() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>({ church: false, character: 'Ammachi' });
  const [profilesState, setProfilesState] = useState<ProfilesState>({
    profiles: [],
    activeId: null,
  });
  const [gate, setGate] = useState<Gate>('create');
  const [stars, setStars] = useState<Record<string, boolean>>({});
  const [points, setPoints] = useState<Points>({ earned: {}, total: 0 });
  const [progress, setProgress] = useState<Progress>({ pos: {} });
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [step, setStep] = useState<StepSelection>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const homeScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  const activeProfile: LearnerProfile | null =
    profilesState.profiles.find((p) => p.id === profilesState.activeId) ?? null;

  const loadProfileData = useCallback(async (profileId: string) => {
    const [st, p, pr] = await Promise.all([
      loadStarsFor(profileId),
      loadPointsFor(profileId),
      loadProgressFor(profileId),
    ]);
    setStars(st);
    setPoints(p);
    setProgress(pr);
  }, []);

  useEffect(() => {
    (async () => {
      const [s, ps] = await Promise.all([loadSettings(), loadProfilesState()]);
      setSettings(s);
      setProfilesState(ps);
      setGate(ps.profiles.length > 0 ? 'picker' : 'create');
      await initAudioMode();
      setReady(true);
    })();
  }, []);

  const scrollHomeTop = useCallback(() => {
    requestAnimationFrame(() => {
      homeScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  const goHomePristine = useCallback(() => {
    stopPlayback();
    setRoute({ name: 'home' });
    setStep(0);
    scrollHomeTop();
  }, [scrollHomeTop]);

  // Adventures: the same homepage, at the step section, ALWAYS on Step 1
  // (bugs #5/#6). With a step selected the hero gives way to the section,
  // so the section sits at the top of the page.
  const goAdventures = useCallback(() => {
    stopPlayback();
    setRoute({ name: 'home' });
    setStep(1);
    scrollHomeTop();
  }, [scrollHomeTop]);

  // Back from a lesson returns to the section the lesson was opened from:
  // Step 1 lessons -> the First Words section; Step 2 lessons -> that
  // persona's adventure list in the Talk Adventures section (the selected
  // persona is unchanged, so the list shown is the one they came from).
  const exitLesson = useCallback(() => {
    stopPlayback();
    if (route.name === 'lesson') setStep(route.returnStep);
    setRoute({ name: 'home' });
    scrollHomeTop();
  }, [route, scrollHomeTop]);

  const enterAppAs = useCallback(
    async (next: ProfilesState, profileId: string) => {
      setProfilesState(next);
      await saveProfilesState(next);
      await loadProfileData(profileId);
      setSettingsOpen(false);
      setRoute({ name: 'home' });
      setStep(0);
      setGate('app');
      scrollHomeTop();
    },
    [loadProfileData, scrollHomeTop],
  );

  const pickProfile = useCallback(
    (id: string) => {
      const now = Date.now();
      const next: ProfilesState = {
        profiles: profilesState.profiles.map((p) =>
          p.id === id ? { ...p, lastUsedAt: now } : p,
        ),
        activeId: id,
      };
      void enterAppAs(next, id);
    },
    [profilesState, enterAppAs],
  );

  const createProfile = useCallback(
    (name: string, characterId: string) => {
      if (profilesState.profiles.length >= MAX_PROFILES) return;
      const now = Date.now();
      const profile: LearnerProfile = {
        id: newProfileId(),
        name,
        character: characterId,
        createdAt: now,
        lastUsedAt: now,
      };
      const isFirstEver = profilesState.profiles.length === 0;
      const next: ProfilesState = {
        profiles: [...profilesState.profiles, profile],
        activeId: profile.id,
      };
      void (async () => {
        if (isFirstEver) {
          // One-time migration: pre-profiles progress (stars, saved
          // positions, practice recordings) is adopted by the first
          // learner, so nothing earned before profiles existed is lost.
          await adoptLegacyLearningData(profile.id);
          await adoptLegacyPractice(profile.id);
        }
        await enterAppAs(next, profile.id);
      })();
    },
    [profilesState, enterAppAs],
  );

  const switchProfile = useCallback(() => {
    stopPlayback();
    setSettingsOpen(false);
    setRoute({ name: 'home' });
    setStep(0);
    setGate('picker');
  }, []);

  const renameProfile = useCallback(
    (id: string, name: string) => {
      const next: ProfilesState = {
        ...profilesState,
        profiles: profilesState.profiles.map((p) =>
          p.id === id ? { ...p, name } : p,
        ),
      };
      setProfilesState(next);
      void saveProfilesState(next);
    },
    [profilesState],
  );

  const changeProfileCharacter = useCallback(
    (id: string, characterId: string) => {
      const next: ProfilesState = {
        ...profilesState,
        profiles: profilesState.profiles.map((p) =>
          p.id === id ? { ...p, character: characterId } : p,
        ),
      };
      setProfilesState(next);
      void saveProfilesState(next);
    },
    [profilesState],
  );

  const deleteProfile = useCallback(
    (id: string) => {
      void (async () => {
        await deleteProfileData(id);
        await clearPractice(practicePrefix(id));
        const remaining = profilesState.profiles.filter((p) => p.id !== id);
        const wasActive = profilesState.activeId === id;
        const next: ProfilesState = {
          profiles: remaining,
          activeId: wasActive ? null : profilesState.activeId,
        };
        setProfilesState(next);
        await saveProfilesState(next);
        if (wasActive) {
          // The learner on screen is gone: reset the shell and go back
          // to the picker (or to first-run create when none remain).
          setStars({});
          setPoints({ earned: {}, total: 0 });
          setProgress({ pos: {} });
          setSettingsOpen(false);
          setRoute({ name: 'home' });
          setStep(0);
          setGate(remaining.length > 0 ? 'picker' : 'create');
        }
      })();
    },
    [profilesState],
  );

  const openTalk = useCallback(
    (unit: TalkUnit) => {
      const personaId = settings.character;
      const phrases = buildTalkLesson(unit, personaId);
      if (!phrases) return;
      const progressKey = `${unit.id}:${personaId}`;
      const starKey = `unit:${progressKey}`;
      const finished = !!stars[starKey];
      const saved = progress.pos[progressKey] ?? 0;
      setRoute({
        name: 'lesson',
        returnStep: 2,
        lesson: {
          id: unit.id,
          title: swapName(unit.title, personaId),
          basic: false,
          personaId,
          phrases,
          progressKey,
          pointsKey: progressKey,
          starKey,
          pointsValue: phrases.length * 10,
          initialIndex: finished ? 0 : Math.min(saved, phrases.length - 1),
        },
      });
    },
    [settings.character, stars, progress],
  );

  const openBasics = useCallback(
    (set: BasicsSet) => {
      const phrases = buildBasicsLesson(set);
      const starKey = `unit:${set.id}`;
      const finished = !!stars[starKey];
      const saved = progress.pos[set.id] ?? 0;
      setRoute({
        name: 'lesson',
        returnStep: 1,
        lesson: {
          id: set.id,
          title: set.title,
          basic: true,
          personaId: null,
          phrases,
          progressKey: set.id,
          pointsKey: `basics:${set.id}`,
          starKey,
          pointsValue: 100,
          initialIndex: finished ? 0 : Math.min(saved, phrases.length - 1),
        },
      });
    },
    [stars, progress],
  );

  const handleProgress = useCallback(
    (progressKey: string, index: number) => {
      const pid = profilesState.activeId;
      if (!pid) return;
      setProgress((prev) => {
        const next = { pos: { ...prev.pos, [progressKey]: index } };
        void saveProgressFor(pid, next);
        return next;
      });
    },
    [profilesState.activeId],
  );

  const handleComplete = useCallback(
    (info: LessonInfo): { already: boolean; total: number } => {
      const pid = profilesState.activeId;
      const already = !!points.earned[info.pointsKey];
      let total = points.total;
      if (!already && pid) {
        const nextPoints: Points = {
          earned: { ...points.earned, [info.pointsKey]: info.pointsValue },
          total: points.total + info.pointsValue,
        };
        total = nextPoints.total;
        setPoints(nextPoints);
        void savePointsFor(pid, nextPoints);
      }
      if (!stars[info.starKey] && pid) {
        const nextStars = { ...stars, [info.starKey]: true };
        setStars(nextStars);
        void saveStarsFor(pid, nextStars);
      }
      setProgress((prev) => {
        if (!(info.progressKey in prev.pos)) return prev;
        const pos = { ...prev.pos };
        delete pos[info.progressKey];
        const next = { pos };
        if (pid) void saveProgressFor(pid, next);
        return next;
      });
      return { already, total };
    },
    [points, stars, profilesState.activeId],
  );

  const handleTab = (tab: Tab) => {
    if (tab === 'adventures') {
      goAdventures();
      return;
    }
    goHomePristine();
  };

  const activeTab: Tab =
    route.name === 'lesson' || step !== 0 ? 'adventures' : 'home';

  if (!ready) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <Image source={require('./assets/icon.png')} style={styles.loadingIcon} />
        <Text style={styles.loadingText}>Malayalam for Kids</Text>
      </View>
    );
  }

  if (gate !== 'app' || !activeProfile) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ProfileGateScreen
          mode={gate === 'create' ? 'create' : 'picker'}
          profiles={profilesState.profiles}
          onPick={pickProfile}
          onAddLearner={() => setGate('create')}
          onCreate={createProfile}
          onCancelCreate={
            profilesState.profiles.length > 0 ? () => setGate('picker') : null
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.topbar}>
        <Image source={require('./assets/icon.png')} style={styles.brandIcon} />
        <Text style={styles.brandText}>Malayalam for Kids</Text>
      </View>

      <View style={{ flex: 1 }}>
        {route.name === 'home' ? (
          <HomeScreen
            step={step}
            onSelectStep={setStep}
            settings={settings}
            stars={stars}
            points={points}
            progress={progress}
            profile={activeProfile}
            onSwitchProfile={switchProfile}
            onSelectPersona={(personaId) => {
              const next = { ...settings, character: personaId };
              setSettings(next);
              void saveSettings(next);
            }}
            onOpenTalk={openTalk}
            onOpenBasics={openBasics}
            onLockedChurch={() =>
              Alert.alert(
                'Church & Family Prayers',
                'This adventure is opt-in. A grown-up can turn it on in Settings.',
              )
            }
            scrollRef={homeScrollRef}
          />
        ) : (
          <LessonScreen
            key={`${route.lesson.id}:${route.lesson.personaId ?? ''}`}
            lesson={route.lesson}
            onExit={exitLesson}
            onProgress={handleProgress}
            onComplete={handleComplete}
            recKeyPrefix={practicePrefix(activeProfile.id)}
          />
        )}
      </View>

      <View style={[styles.tabbar, { paddingBottom: insets.bottom + 6 }]}>
        <TabButton
          label="Home"
          active={activeTab === 'home'}
          onPress={() => handleTab('home')}
          renderIcon={(color) => <HomeIcon color={color} />}
        />
        <TabButton
          label="Adventures"
          active={activeTab === 'adventures'}
          onPress={() => handleTab('adventures')}
          renderIcon={(color) => <BookIcon color={color} />}
        />
      </View>

      <TouchableOpacity
        style={[styles.settingsBtn, { bottom: insets.bottom + 92 }]}
        onPress={() => setSettingsOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Settings for grown-ups"
      >
        <GearIcon size={25} color={C.purple} />
      </TouchableOpacity>

      <SettingsModal
        visible={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onToggleChurch={(on) => {
          const next = { ...settings, church: on };
          setSettings(next);
          void saveSettings(next);
        }}
        onResetStars={() => {
          const pid = profilesState.activeId;
          if (!pid) return;
          void resetLearningDataFor(pid);
          setStars({});
          setPoints({ earned: {}, total: 0 });
          setProgress({ pos: {} });
        }}
        profiles={profilesState.profiles}
        activeProfileId={profilesState.activeId}
        practicePrefix={practicePrefix(activeProfile.id)}
        onRenameProfile={renameProfile}
        onChangeProfileCharacter={changeProfileCharacter}
        onDeleteProfile={deleteProfile}
      />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  renderIcon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.tabIconCircle, active && styles.tabIconCircleActive]}>
        {renderIcon(active ? '#ffffff' : C.purple)}
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loading: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingIcon: { width: 84, height: 84, borderRadius: 20 },
  loadingText: { fontSize: 19, fontWeight: '800', color: '#33275e' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  brandIcon: { width: 40, height: 40, borderRadius: 11 },
  brandText: { fontSize: 20, fontWeight: '800', color: '#33275e' },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    paddingHorizontal: 8,
    paddingTop: 7,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 5,
  },
  tabActive: { backgroundColor: C.lavenderLight },
  tabIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f1e9fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconCircleActive: { backgroundColor: C.purple },
  tabLabel: { fontSize: 11, fontWeight: '700', color: C.faint, marginTop: 3 },
  tabLabelActive: { color: C.purpleText },
  settingsBtn: {
    position: 'absolute',
    right: 14,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5a3cb4',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 20,
  },
});
