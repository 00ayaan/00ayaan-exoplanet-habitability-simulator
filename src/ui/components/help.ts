/**
 * "?" help popover. Opens on tap/click (toggle) and on hover/keyboard focus;
 * closes on Esc, outside tap, scroll or resize. Positioned with JS (fixed) and
 * clamped to the viewport so it never causes horizontal scroll on phones.
 */
import { h, nextId } from '../dom';
import { icon } from '../icons';

let openOne: Help | null = null;
let openedAt = 0;
let globalsBound = false;

function bindGlobals(): void {
  if (globalsBound) return;
  globalsBound = true;
  const closeAll = () => openOne?.close();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('pointerdown', (e) => {
    if (openOne && !openOne.contains(e.target as Node)) closeAll();
  });
  // Ignore the scroll that tapping/focusing may itself cause right after opening.
  window.addEventListener('scroll', () => { if (performance.now() - openedAt > 400) closeAll(); }, { passive: true });
  window.addEventListener('resize', closeAll);
}

export class Help {
  readonly el: HTMLSpanElement;
  private btn: HTMLButtonElement;
  private pop: HTMLDivElement;
  private pinned = false;

  /** `content` may be text or a function producing nodes (re-evaluated on open). */
  constructor(topic: string, private content: string | (() => (Node | string)[])) {
    bindGlobals();
    const id = nextId('help');
    this.btn = h('button', { type: 'button', class: 'help__btn', 'aria-label': `About ${topic}`, 'aria-expanded': 'false', 'aria-controls': id });
    this.btn.append(icon('help', 15));
    this.pop = h('div', { id, class: 'help__pop', role: 'note', hidden: true });
    this.el = h('span', { class: 'help' }, this.btn, this.pop);
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isOpen() && this.pinned) this.close();
      else { this.pinned = true; this.open(); }
    });
    this.btn.addEventListener('mouseenter', () => { if (!this.isOpen()) this.open(); });
    this.btn.addEventListener('mouseleave', () => { if (!this.pinned) this.close(); });
    this.btn.addEventListener('focus', () => { if (!this.isOpen()) this.open(); });
    this.btn.addEventListener('blur', () => { if (!this.pinned) this.close(); });
  }

  contains(n: Node): boolean { return this.el.contains(n); }
  private isOpen(): boolean { return !this.pop.hidden; }

  open(): void {
    if (openOne && openOne !== this) openOne.close();
    openOne = this;
    openedAt = performance.now();
    const c = this.content;
    this.pop.replaceChildren(...(typeof c === 'string' ? [c] : c()));
    this.pop.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    const r = this.btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = Math.min(280, vw - 24);
    this.pop.style.width = `${w}px`;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), vw - w - 12);
    this.pop.style.left = `${left}px`;
    this.pop.style.setProperty('--arrow', `${Math.min(w - 12, Math.max(12, r.left + r.width / 2 - left))}px`);
    const below = r.bottom + 8;
    const ph = this.pop.offsetHeight;
    const flip = below + ph > window.innerHeight - 8 && r.top - ph - 8 > 8;
    this.pop.style.top = `${flip ? r.top - ph - 8 : below}px`;
    this.pop.classList.toggle('is-above', flip);
  }

  close(): void {
    this.pinned = false;
    this.pop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    if (openOne === this) openOne = null;
  }
}
