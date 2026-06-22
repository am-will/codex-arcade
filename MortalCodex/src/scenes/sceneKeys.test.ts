import { describe, expect, it } from 'vitest';
import { SceneKey } from './sceneKeys';

describe('scene key scaffold', () => {
  it('declares the boot, menu flow, match, and placeholder scenes', () => {
    expect(Object.values(SceneKey)).toEqual([
      'Boot',
      'MainMenu',
      'StageSelect',
      'CharacterSelect',
      'Settings',
      'CharacterGym',
      'FighterPlayground',
      'Match',
      'Placeholder',
    ]);
  });
});
