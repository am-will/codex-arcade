import { formatTime } from './trackMath';
import type { CarSnapshot, RaceSnapshot, TrackDefinition } from './types';

export class Hud {
  readonly element = document.createElement('div');
  private readonly top = document.createElement('div');
  private readonly speed = document.createElement('div');
  private readonly menu = document.createElement('div');
  private readonly finish = document.createElement('div');
  private readonly countdown = document.createElement('div');

  constructor(private readonly tracks: TrackDefinition[]) {
    this.element.className = 'hud';
    this.top.className = 'hud__top';
    this.speed.className = 'hud__speed';
    this.menu.className = 'menu';
    this.finish.className = 'finish finish--hidden';
    this.countdown.className = 'countdown countdown--hidden';
    this.element.append(this.top, this.speed, this.menu, this.finish, this.countdown);
  }

  bindMenu(onStart: (index: number) => void): void {
    this.menu.innerHTML = `
      <section class="menu__panel" aria-label="Drift level select">
        <div class="menu__brand">
          <p class="menu__kicker">Codex Arcade</p>
          <h1>Drift</h1>
          <p class="menu__copy">Fast laps, tiny hops, sideways corners.</p>
        </div>
        <div class="menu__tracks"></div>
      </section>
    `;
    const list = this.menu.querySelector('.menu__tracks');
    if (!list) return;
    this.tracks.forEach((track, index) => {
      const button = document.createElement('button');
      button.className = 'track-card';
      button.type = 'button';
      button.innerHTML = `
        <span class="track-card__index">${String(index + 1).padStart(2, '0')}</span>
        <strong>${track.name}</strong>
        <span>${track.tagline}</span>
        <small>${track.laps} laps · Gold ${formatTime(track.medalTargets.gold)}</small>
      `;
      button.addEventListener('click', () => onStart(index));
      list.append(button);
    });
  }

  showMenu(): void {
    this.menu.classList.remove('menu--hidden');
    this.finish.classList.add('finish--hidden');
    this.countdown.classList.add('countdown--hidden');
  }

  hideMenu(): void {
    this.menu.classList.add('menu--hidden');
  }

  update(race: RaceSnapshot, car: CarSnapshot): void {
    this.top.innerHTML = `
      <div class="hud-card">
        <span>Track</span>
        <strong>${race.trackName}</strong>
      </div>
      <div class="hud-card hud-card--time">
        <span>Time</span>
        <strong>${formatTime(race.displayElapsed)}</strong>
      </div>
      <div class="hud-card">
        <span>Lap</span>
        <strong>${race.lap}/${race.laps}</strong>
      </div>
      <div class="hud-card">
        <span>Gate</span>
        <strong>${Math.min(race.checkpoint + 1, race.checkpointCount + 1)}/${race.checkpointCount + 1}</strong>
      </div>
      <div class="hud-card">
        <span>Best</span>
        <strong>${race.bestTime == null ? '--' : formatTime(race.bestTime)}</strong>
      </div>
    `;

    const status = [
      car.drift ? '<b class="status status--drift">DRIFT</b>' : '',
      car.boost ? '<b class="status status--boost">BOOST</b>' : '',
      car.shield ? '<b class="status status--shield">SHIELD</b>' : '',
      car.powerupText ? `<b class="status status--power">${car.powerupText}</b>` : '',
    ].join('');
    this.speed.innerHTML = `
      <div class="speed-ring">
        <strong>${Math.round(car.kph)}</strong>
        <span>km/h</span>
      </div>
      <div class="speed-meta">
        <span>${status}</span>
        <small>Slip ${Math.round(car.slipAngle)}°</small>
      </div>
    `;

    if (race.status === 'countdown') {
      this.countdown.classList.remove('countdown--hidden');
    } else {
      this.countdown.classList.add('countdown--hidden');
    }
  }

  updateCountdown(value: number): void {
    this.countdown.textContent = value <= 0.15 ? 'GO' : Math.ceil(value).toString();
  }

  showFinish(race: RaceSnapshot, isNewBest: boolean, onRetry: () => void, onNext: () => void, onMenu: () => void): void {
    this.finish.classList.remove('finish--hidden');
    this.finish.innerHTML = `
      <section class="finish__panel">
        <p class="menu__kicker">${isNewBest ? 'New best' : 'Finished'}</p>
        <h2>${formatTime(race.finishTime ?? race.displayElapsed)}</h2>
        <p>${race.trackName} · ${race.medal.toUpperCase()}</p>
        <div class="finish__actions">
          <button type="button" data-action="retry">Retry</button>
          <button type="button" data-action="next">Next</button>
          <button type="button" data-action="menu">Menu</button>
        </div>
      </section>
    `;
    this.finish.querySelector<HTMLButtonElement>('[data-action="retry"]')?.addEventListener('click', onRetry);
    this.finish.querySelector<HTMLButtonElement>('[data-action="next"]')?.addEventListener('click', onNext);
    this.finish.querySelector<HTMLButtonElement>('[data-action="menu"]')?.addEventListener('click', onMenu);
  }

  hideFinish(): void {
    this.finish.classList.add('finish--hidden');
  }
}
