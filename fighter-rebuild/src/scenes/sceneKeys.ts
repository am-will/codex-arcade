export const SceneKey = {
  Boot: 'Boot',
  MainMenu: 'MainMenu',
  StageSelect: 'StageSelect',
  CharacterSelect: 'CharacterSelect',
  Settings: 'Settings',
  CharacterGym: 'CharacterGym',
  FighterPlayground: 'FighterPlayground',
  Match: 'Match',
  Placeholder: 'Placeholder',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
