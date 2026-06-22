export function createDebugSidebar(host: HTMLElement | null): void {
  if (!host || !import.meta.env.DEV) {
    return;
  }

  host.dataset.active = 'true';
  host.innerHTML = `
    <p class="debug-sidebar__title">Debug</p>
    <p class="debug-sidebar__text">Scene tooling mounts here in development builds.</p>
  `;
}
