export type CharacterGymOverlayKey = 'visual' | 'collision' | 'hurt' | 'attack' | 'guard';

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type CharacterGymPanelState = {
  readonly characters: readonly SelectOption[];
  readonly selectedCharacterId: string;
  readonly animations: readonly SelectOption[];
  readonly selectedAnimation: string;
  readonly frameIndex: number;
  readonly frameCount: number;
  readonly isPlaying: boolean;
  readonly overlays: Readonly<Record<CharacterGymOverlayKey, boolean>>;
  readonly exportText: string;
  readonly warnings: readonly string[];
};

export type CharacterGymPanelHandlers = {
  readonly onCharacterChange: (characterId: string) => void;
  readonly onAnimationChange: (animationName: string) => void;
  readonly onFrameChange: (frameIndex: number) => void;
  readonly onStepFrame: (direction: -1 | 1) => void;
  readonly onTogglePlayback: () => void;
  readonly onOverlayChange: (overlay: CharacterGymOverlayKey, enabled: boolean) => void;
};

export type DebugPanelMount = {
  readonly update: (state: CharacterGymPanelState) => void;
  readonly dispose: () => void;
};

const OVERLAY_LABELS: Readonly<Record<CharacterGymOverlayKey, string>> = {
  visual: 'Visual frame',
  collision: 'Collision',
  hurt: 'Hurt',
  attack: 'Attack',
  guard: 'Guard',
};

const OVERLAY_KEYS = Object.keys(OVERLAY_LABELS) as CharacterGymOverlayKey[];

export function createDebugPanel(
  host: HTMLElement | null,
  options: {
    readonly onOpenCharacterGym: () => void;
  },
): void {
  if (!host || !import.meta.env.DEV) {
    return;
  }

  ensureDebugPanelStyle();
  host.dataset.active = 'true';
  host.innerHTML = `
    <section class="debug-panel" aria-label="Development debug tools">
      <div class="debug-panel__header">
        <p class="debug-panel__eyebrow">Debug</p>
        <h2 class="debug-panel__title">Tooling</h2>
      </div>
      <button class="debug-panel__button" type="button" data-open-character-gym>Character Gym</button>
      <p class="debug-panel__hint">Frame boxes, attack windows, and animation previews.</p>
    </section>
  `;

  const button = host.querySelector<HTMLButtonElement>('[data-open-character-gym]');
  button?.addEventListener('click', options.onOpenCharacterGym);
}

export function mountCharacterGymPanel(
  host: HTMLElement | null,
  initialState: CharacterGymPanelState,
  handlers: CharacterGymPanelHandlers,
): DebugPanelMount {
  if (!host || !import.meta.env.DEV) {
    return {
      update: () => undefined,
      dispose: () => undefined,
    };
  }

  ensureDebugPanelStyle();
  host.dataset.active = 'true';
  host.innerHTML = `
    <section class="debug-panel debug-panel--gym" aria-label="Character Gym controls">
      <div class="debug-panel__header">
        <p class="debug-panel__eyebrow">Character Gym</p>
        <h2 class="debug-panel__title">Animation Boxes</h2>
      </div>

      <label class="debug-panel__field">
        <span>Fighter</span>
        <select data-character></select>
      </label>

      <label class="debug-panel__field">
        <span>Animation</span>
        <select data-animation></select>
      </label>

      <div class="debug-panel__row debug-panel__row--buttons">
        <button class="debug-panel__icon-button" type="button" data-step="-1" title="Previous frame">Prev</button>
        <button class="debug-panel__button" type="button" data-play-pause></button>
        <button class="debug-panel__icon-button" type="button" data-step="1" title="Next frame">Next</button>
      </div>

      <label class="debug-panel__field">
        <span data-frame-label></span>
        <input data-frame type="range" min="0" max="0" step="1" value="0" />
      </label>

      <fieldset class="debug-panel__fieldset">
        <legend>Overlays</legend>
        <div class="debug-panel__checkboxes" data-overlays></div>
      </fieldset>

      <label class="debug-panel__field">
        <span>JSON export</span>
        <textarea data-export readonly rows="10" spellcheck="false"></textarea>
      </label>

      <p class="debug-panel__hint">Light = punch, heavy = kick, special = combo. DOM controls shield keyboard shortcuts while focused.</p>
      <p class="debug-panel__warning" data-warnings hidden></p>
    </section>
  `;

  const root = host.querySelector<HTMLElement>('.debug-panel--gym');
  const characterSelect = requireElement<HTMLSelectElement>(host, '[data-character]');
  const animationSelect = requireElement<HTMLSelectElement>(host, '[data-animation]');
  const frameInput = requireElement<HTMLInputElement>(host, '[data-frame]');
  const frameLabel = requireElement<HTMLElement>(host, '[data-frame-label]');
  const playPauseButton = requireElement<HTMLButtonElement>(host, '[data-play-pause]');
  const exportTextarea = requireElement<HTMLTextAreaElement>(host, '[data-export]');
  const overlayRoot = requireElement<HTMLElement>(host, '[data-overlays]');
  const warnings = requireElement<HTMLElement>(host, '[data-warnings]');

  const keyboardShield = (event: Event): void => {
    event.stopPropagation();
  };

  root?.addEventListener('keydown', keyboardShield, true);
  root?.addEventListener('keyup', keyboardShield, true);
  root?.addEventListener('keypress', keyboardShield, true);

  characterSelect.addEventListener('change', () => {
    handlers.onCharacterChange(characterSelect.value);
  });
  animationSelect.addEventListener('change', () => {
    handlers.onAnimationChange(animationSelect.value);
  });
  frameInput.addEventListener('input', () => {
    handlers.onFrameChange(Number(frameInput.value));
  });
  playPauseButton.addEventListener('click', () => {
    handlers.onTogglePlayback();
  });

  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-step]')) {
    button.addEventListener('click', () => {
      const direction = button.dataset.step === '-1' ? -1 : 1;
      handlers.onStepFrame(direction);
    });
  }

  for (const overlayKey of OVERLAY_KEYS) {
    const label = document.createElement('label');
    label.className = 'debug-panel__checkbox';
    label.innerHTML = `
      <input type="checkbox" data-overlay="${overlayKey}" />
      <span>${OVERLAY_LABELS[overlayKey]}</span>
    `;
    overlayRoot.append(label);

    const input = label.querySelector<HTMLInputElement>('input');
    input?.addEventListener('change', () => {
      handlers.onOverlayChange(overlayKey, Boolean(input.checked));
    });
  }

  const update = (state: CharacterGymPanelState): void => {
    syncOptions(characterSelect, state.characters, state.selectedCharacterId);
    syncOptions(animationSelect, state.animations, state.selectedAnimation);

    frameInput.max = String(Math.max(0, state.frameCount - 1));
    frameInput.value = String(state.frameIndex);
    frameLabel.textContent = `Frame ${state.frameIndex + 1} / ${Math.max(1, state.frameCount)}`;
    playPauseButton.textContent = state.isPlaying ? 'Pause' : 'Play';
    exportTextarea.value = state.exportText;

    for (const overlayKey of OVERLAY_KEYS) {
      const input = overlayRoot.querySelector<HTMLInputElement>(`[data-overlay="${overlayKey}"]`);
      if (input) {
        input.checked = state.overlays[overlayKey];
      }
    }

    warnings.hidden = state.warnings.length === 0;
    warnings.textContent = state.warnings.join('\n');
  };

  update(initialState);

  return {
    update,
    dispose: () => {
      root?.removeEventListener('keydown', keyboardShield, true);
      root?.removeEventListener('keyup', keyboardShield, true);
      root?.removeEventListener('keypress', keyboardShield, true);
      host.innerHTML = '';
      host.dataset.active = 'false';
    },
  };
}

