export interface RulerPromptCallbacks {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}

/**
 * RulerPrompt - Inline prompt for alignment annotations
 * Shows a small floating input near the selected ruler line
 */
export class RulerPrompt {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private prompt: HTMLElement;
  private callbacks: RulerPromptCallbacks;

  private readonly PROMPT_WIDTH = 320;
  private readonly EDGE_MARGIN = 12;

  constructor(callbacks: RulerPromptCallbacks) {
    this.callbacks = callbacks;

    // Create shadow DOM host
    this.container = document.createElement('div');
    this.container.setAttribute('data-redline-ui', 'true');
    this.container.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
    `;
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Create prompt
    this.prompt = document.createElement('div');
    this.prompt.className = 'ruler-prompt';
    this.prompt.innerHTML = this.getTemplate();
    this.shadow.appendChild(this.prompt);

    this.setupEventListeners();
  }

  private getStyles(): string {
    return `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .ruler-prompt {
        position: fixed;
        width: ${this.PROMPT_WIDTH}px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        display: none;
        flex-direction: column;
        color: #e0e0e0;
        font-size: 12px;
        pointer-events: auto;
        padding: 12px;
        gap: 8px;
      }

      .ruler-prompt.visible {
        display: flex;
      }

      .prompt-label {
        font-size: 11px;
        color: #999;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .prompt-input {
        width: 100%;
        background: #2a2a2a;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 10px 12px;
        color: #fff;
        font-size: 12px;
        font-family: inherit;
        resize: none;
        outline: none;
        transition: border-color 0.15s;
        box-sizing: border-box;
        line-height: 1.5;
        min-height: 54px;
      }

      .prompt-input:focus {
        border-color: #e63946;
      }

      .prompt-input::placeholder {
        color: #777;
      }

      .button-row {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .btn {
        background: #2a2a2a;
        border: none;
        color: #ccc;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .btn:hover {
        background: #333;
        color: #fff;
      }

      .btn.primary {
        background: #e63946;
        color: #fff;
      }

      .btn.primary:hover {
        background: #d62839;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn:disabled:hover {
        background: #2a2a2a;
      }

      .alignment-info {
        font-size: 11px;
        color: #666;
        padding: 6px 8px;
        background: #222;
        border-radius: 6px;
      }

      .alignment-info strong {
        color: #999;
      }
    `;
  }

  private getTemplate(): string {
    return `
      <div class="prompt-label">Alignment Prompt</div>
      <div class="alignment-info" id="alignment-info"></div>
      <textarea
        class="prompt-input"
        id="prompt-input"
        placeholder="Describe how these elements should align..."
        rows="2"
      ></textarea>
      <div class="button-row">
        <button class="btn" id="cancel-btn">Cancel</button>
        <button class="btn primary" id="copy-btn" disabled>Copy</button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const input = this.shadow.getElementById('prompt-input') as HTMLTextAreaElement;
    const copyBtn = this.shadow.getElementById('copy-btn') as HTMLButtonElement;
    const cancelBtn = this.shadow.getElementById('cancel-btn');

    // Enable copy button when there's text
    input?.addEventListener('input', () => {
      const hasText = input.value.trim().length > 0;
      copyBtn.disabled = !hasText;
    });

    // Submit on Enter (without Shift)
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          this.callbacks.onSubmit(text);
          input.value = '';
        }
      } else if (e.key === 'Escape') {
        this.callbacks.onCancel();
      }
    });

    // Copy button
    copyBtn?.addEventListener('click', () => {
      const text = input?.value.trim();
      if (text) {
        this.callbacks.onSubmit(text);
        if (input) input.value = '';
      }
    });

    // Cancel button
    cancelBtn?.addEventListener('click', () => {
      this.callbacks.onCancel();
    });
  }

  mount(): void {
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
    }
  }

  unmount(): void {
    this.container.remove();
  }

  show(
    position: { x: number; y: number },
    orientation: 'horizontal' | 'vertical',
    elementCount: number,
    alignmentType: string
  ): void {
    // Calculate position
    const { left, top } = this.calculatePosition(position.x, position.y, orientation);
    this.prompt.style.left = `${left}px`;
    this.prompt.style.top = `${top}px`;

    // Set alignment info
    const infoEl = this.shadow.getElementById('alignment-info');
    if (infoEl) {
      infoEl.innerHTML = `<strong>${elementCount} elements</strong> on ${alignmentType} line`;
    }

    // Focus input
    const input = this.shadow.getElementById('prompt-input') as HTMLTextAreaElement;
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }

    // Reset copy button state
    const copyBtn = this.shadow.getElementById('copy-btn') as HTMLButtonElement;
    if (copyBtn) copyBtn.disabled = true;

    this.prompt.classList.add('visible');
  }

  hide(): void {
    this.prompt.classList.remove('visible');
  }

  isVisible(): boolean {
    return this.prompt.classList.contains('visible');
  }

  private calculatePosition(
    x: number,
    y: number,
    orientation: 'horizontal' | 'vertical'
  ): { left: number; top: number } {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const promptHeight = 180; // Approximate height

    let left: number;
    let top: number;

    if (orientation === 'horizontal') {
      // For horizontal lines, show to the right or left
      left = x + 20;
      top = y - promptHeight / 2;

      // Check right edge collision
      if (left + this.PROMPT_WIDTH + this.EDGE_MARGIN > viewportWidth) {
        left = x - this.PROMPT_WIDTH - 20;
      }
    } else {
      // For vertical lines, show above or below
      left = x - this.PROMPT_WIDTH / 2;
      top = y + 20;

      // Check bottom edge collision
      if (top + promptHeight + this.EDGE_MARGIN > viewportHeight) {
        top = y - promptHeight - 20;
      }
    }

    // Ensure left boundary
    if (left < this.EDGE_MARGIN) {
      left = this.EDGE_MARGIN;
    }

    // Ensure right boundary
    if (left + this.PROMPT_WIDTH + this.EDGE_MARGIN > viewportWidth) {
      left = viewportWidth - this.PROMPT_WIDTH - this.EDGE_MARGIN;
    }

    // Ensure top boundary
    if (top < this.EDGE_MARGIN) {
      top = this.EDGE_MARGIN;
    }

    // Ensure bottom boundary
    if (top + promptHeight + this.EDGE_MARGIN > viewportHeight) {
      top = viewportHeight - promptHeight - this.EDGE_MARGIN;
    }

    return { left, top };
  }
}
