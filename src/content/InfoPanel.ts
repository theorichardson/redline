import type { ElementInfo, Annotation, AncestorNode } from '../shared/types';

export interface InfoPanelCallbacks {
  onAddAnnotation: (feedback: string) => void;
  onUpdateAnnotation: (id: string, feedback: string) => void;
  onRemoveAnnotation: (id: string) => void;
  onCopyAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
  onBreadcrumbClick: (index: number) => void;
}

export interface PanelPosition {
  x: number;
  y: number;
}

/**
 * InfoPanel - Compact floating panel showing element info and annotation input
 * Rendered in Shadow DOM for style isolation
 */
export class InfoPanel {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private panel: HTMLElement;
  private callbacks: InfoPanelCallbacks;

  private _currentElementInfo: ElementInfo | null = null;
  private currentAnnotation: Annotation | null = null;

  get currentElementInfo(): ElementInfo | null {
    return this._currentElementInfo;
  }

  private detailsExpanded = false;

  // Panel dimensions for collision detection
  private readonly PANEL_WIDTH = 280;
  private readonly PANEL_MIN_HEIGHT = 160;
  private readonly EDGE_MARGIN = 12;

  constructor(callbacks: InfoPanelCallbacks) {
    this.callbacks = callbacks;

    // Create shadow DOM host
    this.container = document.createElement('div');
    this.container.setAttribute('data-redline-panel', 'true');
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'redline-panel';
    this.panel.innerHTML = this.getTemplate();
    this.shadow.appendChild(this.panel);

    this.setupEventListeners();
  }

  private getStyles(): string {
    return `
      :host {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .redline-panel {
        position: fixed;
        width: ${this.PANEL_WIDTH}px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        display: none;
        flex-direction: column;
        color: #e0e0e0;
        font-size: 12px;
        line-height: 1.4;
        overflow: hidden;
      }

      .redline-panel.visible {
        display: flex;
      }

      /* Main content */
      .panel-main {
        padding: 8px 8px 0 8px;
      }

      /* Annotation input */
      .annotation-input {
        width: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 8px 10px;
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

      .annotation-input:focus {
        border-color: #e63946;
      }

      .annotation-input::placeholder {
        color: #555;
      }

      /* Buttons row */
      .button-row {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        padding: 0 0 4px 0;
      }

      .btn {
        flex: 1;
        background: #2a2a2a;
        border: none;
        color: #ccc;
        padding: 8px;
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

      .btn .count {
        opacity: 0.7;
        font-size: 12px;
      }

      /* Details section */
      .details-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        background: none;
        border: none;
        color: #666;
        padding: 8px 8px;
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: all 0.15s;
      }

      .details-toggle:hover {
        color: #999;
      }

      .details-toggle.expanded {
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        margin: 0 8px;
        padding: 8px 10px;
      }

      .details-toggle .chevron {
        transition: transform 0.15s;
        font-size: 8px;
      }

      .details-toggle.expanded .chevron {
        transform: rotate(90deg);
      }

      .details-content {
        display: none;
        padding: 8px;
        background: #0f0f0f;
        margin: 4px 8px 8px 8px;
        border-radius: 6px;
        max-height: 200px;
        overflow-y: auto;
      }

      .details-content::-webkit-scrollbar {
        width: 0;
        display: none;
      }

      .details-content {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .details-content.visible {
        display: block;
      }

      .details-content::-webkit-scrollbar {
        width: 4px;
      }

      .details-content::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 2px;
      }

      /* Detail items */
      .detail-section {
        margin-bottom: 10px;
      }

      .detail-section:last-child {
        margin-bottom: 0;
      }

      .detail-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #555;
        margin-bottom: 4px;
      }

      .detail-value {
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 10px;
        color: #aaa;
        word-break: break-all;
        background: #1a1a1a;
        padding: 4px 6px;
        border-radius: 3px;
      }

      .detail-value.selector {
        color: #6bcf7f;
      }

      .detail-value.element {
        color: #ff6b9d;
      }

      /* Layout grid */
      .layout-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
      }

      .layout-item {
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 10px;
        padding: 3px 5px;
        background: #1a1a1a;
        border-radius: 3px;
      }

      .layout-item .prop {
        color: #666;
      }

      .layout-item .value {
        color: #ffd93d;
      }

      /* Breadcrumb */
      .breadcrumb {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        align-items: center;
      }

      .breadcrumb-item {
        color: #555;
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 9px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        transition: all 0.15s;
      }

      .breadcrumb-item:hover {
        color: #e63946;
        background: rgba(230, 57, 70, 0.1);
      }

      .breadcrumb-item.current {
        color: #e63946;
      }

      .breadcrumb-sep {
        color: #333;
        font-size: 8px;
      }
    `;
  }

