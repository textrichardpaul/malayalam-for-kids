# Malayalam for Kids

A speaking-first Malayalam app for diaspora kids, ages 6 to 8. No reading, no writing, no script: children learn the language the way they learned their first one, by listening and speaking.

Built with React Native and Expo.

## What's in this repo

The app itself: screens, per-child profiles and progress, the practice recorder, an on-device sound-matching engine that scores a child's spoken attempt against the target line, the audio player, and local storage.

- `App.tsx` and `src/screens/` — app flow and screens
- `src/components/PracticeRecorder.tsx` — tap-and-repeat practice recording
- `src/soundmatch/` — decoding, resampling, and pronunciation match scoring
- `src/lib/` — player, storage, practice session logic, characters
- `src/theme.ts` — design system

## What's not in this repo

The lesson content library and the recorded native-speaker audio lines. The curriculum is the product, so it ships only inside the app.

## Status

Launch Edition is free, currently in App Store review (November 2026). Downloads before January 1, 2027 keep every lesson free for life.
