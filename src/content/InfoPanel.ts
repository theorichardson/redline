import type { ElementInfo, Annotation, AncestorNode } from '../shared/types';
import { CSSExplainer } from './CSSExplainer';

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
        border-radius: 16px;
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

      .redline-panel.details-expanded {
        padding-bottom: 8px;
      }

      /* Main content */
      .panel-main {
        padding: 12px;
      }

      .redline-panel.details-expanded .panel-main {
        padding-bottom: 8px;
      }

      /* Annotation input */
      .annotation-input {
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

      .annotation-input:focus {
        border-color: #e63946;
      }

      .annotation-input::placeholder {
        color: #777;
      }

      /* Buttons row */
      .button-row {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        justify-content: flex-end;
        align-items: center;
      }

      .btn {
        background: #2a2a2a;
        border: none;
        color: #ccc;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
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

      .btn {
        position: relative;
      }

      .btn-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: #0a0a0a;
        color: #ccc;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 1000;
      }

      .btn:hover .btn-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Details section */
      .details-toggle {
        display: flex;
        align-items: center;
        background: transparent;
        border: none;
        color: #ccc;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        height: 32px;
        white-space: nowrap;
        margin-right: auto;
      }

      .details-toggle:hover {
        background: #333;
        color: #fff;
      }

      .details-toggle.expanded {
        background: #333;
        color: #fff;
      }

      .details-content {
        display: none;
        padding: 8px;
        background: #2a2a2a;
        margin: 4px 12px 4px 12px;
        border-radius: 6px;
        max-height: 200px;
        overflow-y: auto;
        box-sizing: border-box;
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

      /* Detail items */
      .detail-section {
        margin-bottom: 8px;
      }

      .detail-section:last-child {
        margin-bottom: 0;
      }

      /* Layout styles - simple list */
      .layout-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .layout-item {
        font-size: 11px;
        color: #999;
        line-height: 1.4;
      }

      .layout-item .prop {
        color: #666;
      }

      .layout-item .value {
        color: #ccc;
      }

      /* Structure path - simple text */
      .structure-path {
        font-size: 11px;
        color: #999;
        line-height: 1.5;
      }

      .structure-path-item {
        color: #666;
        cursor: pointer;
      }

      .structure-path-item:hover {
        color: #999;
      }

      .structure-path-item.current {
        color: #ccc;
      }

      .structure-path-sep {
        color: #444;
        margin: 0 4px;
      }

      /* CSS Explainer section */
      .css-explainer {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid #333;
      }

      .css-explainer-title {
        font-size: 11px;
        font-weight: 600;
        color: #999;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .css-prop-explanation {
        margin-bottom: 8px;
        padding: 6px 8px;
        background: #1a1a1a;
        border-radius: 4px;
      }

      .css-prop-explanation:last-child {
        margin-bottom: 0;
      }

      .css-prop-name {
        font-size: 11px;
        font-weight: 600;
        color: #e63946;
        margin-bottom: 2px;
        font-family: 'SF Mono', Monaco, monospace;
      }

      .css-prop-value {
        font-size: 11px;
        color: #6c9bcf;
        margin-bottom: 4px;
        font-family: 'SF Mono', Monaco, monospace;
      }

      .css-prop-description {
        font-size: 11px;
        color: #aaa;
        line-height: 1.5;
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
          <button class="details-toggle btn" id="details-toggle">
            Details
          </button>
          <button class="btn" id="cancel-btn">Cancel</button>
          <button class="btn primary" id="copy-btn">
            Copy
            <span class="btn-tooltip" id="copy-tooltip">0 annotations</span>
          </button>
        </div>
      </div>

      <div class="details-content" id="details-content">
        <div class="detail-section">
          <div class="layout-list" id="layout-list"></div>
        </div>

        <div class="detail-section">
          <div class="structure-path" id="structure-path"></div>
        </div>

        <div class="css-explainer" id="css-explainer"></div>
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
      this.panel.classList.toggle('details-expanded', this.detailsExpanded);
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

    // Layout styles - simplified list
    const layoutList = this.shadow.getElementById('layout-list');
    if (layoutList) {
      const styles = elementInfo.computedStyles;
      const items: Array<{ prop: string; value: string }> = [];

      if (styles.display) items.push({ prop: 'display', value: styles.display });
      if (styles.position && styles.position !== 'static') {
        items.push({ prop: 'position', value: styles.position });
      }
      if (styles.width) items.push({ prop: 'width', value: styles.width });
      if (styles.height) items.push({ prop: 'height', value: styles.height });
      if (styles.flexDirection) items.push({ prop: 'flex-direction', value: styles.flexDirection });
      if (styles.flexGrow && styles.flexGrow !== '0') {
        items.push({ prop: 'flex-grow', value: styles.flexGrow });
      }
      if (styles.alignItems) items.push({ prop: 'align-items', value: styles.alignItems });
      if (styles.justifyContent) items.push({ prop: 'justify-content', value: styles.justifyContent });
      if (styles.gap) items.push({ prop: 'gap', value: styles.gap });
      if (styles.overflow && styles.overflow !== 'visible') {
        items.push({ prop: 'overflow', value: styles.overflow });
      }

      layoutList.innerHTML = items
        .map((item) => `<div class="layout-item"><span class="prop">${item.prop}</span> <span class="value">${item.value}</span></div>`)
        .join('');
    }

    // Structure path - simplified
    const structurePath = this.shadow.getElementById('structure-path');
    if (structurePath) {
      structurePath.innerHTML = breadcrumb
        .slice(-5) // Show last 5 items
        .map(
          (node, i, arr) =>
            `<span class="structure-path-item ${i === arr.length - 1 ? 'current' : ''}" data-index="${breadcrumb.length - arr.length + i}">${node.selector}</span>${i < arr.length - 1 ? '<span class="structure-path-sep">/</span>' : ''}`
        )
        .join('');

      // Add click handlers
      structurePath.querySelectorAll('.structure-path-item').forEach((item) => {
        item.addEventListener('click', () => {
          const index = parseInt(item.getAttribute('data-index') || '0');
          this.callbacks.onBreadcrumbClick(index);
        });
      });
    }

    // CSS Property Explainer
    const cssExplainer = this.shadow.getElementById('css-explainer');
    if (cssExplainer) {
      const explanations = CSSExplainer.generateExplanations(elementInfo.computedStyles as unknown as Record<string, string | undefined>);
      if (explanations.length > 0) {
        const explanationHTML = explanations.map(exp => {
          return `
            <div class="css-prop-explanation">
              <div class="css-prop-name">${exp.property}</div>
              <div class="css-prop-value">${exp.value}</div>
              <div class="css-prop-description">${exp.description}</div>
            </div>
          `;
        }).join('');
        
        cssExplainer.innerHTML = `
          <div class="css-explainer-title">Property Explanations</div>
          ${explanationHTML}
        `;
      } else {
        cssExplainer.innerHTML = '';
      }
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
    this.panel.classList.remove('details-expanded');
    this._currentElementInfo = null;
    this.currentAnnotation = null;
    // Collapse details when hiding
    this.detailsExpanded = false;
    this.shadow.getElementById('details-toggle')?.classList.remove('expanded');
    this.shadow.getElementById('details-content')?.classList.remove('visible');
  }

  updateAnnotationCount(count: number): void {
    const tooltipEl = this.shadow.getElementById('copy-tooltip');
    if (tooltipEl) {
      tooltipEl.textContent = count === 1 ? '1 annotation' : `${count} annotations`;
    }
  }

  isVisible(): boolean {
    return this.panel.classList.contains('visible');
  }
}
