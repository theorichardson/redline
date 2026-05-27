/**
 * OnboardingTooltip - Persistent guided tour that anchors above the
 * floating black bar (FloatingButton), pointing at the redline icon with a
 * downward tail.
 *
 * Persistence: the current step lives in chrome.storage.local under
 * ONBOARDING_STORAGE_KEY, so the tour survives navigation between pages.
 *
 * Lifecycle: instantiated on every content-script load. The tooltip DOM is
 * only mounted while step > 0 (i.e. an active onboarding flow), and is torn
 * down on completion or skip.
 */

export const ONBOARDING_STORAGE_KEY = 'redline-onboarding-step';
export const ONBOARDING_STEP2_PROGRESS_KEY = 'redline-onboarding-step2-progress';

export type OnboardingStep = 0 | 1 | 2 | 3;

/**
 * Checklist state for step 2. Each flag flips when the user completes the
 * corresponding action; once all are true the tooltip advances to step 3.
 * Persisted under ONBOARDING_STEP2_PROGRESS_KEY so progress survives page
 * navigation.
 */
export interface Step2Progress {
  hovered: boolean;
  copied: boolean;
  usedUp: boolean;
  usedDown: boolean;
  exited: boolean;
}

export const EMPTY_STEP2_PROGRESS: Step2Progress = {
  hovered: false,
  copied: false,
  usedUp: false,
  usedDown: false,
  exited: false,
};

export interface OnboardingCallbacks {
  /** Called when the user dismisses or completes the flow (step → 0). */
  onComplete?: () => void;
  /** Called when the flow advances from one step to the next. */
  onAdvance?: (step: OnboardingStep) => void;
  /** Called when the user clicks "Open shortcuts" in step 3. */
  onOpenShortcuts?: () => void;
}

export class OnboardingTooltip {
  private step: OnboardingStep = 0;
  private step2Progress: Step2Progress = { ...EMPTY_STEP2_PROGRESS };
  private autoAdvanceTimer: number | null = null;
  private stepTransitionTimer: number | null = null;
  private container: HTMLElement | null = null;
  private rafId: number | null = null;
  private boundHandleResize: (() => void) | null = null;
  private callbacks: OnboardingCallbacks;

  // Total fade-out duration for inter-step crossfade. Should stay <= the
  // opacity transition declared on #redline-onboarding-tooltip so the
  // class removal can ease all the way back in without being clipped.
  private static readonly STEP_FADE_MS = 240;

