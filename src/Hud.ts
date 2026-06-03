import type { GamePhase, ScoreState, ShotMode } from './types'

type HudCallbacks = {
  onModeChange: (mode: ShotMode) => void
  onRestart: () => void
}

export class Hud {
  private readonly modeButtons: HTMLButtonElement[]
  private readonly restartButton: HTMLButtonElement
  private readonly score: HTMLElement
  private readonly timer: HTMLElement
  private readonly streak: HTMLElement
  private readonly multiplier: HTMLElement
  private readonly best: HTMLElement
  private readonly level: HTMLElement
  private readonly tier: HTMLElement
  private readonly status: HTMLElement
  private readonly roundOver: HTMLElement
  private readonly finalStats: HTMLElement
  private readonly root: HTMLElement
  private readonly callbacks: HudCallbacks

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root
    this.callbacks = callbacks
    root.innerHTML = `
      <div class="top-hud">
        <div class="brand">
          <span class="brand-mark"></span>
          <div>
            <h1>Flamethrow</h1>
            <p id="tier">Warm</p>
          </div>
        </div>
        <div class="stats" aria-live="polite">
          <div><span>Score</span><strong id="score">0</strong></div>
          <div><span>Time</span><strong id="timer">90.0</strong></div>
          <div><span>Streak</span><strong id="streak">0</strong></div>
          <div><span>Multi</span><strong id="multiplier">x1</strong></div>
          <div><span>Best</span><strong id="best">0</strong></div>
          <div><span>Level</span><strong id="level">1</strong></div>
        </div>
      </div>
      <div class="bottom-hud">
        <div class="mode-toggle" role="group" aria-label="Shot mode">
          <button class="mode active" type="button" data-mode="pullback">Pullback</button>
          <button class="mode" type="button" data-mode="flick">Flick</button>
        </div>
        <p id="status">Drag the ball back or switch to flick. First launch starts the 90 second run.</p>
      </div>
      <div class="round-over hidden" id="round-over">
        <div class="result-panel">
          <h2>Run Complete</h2>
          <p id="final-stats"></p>
          <button id="restart" type="button">Restart Run</button>
        </div>
      </div>
    `
    this.modeButtons = [...root.querySelectorAll<HTMLButtonElement>('.mode')]
    this.restartButton = root.querySelector<HTMLButtonElement>('#restart')!
    this.score = root.querySelector<HTMLElement>('#score')!
    this.timer = root.querySelector<HTMLElement>('#timer')!
    this.streak = root.querySelector<HTMLElement>('#streak')!
    this.multiplier = root.querySelector<HTMLElement>('#multiplier')!
    this.best = root.querySelector<HTMLElement>('#best')!
    this.level = root.querySelector<HTMLElement>('#level')!
    this.tier = root.querySelector<HTMLElement>('#tier')!
    this.status = root.querySelector<HTMLElement>('#status')!
    this.roundOver = root.querySelector<HTMLElement>('#round-over')!
    this.finalStats = root.querySelector<HTMLElement>('#final-stats')!

    for (const button of this.modeButtons) {
      button.addEventListener('click', () => {
        this.setMode(button.dataset.mode as ShotMode)
        this.callbacks.onModeChange(button.dataset.mode as ShotMode)
      })
    }
    this.restartButton.addEventListener('click', () => this.callbacks.onRestart())
  }

  setMode(mode: ShotMode): void {
    for (const button of this.modeButtons) {
      button.classList.toggle('active', button.dataset.mode === mode)
    }
  }

  update(state: ScoreState, timeRemaining: number, phase: GamePhase, levelLabel: string, levelId: number): void {
    this.score.textContent = String(state.score)
    this.timer.textContent = Math.max(0, timeRemaining).toFixed(1)
    this.streak.textContent = String(state.streak)
    this.multiplier.textContent = `x${state.multiplier}`
    this.best.textContent = String(state.bestStreak)
    this.level.textContent = String(levelId)
    this.tier.textContent = `${state.tier.name} - ${levelLabel}`
    this.root.dataset.tier = String(state.tier.threshold)

    if (phase === 'ready') {
      this.status.textContent = 'Drag the ball back or switch to flick. First launch starts the 90 second run.'
    } else if (phase === 'shotInFlight') {
      this.status.textContent = 'Shot in flight.'
    } else if (phase === 'roundOver') {
      this.status.textContent = 'Run complete.'
    } else {
      this.status.textContent = 'Line up the moving rim and keep the streak alive.'
    }
  }

  showMake(scoreState: ScoreState): void {
    this.status.textContent = `Made shot. ${scoreState.tier.name} x${scoreState.multiplier}.`
    this.root.classList.remove('make-pop')
    window.setTimeout(() => this.root.classList.add('make-pop'), 0)
  }

  showMiss(): void {
    this.status.textContent = 'Miss. Streak reset, timer still running.'
  }

  showRoundOver(state: ScoreState): void {
    this.finalStats.textContent = `Score ${state.score}. Made ${state.madeShots}. Best streak ${state.bestStreak}.`
    this.roundOver.classList.remove('hidden')
  }

  hideRoundOver(): void {
    this.roundOver.classList.add('hidden')
  }
}
