import type { InputState } from './types';

const keyMap: Record<string, keyof InputState> = {
  KeyW: 'accelerate',
  ArrowUp: 'accelerate',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  KeyR: 'restart',
};

export class Input {
  private state: InputState = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    jump: false,
    restart: false,
  };

  private pressedThisFrame = new Set<keyof InputState>();

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.reset);
  }

  get snapshot(): InputState {
    return { ...this.state };
  }

  wasPressed(key: keyof InputState): boolean {
    return this.pressedThisFrame.has(key);
  }

  afterFrame(): void {
    this.pressedThisFrame.clear();
    this.state.restart = false;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.reset);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const mapped = keyMap[event.code];
    if (!mapped) return;
    event.preventDefault();
    if (!this.state[mapped]) {
      this.pressedThisFrame.add(mapped);
    }
    this.state[mapped] = true;
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const mapped = keyMap[event.code];
    if (!mapped) return;
    event.preventDefault();
    this.state[mapped] = false;
  };

  private reset = (): void => {
    this.state = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      jump: false,
      restart: false,
    };
    this.pressedThisFrame.clear();
  };
}
