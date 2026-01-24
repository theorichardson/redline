/**
 * FloatingButton - Floating UI element for triggering redline mode
 * Appears at the bottom-center of the viewport with a toggle button
 */

export interface FloatingButtonCallbacks {
  onToggleRedline: () => void;
  onToggleRuler: () => void;
}

export class FloatingButton {
  private container: HTMLElement | null = null;
  private redlineButton: HTMLButtonElement | null = null;
  private rulerButton: HTMLButtonElement | null = null;
  private callbacks: FloatingButtonCallbacks;

  // Lucide SVG Icons
  // layout-grid icon for redline mode (inactive)
  private static readonly ICON_INACTIVE = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1"/>
      <rect width="7" height="7" x="14" y="3" rx="1"/>
      <rect width="7" height="7" x="14" y="14" rx="1"/>
      <rect width="7" height="7" x="3" y="14" rx="1"/>
    </svg>
  `;

  // layout-grid icon with fill for active state
  private static readonly ICON_ACTIVE = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1" fill="currentColor" fill-opacity="0.3"/>
      <rect width="7" height="7" x="14" y="3" rx="1" fill="currentColor" fill-opacity="0.3"/>
      <rect width="7" height="7" x="14" y="14" rx="1" fill="currentColor" fill-opacity="0.3"/>
      <rect width="7" height="7" x="3" y="14" rx="1" fill="currentColor" fill-opacity="0.3"/>
    </svg>
  `;

  // ruler icon for ruler mode (inactive)
  private static readonly ICON_RULER_INACTIVE = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/>
      <path d="m14.5 12.5 2-2"/>
      <path d="m11.5 9.5 2-2"/>
      <path d="m8.5 6.5 2-2"/>
      <path d="m17.5 15.5 2-2"/>
    </svg>
  `;

  // ruler icon with fill for active state
  private static readonly ICON_RULER_ACTIVE = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" fill="currentColor" fill-opacity="0.3"/>
      <path d="m14.5 12.5 2-2"/>
      <path d="m11.5 9.5 2-2"/>
      <path d="m8.5 6.5 2-2"/>
      <path d="m17.5 15.5 2-2"/>
    </svg>
  `;

  constructor(callbacks: FloatingButtonCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Mount the floating button to the DOM
   */
  mount(): void {
    if (this.container) return;

    this.createElements();
    this.attachStyles();
    this.attachEventListeners();

    document.body.appendChild(this.container!);
  }

  /**
   * Unmount the floating button from the DOM
   */
  unmount(): void {
    if (!this.container) return;

    this.container.remove();
    this.container = null;
    this.redlineButton = null;
    this.rulerButton = null;
  }

  /**
   * Show the floating button
   */
  show(): void {
    if (this.container) {
      this.container.style.display = 'flex';
    }
  }

  /**
   * Hide the floating button
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Update the redline mode active state visual
   */
  setRedlineActive(active: boolean): void {
    if (this.redlineButton) {
      this.redlineButton.innerHTML = active 
        ? FloatingButton.ICON_ACTIVE 
        : FloatingButton.ICON_INACTIVE;
      this.redlineButton.classList.toggle('redline-fab--active', active);
      this.redlineButton.setAttribute('aria-pressed', String(active));
      this.redlineButton.title = active ? 'Deactivate Redline Mode' : 'Activate Redline Mode';
    }
  }

  /**
   * Update the ruler mode active state visual
   */
  setRulerActive(active: boolean): void {
    if (this.rulerButton) {
      this.rulerButton.innerHTML = active 
        ? FloatingButton.ICON_RULER_ACTIVE 
        : FloatingButton.ICON_RULER_INACTIVE;
      this.rulerButton.classList.toggle('redline-fab--active', active);
      this.rulerButton.setAttribute('aria-pressed', String(active));
      this.rulerButton.title = active ? 'Deactivate Ruler Mode' : 'Activate Ruler Mode';
    }
  }

  /**
   * Create DOM elements
   */
  private createElements(): void {
    // Container
    this.container = document.createElement('div');
    this.container.id = 'redline-floating-button';
    this.container.setAttribute('data-redline-ui', 'true');

    // Redline Button
    this.redlineButton = document.createElement('button');
    this.redlineButton.className = 'redline-fab';
    this.redlineButton.innerHTML = FloatingButton.ICON_INACTIVE;
    this.redlineButton.setAttribute('aria-label', 'Toggle Redline Mode');
    this.redlineButton.setAttribute('aria-pressed', 'false');
    this.redlineButton.title = 'Activate Redline Mode';

    // Ruler Button
    this.rulerButton = document.createElement('button');
    this.rulerButton.className = 'redline-fab';
    this.rulerButton.innerHTML = FloatingButton.ICON_RULER_INACTIVE;
    this.rulerButton.setAttribute('aria-label', 'Toggle Ruler Mode');
    this.rulerButton.setAttribute('aria-pressed', 'false');
    this.rulerButton.title = 'Activate Ruler Mode';

    this.container.appendChild(this.redlineButton);
    this.container.appendChild(this.rulerButton);
  }

  /**
   * Attach styles using a style element
   */
  private attachStyles(): void {
    const styleId = 'redline-fab-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #redline-floating-button {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        gap: 8px;
      }

      .redline-fab {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 12px;
        background: #1a1a2e;
        color: #a0a0b0;
        cursor: pointer;
        box-shadow: 
          0 4px 12px rgba(0, 0, 0, 0.15),
          0 1px 3px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
        transition: all 0.2s ease;
        outline: none;
      }

      .redline-fab:hover {
        background: #252540;
        color: #e0e0e0;
        transform: translateY(-1px);
        box-shadow: 
          0 6px 16px rgba(0, 0, 0, 0.2),
          0 2px 4px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .redline-fab:active {
        transform: translateY(0);
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.15),
          0 1px 2px rgba(0, 0, 0, 0.1);
      }

      .redline-fab:focus-visible {
        box-shadow: 
          0 4px 12px rgba(0, 0, 0, 0.15),
          0 0 0 2px #e63946;
      }

      .redline-fab--active {
        background: #e63946;
        color: white;
      }

      .redline-fab--active:hover {
        background: #d62839;
        color: white;
      }

      .redline-fab svg {
        flex-shrink: 0;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    this.redlineButton?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onToggleRedline();
    });

    this.rulerButton?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onToggleRuler();
    });

    // Prevent drag behavior
    this.container?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }
}
