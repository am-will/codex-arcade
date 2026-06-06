import { describe, expect, it } from 'vitest';
import { SceneKey } from './sceneKeys';

describe('scene key scaffold', () => {
  it('declares the boot, menu, and placeholder scenes', () => {
    expect(Object.values(SceneKey)).toEqual(['Boot', 'MainMenu', 'Placeholder']);
  });
});
