/**
 * HighlightOverlay - Renders visual highlight around elements
 * Uses fixed positioning and shows element boundaries
 */
export class HighlightOverlay {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private box: HTMLElement;
  private tooltip: HTMLElement;

  private highlightColor = '#ff8a94';

  constructor() {
    // Create shadow DOM host for style isolation
    this.container = document.createElement('div');
    this.container.setAttribute('data-redline-overlay', 'true');
    // Style the container directly (not via :host) to ensure it works
    this.container.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
    `;
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Create simple box overlay
    this.box = document.createElement('div');
    this.box.className = 'redline-box';

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'redline-tooltip';

    this.shadow.appendChild(this.box);
    this.shadow.appendChild(this.tooltip);
  }

  private getStyles(): string {
    return `
      .redline-box {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border: 2px solid ${this.highlightColor};
        border-radius: 4px;
        background: rgba(255, 138, 148, 0.08);
        box-sizing: border-box;
        display: none;
      }

      .redline-tooltip {
        position: fixed;
        background: #1a1a2e;
        color: #fff;
        padding: 6px 10px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        white-space: nowrap;
        z-index: 2147483647;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        pointer-events: none;
        display: none;
      }

      .redline-tooltip .tag {
        color: #ff6b9d;
      }

      .redline-tooltip .id {
        color: #ffd93d;
      }

      .redline-tooltip .class {
        color: #6bcf7f;
      }

      .redline-tooltip .dims {
        color: #8b8b9a;
        margin-left: 8px;
      }
    `;
  }

  mount(): void {
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
      console.log('[Redline] Overlay mounted');
    }
  }

  unmount(): void {
    this.container.remove();
  }

  highlight(element: Element): void {
    const rect = element.getBoundingClientRect();

    // Position the highlight box
    this.box.style.top = `${rect.top}px`;
    this.box.style.left = `${rect.left}px`;
    this.box.style.width = `${rect.width}px`;
    this.box.style.height = `${rect.height}px`;
    this.box.style.display = 'block';

    // Update tooltip
    this.updateTooltip(element, rect);
  }

  private updateTooltip(element: Element, rect: DOMRect): void {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = Array.from(element.classList)
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('');

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    this.tooltip.innerHTML = `
      <span class="tag">&lt;${tag}&gt;</span>${id ? `<span class="id">${id}</span>` : ''}${classes ? `<span class="class">${classes}</span>` : ''}
      <span class="dims">${width} × ${height}</span>
    `;

    // Position tooltip above element, or below if no room
    const tooltipHeight = 30;
    const tooltipTop = rect.top - tooltipHeight - 8;
    const useTop = tooltipTop > 0;

    this.tooltip.style.left = `${rect.left}px`;
    this.tooltip.style.top = useTop ? `${tooltipTop}px` : `${rect.bottom + 8}px`;
    this.tooltip.style.display = 'block';
  }

  hide(): void {
    this.box.style.display = 'none';
    this.tooltip.style.display = 'none';
  }

  setColor(color: string): void {
    this.highlightColor = color;
    this.box.style.borderColor = color;
  }
}
