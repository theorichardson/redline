/**
 * FloatingButton - Floating UI element for triggering redline mode
 * Appears at the bottom-center of the viewport with a toggle button
 */

import { getTooltipCSS } from './styles';

export interface FloatingButtonCallbacks {
  onToggleRedline: () => void;
}

export class FloatingButton {
  private container: HTMLElement | null = null;
  private redlineButton: HTMLButtonElement | null = null;
  private collapseButton: HTMLButtonElement | null = null;
  private buttonsContainer: HTMLElement | null = null;
  private callbacks: FloatingButtonCallbacks;
  private isCollapsed: boolean = false;
  private static readonly STORAGE_KEY = 'redline-floating-button-collapsed';
  private static readonly STORAGE_POSITION_KEY = 'redline-floating-button-position';
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartLeft: number = 0;

  // Lucide SVG Icons
  // ruler-dimension-line icon for redline mode (inactive)
  private static readonly ICON_INACTIVE = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 15v-3"/>
      <path d="M14 15v-3"/>
      <path d="M18 15v-3"/>
      <path d="M2 8V4"/>
      <path d="M22 6H2"/>
      <path d="M22 8V4"/>
      <path d="M6 15v-3"/>
      <rect x="2" y="12" width="20" height="8" rx="2"/>
    </svg>
  `;

  // ruler-dimension-line icon for active state (same as inactive, color comes from button background)
  private static readonly ICON_ACTIVE = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 15v-3"/>
      <path d="M14 15v-3"/>
      <path d="M18 15v-3"/>
      <path d="M2 8V4"/>
      <path d="M22 6H2"/>
      <path d="M22 8V4"/>
      <path d="M6 15v-3"/>
      <rect x="2" y="12" width="20" height="8" rx="2"/>
    </svg>
  `;

  // chevron down icon
  private static readonly ICON_CHEVRON_DOWN = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m6 9 6 6 6-6"/>
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
    this.loadCollapseState();
    this.loadPosition();

    // Start hidden by default - caller should call show() if needed
    this.container!.style.display = 'none';
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
    this.collapseButton = null;
    this.buttonsContainer = null;
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
      const icon = active 
        ? FloatingButton.ICON_ACTIVE 
        : FloatingButton.ICON_INACTIVE;
      const tooltip = '<span class="btn-tooltip">Redline</span>';
      this.redlineButton.innerHTML = icon + tooltip;
      this.redlineButton.classList.toggle('redline-fab--active', active);
      this.redlineButton.setAttribute('aria-pressed', String(active));
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

    // Buttons container (for redline, ruler, and hybrid buttons)
    this.buttonsContainer = document.createElement('div');
    this.buttonsContainer.className = 'redline-buttons-container';

    // Redline Button (Hybrid mode)
    this.redlineButton = document.createElement('button');
    this.redlineButton.className = 'redline-fab';
    this.redlineButton.innerHTML = `
      ${FloatingButton.ICON_INACTIVE}
      <span class="btn-tooltip">Redline</span>
    `;
    this.redlineButton.setAttribute('aria-label', 'Toggle Redline Mode');
    this.redlineButton.setAttribute('aria-pressed', 'false');

    // Collapse Button
    this.collapseButton = document.createElement('button');
    this.collapseButton.className = 'redline-collapse-btn';
    this.collapseButton.innerHTML = FloatingButton.ICON_CHEVRON_DOWN;
    this.collapseButton.setAttribute('aria-label', 'Collapse buttons');
    this.collapseButton.title = 'Collapse buttons';

