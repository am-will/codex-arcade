import { BootScene } from './BootScene';
import { CharacterGymScene } from './CharacterGymScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { FighterPlaygroundScene } from './FighterPlaygroundScene';
import { MainMenuScene } from './MainMenuScene';
import { PlaceholderScene } from './PlaceholderScene';
import { SettingsScene } from './SettingsScene';
import { StageSelectScene } from './StageSelectScene';

export const SCENE_REGISTRY = [
  BootScene,
  MainMenuScene,
  StageSelectScene,
  CharacterSelectScene,
  SettingsScene,
  CharacterGymScene,
  FighterPlaygroundScene,
  PlaceholderScene,
];
