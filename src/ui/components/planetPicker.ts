/**
 * NASA search: a search box over the catalog snapshot. Results appear only
 * after typing (radio rows, so it stays a single accessible choice).
 */
import type { Catalog } from '../../physics/types';
import { h, nextId, replace } from '../dom';
import { num } from '../format';
import { icon } from '../icons';

export interface PlanetPickerProps {
  catalog: Catalog | null;
  status: 'loading' | 'ok' | 'empty' | 'error';
  filter: string;
  selectedId: string | null;
}

const MAX_ROWS = 50;

export class PlanetPicker {
  readonly el: HTMLDivElement;
  private search: HTMLInputElement;
  private list: HTMLDivElement;
  private meta: HTMLParagraphElement;
  private count: HTMLParagraphElement;
  private name = nextId('planet');
  private lastKey = '';

  constructor(onFilter: (q: string) => void, onSelect: (id: string) => void) {
    const id = nextId('search');
    this.search = h('input', {
      id, type: 'search', class: 'field__input', placeholder: 'Search e.g. Kepler-452, TRAPPIST, K2-18…',
      autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'search',
    });
    this.search.addEventListener('input', () => onFilter(this.search.value));
    this.list = h('div', { class: 'results-list', role: 'radiogroup', 'aria-label': 'Matching planets' });
    this.list.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (t.name === this.name && t.checked) onSelect(t.value);
    });
    this.meta = h('p', { class: 'mono-note' });
    this.count = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
    this.el = h('div', { class: 'picker' },
      h('label', { for: id, class: 'visually-hidden' }, 'Search NASA Exoplanet Archive snapshot'),
      h('div', { class: 'field field--search' }, icon('search', 16), this.search),
      this.meta, this.count, this.list);
  }

  update(p: PlanetPickerProps): void {
    if (this.search.value !== p.filter) this.search.value = p.filter;
    const entries = p.catalog?.entries ?? [];
    const date = p.catalog ? p.catalog.generatedAt.slice(0, 10) : '';
    this.meta.textContent = p.status === 'loading' ? 'Loading snapshot…'
      : entries.length ? `Snapshot ${date} · ${entries.length} planet${entries.length === 1 ? '' : 's'}` : 'No planet data available';

    const key = `${date}|${entries.length}|${p.filter}|${p.selectedId}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const q = p.filter.trim().toLowerCase();
    if (!q) { replace(this.list); this.count.textContent = ''; return; }
    const matches = entries.filter((e) => e.planet.name.toLowerCase().includes(q) || e.star.name.toLowerCase().includes(q));
    const shown = matches.slice(0, MAX_ROWS);
    this.count.textContent = matches.length > shown.length
      ? `Showing ${shown.length} of ${matches.length} matches.`
      : `${matches.length} match${matches.length === 1 ? '' : 'es'}`;
    replace(this.list, ...shown.map((e) => {
      const input = h('input', { type: 'radio', name: this.name, value: e.id, class: 'visually-hidden' });
      input.checked = e.id === p.selectedId;
      return h('label', { class: 'result-row' }, input,
        h('span', { class: 'result-row__name' }, e.planet.name),
        h('span', { class: 'result-row__meta' }, `${e.star.spectralType || 'class unknown'} · ${num(e.planet.a_AU)} AU`));
    }));
    if (!matches.length) this.list.append(h('p', { class: 'muted small' }, 'No planets match. Try a star name such as Kepler or TRAPPIST.'));
  }
}