    this.buttonsContainer.appendChild(this.redlineButton);
    this.buttonsContainer.appendChild(this.collapseButton);
    this.container.appendChild(this.buttonsContainer);
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
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: bottom 0.2s ease;
        cursor: grab;
      }

      #redline-floating-button.dragging {
        cursor: grabbing;
        transition: none;
      }

      /* Container content wrapper */
      .redline-buttons-container {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 4px;
        background: #000000;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 24px;
        box-shadow: 
          0 4px 12px rgba(0, 0, 0, 0.15),
          0 1px 3px rgba(0, 0, 0, 0.1);
        user-select: none;
        transition: all 0.45s cubic-bezier(0.34, 1.35, 0.64, 1);
      }

      .redline-fab {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: white;
        cursor: pointer;
        transition: all 0.45s cubic-bezier(0.34, 1.35, 0.64, 1), 
                    filter 0.45s cubic-bezier(0.34, 1.35, 0.64, 1),
                    transform 0.45s cubic-bezier(0.34, 1.35, 0.64, 1);
        outline: none;
        padding: 0;
        position: relative;
      }

      .redline-fab:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .redline-fab:active {
        background: rgba(255, 255, 255, 0.15);
      }

      .redline-fab:focus-visible {
        outline: 2px solid #e63946;
        outline-offset: 2px;
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

      /* Tooltip styling - unified */
      .btn-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        ${getTooltipCSS('small')}
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 1000;
      }

      .redline-fab:hover .btn-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* Collapse button - looks like part of the container when expanded */
      .redline-collapse-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: white;
        cursor: pointer;
        transition: all 0.45s cubic-bezier(0.34, 1.35, 0.64, 1);
        outline: none;
        padding: 0;
      }

      .redline-collapse-btn svg {
        flex-shrink: 0;
        transition: transform 0.45s cubic-bezier(0.34, 1.35, 0.64, 1);
      }

      .redline-collapse-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .redline-collapse-btn:active {
        background: rgba(255, 255, 255, 0.15);
      }

      .redline-collapse-btn:focus-visible {
        outline: 2px solid #e63946;
        outline-offset: 2px;
      }

      /* Collapsed state - slide down and show only chevron */
      #redline-floating-button.collapsed {
        bottom: 0px;
      }

      #redline-floating-button.collapsed .redline-buttons-container {
        border-radius: 8px 8px 0 0;
        box-shadow: 
          0 -2px 8px rgba(0, 0, 0, 0.15);
        padding: 2px;
        gap: 0px;
        width: fit-content;
        margin: 0 auto;
      }

      #redline-floating-button.collapsed .redline-fab {
        width: 0;
        height: 0;
        min-width: 0;
        min-height: 0;
        padding: 0;
        margin: 0;
        opacity: 0;
        overflow: hidden;
        filter: blur(4px);
        transform: scale(0.3);
      }

      #redline-floating-button.collapsed .redline-collapse-btn {
        width: 24px;
        height: 16px;
        border-radius: 6px 6px 0 0;
        margin: 0;
      }

      #redline-floating-button.collapsed .redline-collapse-btn svg {
        transform: rotate(180deg);
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Helper to prevent Space key from triggering button clicks
    // (Space is used for element freeze in hybrid/ruler mode)
    const preventSpaceActivation = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    this.redlineButton?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onToggleRedline();
    });
    this.redlineButton?.addEventListener('keydown', preventSpaceActivation);

    this.collapseButton?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCollapse();
    });
    this.collapseButton?.addEventListener('keydown', preventSpaceActivation);

    // Drag to reposition
    this.container?.addEventListener('mousedown', this.handleDragStart.bind(this));
    document.addEventListener('mousemove', this.handleDragMove.bind(this));
    document.addEventListener('mouseup', this.handleDragEnd.bind(this));

    // Double-click to center
    this.container?.addEventListener('dblclick', this.handleDoubleClick.bind(this));
  }

  /**
   * Toggle collapse state
   */
  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.saveCollapseState();
    
    if (this.container) {
      if (this.isCollapsed) {
        this.container.classList.add('collapsed');
        this.collapseButton?.setAttribute('aria-label', 'Expand buttons');
        this.collapseButton!.title = 'Expand buttons';
      } else {
        this.container.classList.remove('collapsed');
        this.collapseButton?.setAttribute('aria-label', 'Collapse buttons');
        this.collapseButton!.title = 'Collapse buttons';
      }
    }
  }

  /**
   * Load collapse state from localStorage
   */
  private loadCollapseState(): void {
    try {
      const saved = localStorage.getItem(FloatingButton.STORAGE_KEY);
      if (saved === 'true') {
        this.isCollapsed = true;
        this.container?.classList.add('collapsed');
        this.collapseButton?.setAttribute('aria-label', 'Expand buttons');
        this.collapseButton!.title = 'Expand buttons';
      }
    } catch (e) {
      // localStorage might not be available
      console.warn('Failed to load collapse state:', e);
    }
  }

  /**
   * Save collapse state to localStorage
   */
  private saveCollapseState(): void {
    try {
      localStorage.setItem(FloatingButton.STORAGE_KEY, String(this.isCollapsed));
    } catch (e) {
      // localStorage might not be available
      console.warn('Failed to save collapse state:', e);
    }
  }

  /**
   * Handle drag start
   */
  private handleDragStart(e: MouseEvent): void {
    // Don't start drag if clicking on a button
    if ((e.target as HTMLElement).closest('.redline-fab, .redline-collapse-btn')) {
      return;
    }

    this.isDragging = true;
    this.dragStartX = e.clientX;
    
    if (this.container) {
      const rect = this.container.getBoundingClientRect();
      this.dragStartLeft = rect.left + rect.width / 2; // center position
      this.container.classList.add('dragging');
    }

    e.preventDefault();
  }

  /**
   * Handle drag move
   */
  private handleDragMove(e: MouseEvent): void {
    if (!this.isDragging || !this.container) return;

    const deltaX = e.clientX - this.dragStartX;
    let newLeft = this.dragStartLeft + deltaX;
    
    // Calculate percentage from center
    const viewportWidth = window.innerWidth;
    const centerX = viewportWidth / 2;
    
    // Magnetic pull to center (within 60px threshold)
    const distanceFromCenter = Math.abs(newLeft - centerX);
    const magnetThreshold = 60;
    
    if (distanceFromCenter < magnetThreshold) {
      // Apply magnetic pull - stronger as you get closer
      const pullStrength = 1 - (distanceFromCenter / magnetThreshold);
      const pullAmount = (centerX - newLeft) * pullStrength * 0.3;
      newLeft += pullAmount;
    }
    
    const percentage = (newLeft / viewportWidth) * 100;
    
    // Apply position (transform will handle centering)
    this.container.style.left = `${percentage}%`;
  }

  /**
   * Handle drag end
   */
  private handleDragEnd(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    
    if (this.container) {
      this.container.classList.remove('dragging');
      
      // Auto-snap to center if within threshold
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const viewportCenter = window.innerWidth / 2;
      const distanceFromCenter = Math.abs(centerX - viewportCenter);
      const snapThreshold = 40;
      
      if (distanceFromCenter < snapThreshold) {
        this.centerContainer();
      } else {
        this.savePosition();
      }
    }
  }

  /**
   * Handle double-click to center
   */
  private handleDoubleClick(e: MouseEvent): void {
    // Only respond to double-click on the container background, not buttons
    if ((e.target as HTMLElement).closest('.redline-fab, .redline-collapse-btn')) {
      return;
    }
    
    this.centerContainer();
  }

  /**
   * Center the container
   */
  private centerContainer(): void {
    if (!this.container) return;
    
    this.container.style.left = '50%';
    this.savePosition();
  }

  /**
   * Load position from localStorage
   */
  private loadPosition(): void {
    try {
      const saved = localStorage.getItem(FloatingButton.STORAGE_POSITION_KEY);
      if (saved && this.container) {
        this.container.style.left = saved;
      }
    } catch (e) {
      console.warn('Failed to load position:', e);
    }
  }

  /**
   * Save position to localStorage
   */
  private savePosition(): void {
    try {
      if (this.container) {
        const left = this.container.style.left || '50%';
        localStorage.setItem(FloatingButton.STORAGE_POSITION_KEY, left);
      }
    } catch (e) {
      console.warn('Failed to save position:', e);
    }
  }
}
