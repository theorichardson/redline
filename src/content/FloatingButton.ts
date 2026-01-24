/**
 * FloatingButton - Floating UI element for triggering redline mode
 * Appears at the bottom-center of the viewport with a toggle button
 */

export interface FloatingButtonCallbacks {
  onToggle: () => void;
}

export class FloatingButton {
  private container: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;
  private callbacks: FloatingButtonCallbacks;

  // SVG Icons
  private static readonly ICON_INACTIVE = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="2"/>
      <line x1="9" y1="9" x2="9" y2="21" stroke="currentColor" stroke-width="2"/>
    </svg>
  `;

  private static readonly ICON_ACTIVE = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="2"/>
      <line x1="9" y1="9" x2="9" y2="21" stroke="currentColor" stroke-width="2"/>
      <circle cx="15" cy="15" r="3" fill="currentColor"/>
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
    this.button = null;
  }

  /**
   * Update the active state visual
   */
  setActive(active: boolean): void {
    if (this.button) {
      this.button.innerHTML = active 
        ? FloatingButton.ICON_ACTIVE 
        : FloatingButton.ICON_INACTIVE;
      this.button.classList.toggle('redline-fab--active', active);
      this.button.setAttribute('aria-pressed', String(active));
      this.button.title = active ? 'Deactivate Redline Mode' : 'Activate Redline Mode';
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

    // Button
    this.button = document.createElement('button');
    this.button.className = 'redline-fab';
    this.button.innerHTML = FloatingButton.ICON_INACTIVE;
    this.button.setAttribute('aria-label', 'Toggle Redline Mode');
    this.button.setAttribute('aria-pressed', 'false');
    this.button.title = 'Activate Redline Mode';

    this.container.appendChild(this.button);
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
    this.button?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onToggle();
    });

    // Prevent drag behavior
    this.container?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }
}
