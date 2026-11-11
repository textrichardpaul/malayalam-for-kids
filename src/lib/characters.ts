// Learner-profile characters (fix round 4): 8 emoji animals, each on its
// own pastel circle. Purely presentational — profiles store the id.
export interface CharacterDef {
  id: string;
  emoji: string;
  /** pastel circle background */
  color: string;
  label: string;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'bunny', emoji: '🐰', color: '#fde2f3', label: 'Bunny' },
  { id: 'panda', emoji: '🐼', color: '#dff5e9', label: 'Panda' },
  { id: 'lion', emoji: '🦁', color: '#fff0cf', label: 'Lion' },
  { id: 'fox', emoji: '🦊', color: '#ffe3d0', label: 'Fox' },
  { id: 'koala', emoji: '🐨', color: '#e2e7fb', label: 'Koala' },
  { id: 'kitty', emoji: '🐱', color: '#f1e6fd', label: 'Kitty' },
  { id: 'puppy', emoji: '🐶', color: '#ffe4e6', label: 'Puppy' },
  { id: 'unicorn', emoji: '🦄', color: '#dcf2ff', label: 'Unicorn' },
];

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