  private getTemplate(): string {
    return `
      <div class="panel-main">
        <textarea
          class="annotation-input"
          id="annotation-input"
          placeholder="Add feedback for this element..."
          rows="2"
        ></textarea>

        <div class="button-row">
          <button class="btn" id="cancel-btn">Cancel</button>
          <button class="btn primary" id="copy-btn">
            Copy <span class="count" id="annotation-count">(0)</span>
          </button>
        </div>
      </div>

      <button class="details-toggle" id="details-toggle">
        <span class="chevron">▶</span>
        <span>Details</span>
      </button>

      <div class="details-content" id="details-content">
        <div class="detail-section">
          <div class="detail-label">Selector</div>
          <div class="detail-value selector" id="selector-text"></div>
        </div>

        <div class="detail-section">
          <div class="detail-label">Element</div>
          <div class="detail-value element" id="element-tag"></div>
        </div>

        <div class="detail-section">
          <div class="detail-label">Layout</div>
          <div class="layout-grid" id="layout-grid"></div>
        </div>

        <div class="detail-section">
          <div class="detail-label">Path</div>
          <div class="breadcrumb" id="breadcrumb"></div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Add annotation on Enter
    const input = this.shadow.getElementById('annotation-input') as HTMLTextAreaElement;

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const feedback = input.value.trim();
        if (feedback) {
          if (this.currentAnnotation) {
            this.callbacks.onUpdateAnnotation(this.currentAnnotation.id, feedback);
          } else {
            this.callbacks.onAddAnnotation(feedback);
          }
          input.value = '';
        }
      } else if (e.key === 'Escape') {
        this.callbacks.onClose();
      }
    });

    // Copy button
    this.shadow.getElementById('copy-btn')?.addEventListener('click', () => {
      // First add any pending annotation
      const feedback = input?.value.trim();
      if (feedback) {
        if (this.currentAnnotation) {
          this.callbacks.onUpdateAnnotation(this.currentAnnotation.id, feedback);
        } else {
          this.callbacks.onAddAnnotation(feedback);
        }
        input.value = '';
      }
      this.callbacks.onCopyAll();
    });

    // Cancel button - close panel and clear input
    this.shadow.getElementById('cancel-btn')?.addEventListener('click', () => {
      if (input) {
        input.value = '';
      }
      this.callbacks.onClose();
    });

    // Details toggle
    const detailsToggle = this.shadow.getElementById('details-toggle');
    const detailsContent = this.shadow.getElementById('details-content');

    detailsToggle?.addEventListener('click', () => {
      this.detailsExpanded = !this.detailsExpanded;
      detailsToggle.classList.toggle('expanded', this.detailsExpanded);
      detailsContent?.classList.toggle('visible', this.detailsExpanded);
    });

    // Breadcrumb click handlers are added dynamically in show()
  }

  /**
   * Calculate panel position with collision detection
   */
  private calculatePosition(clickX: number, clickY: number): { left: number; top: number } {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Estimate panel height (will be taller if details are expanded)
    const panelHeight = this.detailsExpanded ? 400 : this.PANEL_MIN_HEIGHT;

    let left = clickX + 10; // Offset from cursor
    let top = clickY + 10;

    // Check right edge collision
    if (left + this.PANEL_WIDTH + this.EDGE_MARGIN > viewportWidth) {
      left = clickX - this.PANEL_WIDTH - 10; // Show to the left of cursor
    }

    // Check left edge collision
    if (left < this.EDGE_MARGIN) {
      left = this.EDGE_MARGIN;
    }

    // Check bottom edge collision
    if (top + panelHeight + this.EDGE_MARGIN > viewportHeight) {
      top = clickY - panelHeight - 10; // Show above cursor
    }

    // Check top edge collision
    if (top < this.EDGE_MARGIN) {
      top = this.EDGE_MARGIN;
    }

    return { left, top };
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
    elementInfo: ElementInfo,
    _layerIndicator: string,
    breadcrumb: AncestorNode[],
    _issues: string[],
    existingAnnotation: Annotation | null,
    position?: PanelPosition
  ): void {
    this._currentElementInfo = elementInfo;
    this.currentAnnotation = existingAnnotation;

    // Position the panel
    if (position) {
      const { left, top } = this.calculatePosition(position.x, position.y);
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
      this.panel.style.right = 'auto';
    }

    // Selector
    const selectorEl = this.shadow.getElementById('selector-text');
    if (selectorEl) selectorEl.textContent = elementInfo.selector;

    // Element tag (truncated)
    const tagEl = this.shadow.getElementById('element-tag');
    if (tagEl) {
      const openingTag = elementInfo.outerHTML.split('>')[0] + '>';
      const truncated = openingTag.length > 60 ? openingTag.slice(0, 60) + '...' : openingTag;
      tagEl.textContent = truncated;
    }

    // Layout grid
    const layoutGrid = this.shadow.getElementById('layout-grid');
    if (layoutGrid) {
      const styles = elementInfo.computedStyles;
      const items = [
        { prop: 'display', value: styles.display },
        { prop: 'position', value: styles.position },
        { prop: 'width', value: styles.width },
        { prop: 'height', value: styles.height },
      ];

      layoutGrid.innerHTML = items
        .filter((item) => item.value)
        .map(
          (item) =>
            `<div class="layout-item"><span class="prop">${item.prop}:</span> <span class="value">${item.value}</span></div>`
        )
        .join('');
    }

    // Breadcrumb
    const breadcrumbEl = this.shadow.getElementById('breadcrumb');
    if (breadcrumbEl) {
      breadcrumbEl.innerHTML = breadcrumb
        .slice(-4) // Only show last 4 items
        .map(
          (node, i, arr) =>
            `<span class="breadcrumb-item ${i === arr.length - 1 ? 'current' : ''}" data-index="${breadcrumb.length - arr.length + i}">${node.selector}</span>${i < arr.length - 1 ? '<span class="breadcrumb-sep">›</span>' : ''}`
        )
        .join('');

      // Add click handlers
      breadcrumbEl.querySelectorAll('.breadcrumb-item').forEach((item) => {
        item.addEventListener('click', () => {
          const index = parseInt(item.getAttribute('data-index') || '0');
          this.callbacks.onBreadcrumbClick(index);
        });
      });
    }

    // Annotation input
    const input = this.shadow.getElementById('annotation-input') as HTMLTextAreaElement;
    if (input) {
      if (existingAnnotation) {
        input.value = existingAnnotation.feedback;
        input.placeholder = 'Update feedback...';
      } else {
        input.value = '';
        input.placeholder = 'Add feedback for this element...';
      }
      // Focus the input
      setTimeout(() => input.focus(), 50);
    }

    this.panel.classList.add('visible');
  }

  hide(): void {
    this.panel.classList.remove('visible');
    this._currentElementInfo = null;
    this.currentAnnotation = null;
    // Collapse details when hiding
    this.detailsExpanded = false;
    this.shadow.getElementById('details-toggle')?.classList.remove('expanded');
    this.shadow.getElementById('details-content')?.classList.remove('visible');
  }

  updateAnnotationCount(count: number): void {
    const countEl = this.shadow.getElementById('annotation-count');
    if (countEl) countEl.textContent = `(${count})`;
  }

  isVisible(): boolean {
    return this.panel.classList.contains('visible');
  }
}