  constructor(callbacks: OnboardingCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Current step (0 = inactive). */
  getStep(): OnboardingStep {
    return this.step;
  }

  /**
   * Apply a step value coming from storage (no write back). Use this when
   * reacting to chrome.storage.onChanged so we don't loop.
   */
  applyStep(step: OnboardingStep): void {
    if (this.step === step) return;
    this.step = step;
    this.render();
  }

  /**
   * Apply step 2 progress coming from storage. Re-renders only the
   * checkbox states (no full HTML rebuild) so any animations on the
   * checkmark trigger naturally.
   */
  applyStep2Progress(progress: Step2Progress): void {
    this.step2Progress = { ...progress };
    if (this.step === 2) {
      this.applyChecklistDOMState();
      this.maybeAutoAdvanceFromStep2();
    }
  }

  /**
   * Set the current step and persist it to chrome.storage.local. When
   * entering step 2 fresh, the checklist progress is reset.
   */
  async setStep(step: OnboardingStep): Promise<void> {
    const writes: Record<string, unknown> = { [ONBOARDING_STORAGE_KEY]: step };

    // Entering step 2 from any other step → start the checklist clean.
    // Leaving onboarding (step 0) → clear stale checklist state too.
    if (step === 2 && this.step !== 2) {
      this.step2Progress = { ...EMPTY_STEP2_PROGRESS };
      writes[ONBOARDING_STEP2_PROGRESS_KEY] = this.step2Progress;
    } else if (step === 0) {
      this.step2Progress = { ...EMPTY_STEP2_PROGRESS };
      writes[ONBOARDING_STEP2_PROGRESS_KEY] = this.step2Progress;
    }

    if (this.step === step) {
      await chrome.storage.local.set(writes);
      return;
    }
    this.step = step;
    await chrome.storage.local.set(writes);
    this.render();
    if (step === 0) {
      this.callbacks.onComplete?.();
    } else {
      this.callbacks.onAdvance?.(step);
    }
  }

  /** Inspector just turned on — advance from step 1 to step 2. */
  notifyInspectorActivated(): void {
    if (this.step === 1) void this.setStep(2);
  }

  /** Step 2 checklist: user hovered over an element. */
  notifyHover(): void {
    if (this.step !== 2 || this.step2Progress.hovered) return;
    void this.updateStep2Progress({ hovered: true });
  }

  /** Step 2 checklist: user clicked an element to copy its name. */
  notifyCopy(): void {
    if (this.step !== 2 || this.step2Progress.copied) return;
    void this.updateStep2Progress({ copied: true });
  }

  /** Step 2 checklist: user pressed an arrow key while inspecting. */
  notifyArrow(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (this.step !== 2) return;
    if (direction === 'up' && !this.step2Progress.usedUp) {
      void this.updateStep2Progress({ usedUp: true });
    } else if (direction === 'down' && !this.step2Progress.usedDown) {
      void this.updateStep2Progress({ usedDown: true });
    }
  }

  /** Step 2 checklist: user pressed Escape to exit Redline. */
  notifyEscape(): void {
    if (this.step !== 2 || this.step2Progress.exited) return;
    void this.updateStep2Progress({ exited: true });
  }

  /**
   * The user used the keyboard shortcut while onboarding step 3 is showing.
   * That's the success condition for the final step — dismiss the flow.
   */
  notifyShortcutUsed(): void {
    if (this.step === 3) void this.setStep(0);
  }

  /**
   * Tear down DOM, listeners, and rAF loop. Idempotent.
   */
  unmount(): void {
    this.stopTracking();
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    if (this.stepTransitionTimer !== null) {
      window.clearTimeout(this.stepTransitionTimer);
      this.stepTransitionTimer = null;
    }
    if (this.boundHandleResize) {
      window.removeEventListener('resize', this.boundHandleResize);
      this.boundHandleResize = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  /**
   * Persist a partial step-2 progress update, then sync the local DOM. The
   * storage write is the source of truth so other tabs see the same
   * checklist state.
   */
  private async updateStep2Progress(patch: Partial<Step2Progress>): Promise<void> {
    this.step2Progress = { ...this.step2Progress, ...patch };
    await chrome.storage.local.set({
      [ONBOARDING_STEP2_PROGRESS_KEY]: this.step2Progress,
    });
    if (this.step === 2) {
      this.applyChecklistDOMState();
      this.maybeAutoAdvanceFromStep2();
    }
  }

  /**
   * Toggle `.completed` on each checklist row to match progress. The DOM
   * structure is built once in renderStepHTML; this only flips classes so
   * CSS transitions on the checkmark fire naturally.
   */
  private applyChecklistDOMState(): void {
    if (!this.container) return;
    const rules: Array<[keyof Step2Progress, boolean]> = [
      ['hovered', this.step2Progress.hovered],
      ['copied', this.step2Progress.copied],
      ['usedDown', this.step2Progress.usedDown],
      ['usedUp', this.step2Progress.usedUp],
      ['exited', this.step2Progress.exited],
    ];
    for (const [key, done] of rules) {
      const row = this.container.querySelector<HTMLElement>(
        `.rl-onb-check-item[data-key="${key}"]`,
      );
      row?.classList.toggle('completed', done);
    }
  }

  /**
   * Auto-advance to step 3 once every step-2 checklist item is checked.
   * Uses a short delay so the user perceives the final tick before the
   * tooltip swaps content.
   */
  private maybeAutoAdvanceFromStep2(): void {
    const { hovered, copied, usedUp, usedDown, exited } = this.step2Progress;
    if (!(hovered && copied && usedUp && usedDown && exited)) return;
    if (this.autoAdvanceTimer !== null) return; // already scheduled
    this.autoAdvanceTimer = window.setTimeout(() => {
      this.autoAdvanceTimer = null;
      if (this.step === 2) void this.setStep(3);
    }, 700);
  }

  /**
   * Render or hide the tooltip based on the current step. When transitioning
   * between two visible steps (or stepping out to dismissal), this performs
   * a brief crossfade rather than a hard swap so the change feels guided.
   */
  private render(): void {
    if (this.step === 0) {
      this.fadeOutAndUnmount();
      return;
    }

    if (this.container && this.container.classList.contains('visible')) {
      this.beginStepCrossfade();
      return;
    }

    this.renderImmediate();
  }

  private renderImmediate(): void {
    this.ensureContainer();
    if (!this.container) return;
    this.swapStepContent();
    this.startTracking();
  }

  /**
   * Replace inner content and rewire per-step listeners without touching
   * the outer container's class state — used both for first render and
   * after the fade-out half of a crossfade.
   */
  private swapStepContent(): void {
    if (!this.container) return;
    this.container.innerHTML = this.renderStepHTML(this.step);
    this.attachStepListeners();
    if (this.step === 2) {
      this.applyChecklistDOMState();
      this.maybeAutoAdvanceFromStep2();
    }
  }

  /**
   * Crossfade from the currently-rendered step to whatever this.step is
   * now. The container is already mounted and visible; we briefly add
   * `.step-fading` (opacity 0 + slight downward translate), wait for the
   * CSS transition, swap the inner HTML, and remove the class so the new
   * content fades back in to its anchored position.
   */
  private beginStepCrossfade(): void {
    if (this.stepTransitionTimer !== null) {
      window.clearTimeout(this.stepTransitionTimer);
      this.stepTransitionTimer = null;
    }
    const c = this.container;
    if (!c) {
      this.renderImmediate();
      return;
    }
    c.classList.add('step-fading');
    this.stepTransitionTimer = window.setTimeout(() => {
      this.stepTransitionTimer = null;
      // Bail if the user dismissed mid-fade — the unmount path will run.
      if (!this.container || this.step === 0) return;
      this.swapStepContent();
      // Two rAFs so the browser commits the swapped DOM before easing the
      // class removal back to opacity 1 (otherwise we'd snap, not fade).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.container?.classList.remove('step-fading');
        });
      });
    }, OnboardingTooltip.STEP_FADE_MS);
  }

  /**
   * Dismiss with a brief fade-out instead of an instant remove() so step-3
   * → done still feels guided rather than abrupt.
   */
  private fadeOutAndUnmount(): void {
    if (!this.container) {
      this.unmount();
      return;
    }
    if (this.stepTransitionTimer !== null) {
      window.clearTimeout(this.stepTransitionTimer);
      this.stepTransitionTimer = null;
    }
    this.container.classList.add('step-fading');
    this.stepTransitionTimer = window.setTimeout(() => {
      this.stepTransitionTimer = null;
      this.unmount();
    }, OnboardingTooltip.STEP_FADE_MS);
  }

  private ensureContainer(): void {
    if (this.container) return;

    this.attachStyles();

    const el = document.createElement('div');
    el.id = 'redline-onboarding-tooltip';
    el.setAttribute('data-redline-ui', 'true');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    this.container = el;

    if (!this.boundHandleResize) {
      this.boundHandleResize = () => this.updatePosition();
      window.addEventListener('resize', this.boundHandleResize);
    }
  }

  private attachStyles(): void {
    const styleId = 'redline-onboarding-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.setAttribute('data-redline-ui', 'true');
    // Tail uses a rotated diamond positioned at the bottom of the tooltip
    // so the bottom-right edges (which are visible) inherit the tooltip
    // border, giving the illusion of a continuous outline.
    style.textContent = `
      /* Suppress the FAB's per-button hover tooltips while onboarding is
         visible — they otherwise pop up behind the onboarding tooltip and
         create a confusing stacked overlay. :has() scopes this to "only
         while #redline-onboarding-tooltip is in the DOM", so it lifts
         automatically when the tour ends and the container is removed. */
      body:has(#redline-onboarding-tooltip) #redline-floating-button .btn-tooltip {
        display: none !important;
      }

      #redline-onboarding-tooltip {
        position: fixed;
        z-index: 2147483647;
        max-width: 280px;
        min-width: 220px;
        padding: 14px 16px 14px;
        background: #000000;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px;
        box-shadow:
          0 12px 32px rgba(0, 0, 0, 0.45),
          0 2px 6px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        pointer-events: auto;
        opacity: 0;
        transform: translate(-50%, 3px);
        transition: opacity 0.26s ease-in-out, transform 0.26s ease-in-out;
      }

      #redline-onboarding-tooltip.visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      /* Mid-step crossfade: while .step-fading is on, the tooltip drifts
         a couple of px down and fades to invisible. We swap the inner HTML
         while it's invisible, then remove .step-fading so the new step
         eases back in to its anchored position. The motion is intentionally
         small (~3px) and the easing is symmetric ease-in-out so the
         transition reads as a gentle breath rather than a flash. */
      #redline-onboarding-tooltip.visible.step-fading {
        opacity: 0;
        transform: translate(-50%, 3px);
      }

      #redline-onboarding-tooltip::after {
        content: '';
        position: absolute;
        bottom: -7px;
        left: 50%;
        width: 12px;
        height: 12px;
        background: #000000;
        border-right: 1px solid rgba(255, 255, 255, 0.18);
        border-bottom: 1px solid rgba(255, 255, 255, 0.18);
        transform: translateX(-50%) rotate(45deg);
      }

      #redline-onboarding-tooltip .rl-onb-step {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.01em;
        color: #e63946;
        margin-bottom: 6px;
      }

      #redline-onboarding-tooltip .rl-onb-title {
        font-size: 14px;
        font-weight: 600;
        color: #ffffff;
        margin-bottom: 2px;
      }

      #redline-onboarding-tooltip .rl-onb-body {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.78);
        margin-bottom: 0;
      }

      #redline-onboarding-tooltip .rl-onb-checklist {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      #redline-onboarding-tooltip .rl-onb-check-item {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        font-size: 12.5px;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.78);
        transition: color 0.18s ease;
      }

      #redline-onboarding-tooltip .rl-onb-check-item.completed {
        color: rgba(255, 255, 255, 0.45);
      }

      #redline-onboarding-tooltip .rl-onb-check-item.completed .rl-onb-check-label {
        text-decoration: line-through;
        text-decoration-color: rgba(255, 255, 255, 0.35);
      }

      #redline-onboarding-tooltip .rl-onb-check-circle {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        margin-top: 1px;
        border-radius: 50%;
        border: 1.5px solid rgba(255, 255, 255, 0.35);
        background: transparent;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        transition: background 0.2s ease, border-color 0.2s ease,
                    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      #redline-onboarding-tooltip .rl-onb-check-icon {
        opacity: 0;
        transform: scale(0.6);
        transition: opacity 0.18s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      #redline-onboarding-tooltip .rl-onb-check-item.completed .rl-onb-check-circle {
        background: #e63946;
        border-color: #e63946;
        transform: scale(1.05);
      }

      #redline-onboarding-tooltip .rl-onb-check-item.completed .rl-onb-check-icon {
        opacity: 1;
        transform: scale(1);
      }

      #redline-onboarding-tooltip .rl-onb-check-label {
        flex: 1;
        min-width: 0;
      }

      #redline-onboarding-tooltip kbd {
        display: inline-block;
        padding: 1px 5px;
        margin: 0 1px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        font-weight: 500;
        color: #ffffff;
        line-height: 1.2;
      }

      #redline-onboarding-tooltip .rl-onb-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 12px;
      }

      #redline-onboarding-tooltip .rl-onb-btn {
        appearance: none;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.2;
        padding: 7px 12px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }

      #redline-onboarding-tooltip .rl-onb-btn--primary {
        background: #e63946;
        color: #ffffff;
      }

      #redline-onboarding-tooltip .rl-onb-btn--primary:hover {
        background: #d62839;
      }

      #redline-onboarding-tooltip .rl-onb-btn--ghost {
        background: transparent;
        color: rgba(255, 255, 255, 0.65);
      }

      #redline-onboarding-tooltip .rl-onb-btn--ghost:hover {
        color: #ffffff;
      }

      #redline-onboarding-tooltip .rl-onb-btn:focus,
      #redline-onboarding-tooltip .rl-onb-btn:focus-visible {
        outline: 2px solid rgba(230, 57, 70, 0.6);
        outline-offset: 2px;
      }

      #redline-onboarding-tooltip .rl-onb-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: rgba(255, 255, 255, 0.55);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 0;
      }

      #redline-onboarding-tooltip .rl-onb-close:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  private renderStepHTML(step: OnboardingStep): string {
    const close = `<button type="button" class="rl-onb-close" data-action="skip" aria-label="Dismiss onboarding">×</button>`;

    switch (step) {
      case 1:
        return `
          ${close}
          <div class="rl-onb-step">Step 1 of 3</div>
          <div class="rl-onb-title">Click me to activate Redline</div>
          <div class="rl-onb-body">Tap the icon below to turn on inspection mode.</div>
        `;

      case 2: {
        // Inline check icon — white tick that fades in via CSS when the
        // row picks up the .completed class.
        const checkIcon = `
          <svg class="rl-onb-check-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="2.5 6.5 5 9 9.5 3.5"/>
          </svg>
        `;
        return `
          ${close}
          <div class="rl-onb-step">Step 2 of 3</div>
          <div class="rl-onb-title">Try the inspector</div>
          <ul class="rl-onb-checklist">
            <li class="rl-onb-check-item" data-key="hovered">
              <span class="rl-onb-check-circle">${checkIcon}</span>
              <span class="rl-onb-check-label">Hover any element to see its layout</span>
            </li>
            <li class="rl-onb-check-item" data-key="copied">
              <span class="rl-onb-check-circle">${checkIcon}</span>
              <span class="rl-onb-check-label">Click to copy a div's name</span>
            </li>
            <li class="rl-onb-check-item" data-key="usedDown">
              <span class="rl-onb-check-circle">${checkIcon}</span>
              <span class="rl-onb-check-label">Press <kbd>↓</kbd> to drill into child layers</span>
            </li>
            <li class="rl-onb-check-item" data-key="usedUp">
              <span class="rl-onb-check-circle">${checkIcon}</span>
              <span class="rl-onb-check-label">Press <kbd>↑</kbd> to select the parent layer</span>
            </li>
            <li class="rl-onb-check-item" data-key="exited">
              <span class="rl-onb-check-circle">${checkIcon}</span>
              <span class="rl-onb-check-label">Hit <kbd>Esc</kbd> to exit Redline</span>
            </li>
          </ul>
        `;
      }

      case 3:
        return `
          ${close}
          <div class="rl-onb-step">Step 3 of 3</div>
          <div class="rl-onb-title">Set a keyboard shortcut</div>
          <div class="rl-onb-body">
            Quicker access from any tab. We recommend
            <kbd>⌥</kbd><kbd>R</kbd> — bind it on Chrome's shortcuts page,
            then come back here and press it to test.
          </div>
          <div class="rl-onb-actions">
            <button type="button" class="rl-onb-btn rl-onb-btn--primary" data-action="open-shortcuts">Open shortcuts</button>
            <button type="button" class="rl-onb-btn rl-onb-btn--ghost" data-action="skip">Done</button>
          </div>
        `;

      default:
        return '';
    }
  }

  private attachStepListeners(): void {
    if (!this.container) return;

    this.container.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
      const action = el.dataset.action;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleAction(action);
      });
    });
  }

  private handleAction(action: string | undefined): void {
    switch (action) {
      case 'next':
        if (this.step === 2) void this.setStep(3);
        return;
      case 'open-shortcuts':
        this.callbacks.onOpenShortcuts?.();
        return;
      case 'skip':
        void this.setStep(0);
        return;
    }
  }

  /**
   * Anchor the tooltip above the redline icon inside the floating bar. We
   * use rAF while visible so the tooltip tracks the bar even while the user
   * drags it around. (The bar is repositioned via inline style updates that
   * don't fire any event we can subscribe to.)
   */
  private startTracking(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      this.rafId = null;
      this.updatePosition();
      if (this.container && this.step !== 0) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTracking(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private updatePosition(): void {
    if (!this.container) return;

    // Prefer the redline icon itself as the anchor so the tail points at
    // the actual button. Fall back to the bar container if (e.g.) the bar
    // is collapsed and the icon is hidden.
    const fab = document.querySelector('#redline-floating-button .redline-fab') as HTMLElement | null;
    const bar = document.getElementById('redline-floating-button');
    const anchor = (fab && fab.offsetParent !== null) ? fab : bar;

    if (!anchor) {
      // No bar on the page yet — keep tooltip hidden until it appears.
      this.container.classList.remove('visible');
      return;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.container.classList.remove('visible');
      return;
    }

    const anchorCenterX = rect.left + rect.width / 2;
    const gap = 14; // distance between tooltip bottom edge and bar top

    // Place tooltip so its tail (centered, bottom of the box) sits just
    // above the anchor.
    this.container.style.left = `${anchorCenterX}px`;
    this.container.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    // Reset any "top" if previously set
    this.container.style.top = 'auto';

    if (!this.container.classList.contains('visible')) {
      // Defer to the next frame so the initial transform starts from the
      // pre-visible state, giving a soft slide-up animation.
      requestAnimationFrame(() => this.container?.classList.add('visible'));
    }
  }
}
