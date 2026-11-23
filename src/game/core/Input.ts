export const MouseButton = { Left: 0, Middle: 1, Right: 2 } as const;

export interface PointerInfo {
  x: number; // canvas-relative CSS px
  y: number;
  button: number;
  shift: boolean;
  ctrl: boolean;
}

export interface InputListener {
  onPointerDown?(p: PointerInfo): void;
  onPointerMove?(p: PointerInfo): void;
  onPointerUp?(p: PointerInfo): void;
  onKeyDown?(code: string, e: KeyboardEvent): void;
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

/**
 * Centralised raw input: keyboard state, mouse buttons, drag deltas and wheel,
 * accumulated per frame and consumed by the camera; discrete events are
 * forwarded to listeners (tools, hotkeys).
 */
export class Input {
  readonly keys = new Set<string>();
  readonly buttons = new Set<number>();
  pointerX = 0;
  pointerY = 0;
  pointerInside = false;
  dragDX = 0;
  dragDY = 0;
  wheel = 0;
  private listeners: InputListener[] = [];
  private readonly abort = new AbortController();

  constructor(private readonly el: HTMLElement) {
    const opts = { signal: this.abort.signal };
    el.addEventListener('pointerdown', this.handleDown, opts);
    window.addEventListener('pointermove', this.handleMove, opts);
    window.addEventListener('pointerup', this.handleUp, opts);
    el.addEventListener('pointerenter', () => (this.pointerInside = true), opts);
    el.addEventListener('pointerleave', () => (this.pointerInside = false), opts);
    el.addEventListener('wheel', this.handleWheel, { signal: this.abort.signal, passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    el.addEventListener('auxclick', (e) => e.preventDefault(), opts);
    window.addEventListener('keydown', this.handleKeyDown, opts);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), opts);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    }, opts);
  }

  addListener(l: InputListener): () => void {
    this.listeners.push(l);
    return () => (this.listeners = this.listeners.filter((x) => x !== l));
  }

  private info(e: PointerEvent): PointerInfo {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey };
  }

  private handleDown = (e: PointerEvent) => {
    if (e.button === MouseButton.Middle) e.preventDefault();
    this.el.focus?.();
    this.buttons.add(e.button);
    const p = this.info(e);
    this.pointerX = p.x;
    this.pointerY = p.y;
    for (const l of this.listeners) l.onPointerDown?.(p);
  };

  private handleMove = (e: PointerEvent) => {
    if (this.buttons.size > 0) {
      this.dragDX += e.movementX;
      this.dragDY += e.movementY;
    }
    const p = this.info(e);
    this.pointerX = p.x;
    this.pointerY = p.y;
    for (const l of this.listeners) l.onPointerMove?.(p);
  };

  private handleUp = (e: PointerEvent) => {
    if (!this.buttons.has(e.button)) return;
    this.buttons.delete(e.button);
    const p = this.info(e);
    for (const l of this.listeners) l.onPointerUp?.(p);
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Normalise line/page deltas to pixels.
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    this.wheel += e.deltaY * scale;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    // Tab is a game key only while the map has focus (HUD buttons keep keyboard navigation).
    if (e.code === 'Tab' && (e.target === document.body || (e.target as HTMLElement | null)?.tagName === 'CANVAS')) e.preventDefault();
    const repeat = e.repeat;
    this.keys.add(e.code);
    if (repeat) return;
    for (const l of this.listeners) l.onKeyDown?.(e.code, e);
  };

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Read and reset per-frame accumulators. */
  consume(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.dragDX, dy: this.dragDY, wheel: this.wheel };
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheel = 0;
    return r;
  }

  dispose(): void {
    this.abort.abort();
    this.listeners = [];
  }
}
