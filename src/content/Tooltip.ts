/**
 * Tooltip - Unified tooltip component for consistent styling across the app
 * Provides a single source of truth for tooltip appearance and behavior
 */

import { TOOLTIP_STYLES, TOOLTIP_STYLES_SMALL, TOOLTIP_STYLES_LARGE } from './styles';

export class Tooltip {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private tooltip: HTMLElement;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(containerId = 'redline-tooltip-container') {
    // Create container with shadow DOM
    this.container = document.createElement('div');
    this.container.id = containerId;
    this.shadow = this.container.attachShadow({ mode: 'open' });

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    
    this.shadow.appendChild(style);
    this.shadow.appendChild(this.tooltip);
  }

  private getStyles(): string {
    return `
      :host {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483646;
      }

      .tooltip {
        position: fixed;
        background: ${TOOLTIP_STYLES.background};
        color: ${TOOLTIP_STYLES.color};
        padding: ${TOOLTIP_STYLES.padding};
        border-radius: ${TOOLTIP_STYLES.borderRadius};
        font-family: ${TOOLTIP_STYLES.fontFamily};
        font-size: ${TOOLTIP_STYLES.fontSize};
        font-weight: ${TOOLTIP_STYLES.fontWeight};
        white-space: nowrap;
        pointer-events: none;
        box-shadow: ${TOOLTIP_STYLES.boxShadow};
        display: none;
        z-index: 2147483647;
        line-height: 1.3;
      }

      .tooltip.visible {
        display: block;
      }

      /* Size variants */
      .tooltip.small {
        padding: ${TOOLTIP_STYLES_SMALL.padding};
        font-size: ${TOOLTIP_STYLES_SMALL.fontSize};
        border-radius: ${TOOLTIP_STYLES_SMALL.borderRadius};
      }

      .tooltip.large {
        padding: ${TOOLTIP_STYLES_LARGE.padding};
        font-size: ${TOOLTIP_STYLES_LARGE.fontSize};
      }

      /* Color variants */
      .tooltip.light {
        background: rgba(255, 255, 255, 0.95);
        color: #1a1a2e;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .tooltip.accent {
        background: #e63946;
        color: #fff;
      }

      /* Content styling — same metrics as tooltip body so labels aren’t visually smaller than values */
      .tooltip .label {
        font-size: inherit;
        font-weight: inherit;
        color: rgba(255, 255, 255, 0.7);
        margin-right: 4px;
      }

      .tooltip .value {
        font-size: inherit;
        font-weight: inherit;
        color: #fff;
      }

      .tooltip.light .label {
        color: rgba(26, 26, 46, 0.6);
      }

      .tooltip.light .value {
        color: #1a1a2e;
      }
    `;
  }

