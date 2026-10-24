/** Catalog status banner shown in the scenario card. */
import type { CatalogStatus } from '../state';
import { h, replace } from '../dom';
import { icon } from '../icons';

export interface DataBannerProps {
  real: boolean;
  status: CatalogStatus;
  isFixture: boolean;
}

const banner = (text: string, tone: 'sky' | 'slate') => h('p', { class: `banner banner--${tone}`, role: 'status' }, icon('info', 16), h('span', {}, text));

export function renderDataBanner(container: HTMLElement, p: DataBannerProps): void {
  if (p.status === 'empty' || p.status === 'error') replace(container, banner('Real-planet data unavailable — using hypothetical mode. The solar-system presets still work.', 'slate'));
  else if (p.status === 'loading' && p.real) replace(container, banner('Loading real-planet data…', 'slate'));
  else if (p.status === 'ok' && p.isFixture && p.real) replace(container, banner('Dev sample data — not real archive values.', 'sky'));
  else replace(container);
}
