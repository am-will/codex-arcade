export const SceneKey = {
  Boot: 'Boot',
  MainMenu: 'MainMenu',
  StageSelect: 'StageSelect',
  CharacterSelect: 'CharacterSelect',
  Settings: 'Settings',
  Placeholder: 'Placeholder',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
