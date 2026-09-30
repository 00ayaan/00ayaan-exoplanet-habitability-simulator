/**
 * Searchable real-planet picker: a text filter + a list of large tap targets
 * (listbox semantics via radio buttons). Shows host star and radius per row.
 */
import type { Catalog } from '../../physics/types';
import { h, nextId, replace } from '../dom';
import { num } from '../format';

export interface PlanetPickerProps {
  catalog: Catalog | null;
  status: 'loading' | 'ok' | 'empty' | 'error';
  filter: string;
  selectedId: string | null;
}

const MAX_ROWS = 60;

export class PlanetPicker {
  readonly el: HTMLDivElement;
  private search: HTMLInputElement;
  private list: HTMLDivElement;
  private count: HTMLParagraphElement;
  private banner: HTMLDivElement;
  private name = nextId('planet');
  private lastKey = '';

  constructor(onFilter: (q: string) => void, onSelect: (id: string) => void) {
    const id = nextId('search');
    this.search = h('input', { id, type: 'search', class: 'text-input', placeholder: 'Search planet or star…', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'search' });
    this.search.addEventListener('input', () => onFilter(this.search.value));
    this.list = h('div', { class: 'picker__list', role: 'radiogroup', 'aria-label': 'Exoplanets' });
    this.list.addEventListener('change', (ev) => {
      const t = ev.target as HTMLInputElement;
      if (t.name === this.name && t.checked) onSelect(t.value);
    });
    this.count = h('p', { class: 'hint', 'aria-live': 'polite' });
    this.banner = h('div');
    this.el = h('div', { class: 'picker' },
      this.banner,
      h('label', { for: id, class: 'control-label' }, 'Choose a real exoplanet'),
      this.search, this.count, this.list);
  }

  update(p: PlanetPickerProps): void {
    // Banner
    if (p.status === 'loading') replace(this.banner, h('p', { class: 'banner banner--info' }, 'Loading real-planet data…'));
    else if (p.status !== 'ok') replace(this.banner, h('p', { class: 'banner banner--warn', role: 'status' }, '⚠ Real-planet data unavailable — using hypothetical mode'));
    else if (p.catalog?.isFixture) replace(this.banner, h('p', { class: 'banner banner--warn', role: 'status' }, '⚠ Dev sample data — not real archive values'));
    else replace(this.banner);

    if (this.search.value !== p.filter) this.search.value = p.filter;
    const entries = p.catalog?.entries ?? [];
    const key = `${p.catalog?.generatedAt}|${entries.length}|${p.filter}|${p.selectedId}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const q = p.filter.trim().toLowerCase();
    const matches = q ? entries.filter((e) => e.planet.name.toLowerCase().includes(q) || e.star.name.toLowerCase().includes(q)) : entries;
    const shown = matches.slice(0, MAX_ROWS);
    // Keep the selected planet visible even if filtered past the cap.
    const sel = entries.find((e) => e.id === p.selectedId);
    if (sel && !shown.includes(sel) && matches.includes(sel)) shown.unshift(sel);

    this.count.textContent = entries.length === 0 ? '' : matches.length > shown.length
      ? `Showing ${shown.length} of ${matches.length} matches — refine your search.`
      : `${matches.length} planet${matches.length === 1 ? '' : 's'}`;

    replace(this.list, ...shown.map((e) => {
      const input = h('input', { type: 'radio', name: this.name, value: e.id, class: 'visually-hidden' });
      input.checked = e.id === p.selectedId;
      return h('label', { class: 'picker__row' }, input,
        h('span', { class: 'picker__name' }, e.planet.name),
        h('span', { class: 'picker__meta' },
          `${e.star.name} · ${e.planet.radius_Rearth != null ? num(e.planet.radius_Rearth) + ' R⊕' : 'radius unknown'}`));
    }));
    if (entries.length && !matches.length) this.list.append(h('p', { class: 'hint' }, 'No planets match.'));
  }
}
