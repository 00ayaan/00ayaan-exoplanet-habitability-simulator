/** Catalog status banner shown next to the mode switch (both modes). */
import type { Mode, CatalogStatus } from '../state';
import { h, replace } from '../dom';

export interface DataBannerProps {
  mode: Mode;
  status: CatalogStatus;
  isFixture: boolean;
}

export function renderDataBanner(container: HTMLElement, p: DataBannerProps): void {
  if (p.status === 'empty' || p.status === 'error') {
    replace(container, h('p', { class: 'banner banner--warn', role: 'status' }, '⚠ Real-planet data unavailable — using hypothetical mode'));
  } else if (p.status === 'loading' && p.mode === 'real') {
    replace(container, h('p', { class: 'banner banner--info' }, 'Loading real-planet data…'));
  } else if (p.status === 'ok' && p.isFixture && p.mode === 'real') {
    replace(container, h('p', { class: 'banner banner--warn', role: 'status' }, '⚠ Dev sample data — not real archive values'));
  } else {
    replace(container);
  }
}
