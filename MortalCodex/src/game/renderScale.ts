const CHARACTER_SCALE: Readonly<Record<string, number>> = {
  amodi: 0.95,
  sama: 1.04,
};

const ANIMATION_SCALE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  amodi: {
    block: 0.89,
  },
  sama: {
    light: 1.09,
    heavy: 1.06,
  },
};

export function fighterSpriteRenderScale(characterId: string, animationName: string): number {
  return ANIMATION_SCALE[characterId]?.[animationName] ?? CHARACTER_SCALE[characterId] ?? 1;
}