  /**
   * Show tooltip at specified position
   */
  show(options: {
    content: string | HTMLElement;
    x: number;
    y: number;
    size?: 'small' | 'medium' | 'large';
    variant?: 'dark' | 'light' | 'accent';
    offset?: { x?: number; y?: number };
  }): void {
    const { content, x, y, size = 'medium', variant = 'dark', offset = {} } = options;

    // Set content
    if (typeof content === 'string') {
      this.tooltip.textContent = content;
    } else {
      this.tooltip.innerHTML = '';
      this.tooltip.appendChild(content);
    }

    // Apply classes
    this.tooltip.className = 'tooltip visible';
    if (size !== 'medium') {
      this.tooltip.classList.add(size);
    }
    if (variant !== 'dark') {
      this.tooltip.classList.add(variant);
    }

    // Position (with offset)
    const offsetX = offset.x || 0;
    const offsetY = offset.y || 0;
    this.tooltip.style.left = `${x + offsetX}px`;
    this.tooltip.style.top = `${y + offsetY}px`;

    // Ensure container is mounted
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show tooltip with smart positioning (avoids viewport edges)
   */
  showSmart(options: {
    content: string | HTMLElement;
    targetRect: DOMRect;
    preferredPosition?: 'top' | 'bottom' | 'left' | 'right';
    size?: 'small' | 'medium' | 'large';
    variant?: 'dark' | 'light' | 'accent';
    gap?: number;
  }): void {
    const { 
      content, 
      targetRect, 
      preferredPosition = 'top',
      size = 'medium',
      variant = 'dark',
      gap = 8
    } = options;

    // Set content first to measure
    if (typeof content === 'string') {
      this.tooltip.textContent = content;
    } else {
      this.tooltip.innerHTML = '';
      this.tooltip.appendChild(content);
    }

    // Apply classes
    this.tooltip.className = 'tooltip visible';
    if (size !== 'medium') {
      this.tooltip.classList.add(size);
    }
    if (variant !== 'dark') {
      this.tooltip.classList.add(variant);
    }

    // Temporarily show to measure
    this.tooltip.style.visibility = 'hidden';
    this.tooltip.style.display = 'block';
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
    }

    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let x: number;
    let y: number;

    // Calculate position based on preferred position and available space
    switch (preferredPosition) {
      case 'top':
        y = targetRect.top - tooltipRect.height - gap;
        if (y < padding) {
          // Not enough space above, try below
          y = targetRect.bottom + gap;
        }
        x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;

      case 'bottom':
        y = targetRect.bottom + gap;
        if (y + tooltipRect.height > viewportHeight - padding) {
          // Not enough space below, try above
          y = targetRect.top - tooltipRect.height - gap;
        }
        x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;

      case 'left':
        x = targetRect.left - tooltipRect.width - gap;
        if (x < padding) {
          // Not enough space left, try right
          x = targetRect.right + gap;
        }
        y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;

      case 'right':
        x = targetRect.right + gap;
        if (x + tooltipRect.width > viewportWidth - padding) {
          // Not enough space right, try left
          x = targetRect.left - tooltipRect.width - gap;
        }
        y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
    }

    // Keep within viewport bounds
    x = Math.max(padding, Math.min(x, viewportWidth - tooltipRect.width - padding));
    y = Math.max(padding, Math.min(y, viewportHeight - tooltipRect.height - padding));

    // Apply final position
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.style.visibility = '';
  }

  /**
   * Update tooltip position (useful for following cursor)
   */
  updatePosition(x: number, y: number): void {
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  /**
   * Update tooltip content
   */
  updateContent(content: string | HTMLElement): void {
    if (typeof content === 'string') {
      this.tooltip.textContent = content;
    } else {
      this.tooltip.innerHTML = '';
      this.tooltip.appendChild(content);
    }
  }

  /**
   * Show tooltip briefly beside a point, then hide automatically.
   */
  showTemporary(
    options: {
      content: string | HTMLElement;
      x: number;
      y: number;
      size?: 'small' | 'medium' | 'large';
      variant?: 'dark' | 'light' | 'accent';
      offset?: { x?: number; y?: number };
    },
    durationMs = 1500,
  ): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    this.show(options);
    this.hideTimeout = setTimeout(() => {
      this.hide();
      this.hideTimeout = null;
    }, durationMs);
  }

  /**
   * Hide tooltip
   */
  hide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.tooltip.classList.remove('visible');
  }

  /**
   * Check if tooltip is currently visible
   */
  isVisible(): boolean {
    return this.tooltip.classList.contains('visible');
  }

  /** Viewport rect of the visible tooltip, for label collision avoidance. */
  getRect(): DOMRect | null {
    if (!this.isVisible()) return null;
    const rect = this.tooltip.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  /**
   * Remove tooltip from DOM
   */
  destroy(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

/**
 * Helper function to create formatted tooltip content
 */
export function createTooltipContent(parts: Array<{ label?: string; value: string }>): HTMLElement {
  const container = document.createElement('span');
  
  parts.forEach((part, index) => {
    if (index > 0) {
      container.appendChild(document.createTextNode(' '));
    }
    
    if (part.label) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'label';
      labelSpan.textContent = part.label;
      container.appendChild(labelSpan);
    }
    
    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    valueSpan.textContent = part.value;
    container.appendChild(valueSpan);
  });
  
  return container;
}
