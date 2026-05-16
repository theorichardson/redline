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

export type OnboardingStep = 0 | 1 | 2 | 3;

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
  private container: HTMLElement | null = null;
  private rafId: number | null = null;
  private boundHandleResize: (() => void) | null = null;
  private callbacks: OnboardingCallbacks;

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
   * Set the current step and persist it to chrome.storage.local.
   */
  async setStep(step: OnboardingStep): Promise<void> {
    if (this.step === step) {
      // Still ensure storage matches, in case caller is forcing a write.
      await chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: step });
      return;
    }
    this.step = step;
    await chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: step });
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
   * Render or hide the tooltip based on the current step.
   */
  private render(): void {
    if (this.step === 0) {
      this.unmount();
      return;
    }

    this.ensureContainer();
    if (!this.container) return;

    const html = this.renderStepHTML(this.step);
    this.container.innerHTML = html;
    this.attachStepListeners();
    this.startTracking();
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
        transform: translate(-50%, 4px);
        transition: opacity 0.18s ease, transform 0.18s ease;
      }

      #redline-onboarding-tooltip.visible {
        opacity: 1;
        transform: translate(-50%, 0);
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

      case 2:
        return `
          ${close}
          <div class="rl-onb-step">Step 2 of 3</div>
          <div class="rl-onb-title">Inspect any element</div>
          <div class="rl-onb-body">
            Hover over any element to see its layout. Use
            <kbd>↑</kbd><kbd>↓</kbd> to walk parents and children,
            <kbd>←</kbd><kbd>→</kbd> for siblings, and <kbd>Esc</kbd> to exit.
          </div>
          <div class="rl-onb-actions">
            <button type="button" class="rl-onb-btn rl-onb-btn--primary" data-action="next">Got it</button>
          </div>
        `;

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