function requireElement<T extends HTMLElement>(host: HTMLElement, selector: string): T {
  const element = host.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Debug panel missing expected element: ${selector}`);
  }

  return element;
}

function syncOptions(select: HTMLSelectElement, options: readonly SelectOption[], selectedValue: string): void {
  const optionSignature = options.map((option) => `${option.value}:${option.label}`).join('|');

  if (select.dataset.optionSignature !== optionSignature) {
    select.innerHTML = '';

    for (const option of options) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      select.append(optionElement);
    }

    select.dataset.optionSignature = optionSignature;
  }

  select.value = selectedValue;
}

function ensureDebugPanelStyle(): void {
  if (document.querySelector('#debug-panel-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'debug-panel-style';
  style.textContent = `
    .debug-panel {
      display: grid;
      gap: 0.75rem;
      color: #edf4ef;
      font-size: 0.8125rem;
    }

    .debug-panel__header {
      display: grid;
      gap: 0.125rem;
    }

    .debug-panel__eyebrow,
    .debug-panel__title,
    .debug-panel__hint,
    .debug-panel__warning {
      margin: 0;
    }

    .debug-panel__eyebrow {
      color: #91dcc5;
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .debug-panel__title {
      color: #ffffff;
      font-size: 1rem;
      line-height: 1.2;
    }

    .debug-panel__field {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
      color: #c5d2d0;
      font-weight: 700;
    }

    .debug-panel__field select,
    .debug-panel__field textarea,
    .debug-panel__field input[type='range'] {
      width: 100%;
      min-width: 0;
    }

    .debug-panel__field select,
    .debug-panel__field textarea {
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 6px;
      background: #14181c;
      color: #f5fbf9;
    }

    .debug-panel__field select {
      min-height: 2.25rem;
      padding: 0.25rem 0.5rem;
    }

    .debug-panel__field textarea {
      min-height: 10rem;
      padding: 0.5rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.6875rem;
      line-height: 1.35;
      resize: vertical;
    }

    .debug-panel__row {
      display: flex;
      gap: 0.5rem;
      min-width: 0;
    }

    .debug-panel__row--buttons > * {
      flex: 1 1 0;
    }

    .debug-panel__button,
    .debug-panel__icon-button {
      min-height: 2.25rem;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 6px;
      background: #22342f;
      color: #f5fbf9;
      font-weight: 800;
      cursor: pointer;
    }

    .debug-panel__button:hover,
    .debug-panel__icon-button:hover {
      background: #2e5147;
    }

    .debug-panel__fieldset {
      display: grid;
      gap: 0.4rem;
      min-width: 0;
      margin: 0;
      padding: 0.6rem;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
    }

    .debug-panel__fieldset legend {
      padding: 0 0.25rem;
      color: #c5d2d0;
      font-weight: 800;
    }

    .debug-panel__checkboxes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem 0.6rem;
    }

    .debug-panel__checkbox {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      color: #edf4ef;
      font-weight: 650;
    }

    .debug-panel__checkbox span {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .debug-panel__hint {
      color: #a9b7b5;
      font-size: 0.75rem;
      line-height: 1.35;
    }

    .debug-panel__warning {
      white-space: pre-wrap;
      color: #ffd483;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.6875rem;
    }
  `;

  document.head.append(style);
}
