export const SceneKey = {
  Boot: 'Boot',
  MainMenu: 'MainMenu',
  Placeholder: 'Placeholder',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
