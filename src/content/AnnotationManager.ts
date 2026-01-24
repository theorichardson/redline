import type { Annotation, ElementInfo } from '../shared/types';

/**
 * AnnotationManager - Store and manage user annotations on elements
 * Supports multiple annotations per page, badge rendering, and export
 */
export class AnnotationManager {
  private annotations: Map<string, Annotation> = new Map();
  private badgeContainer: HTMLElement;
  private shadow: ShadowRoot;
  private nextId = 1;

  constructor() {
    // Create shadow DOM for badges
    this.badgeContainer = document.createElement('div');
    this.badgeContainer.setAttribute('data-redline-badges', 'true');
    this.shadow = this.badgeContainer.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = this.getBadgeStyles();
    this.shadow.appendChild(style);
  }

  private getBadgeStyles(): string {
    return `
      .redline-badge {
        position: fixed;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #e63946;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        z-index: 2147483645;
        transition: transform 0.15s ease;
      }

      .redline-badge:hover {
        transform: scale(1.15);
      }

      .redline-badge.selected {
        background: #1d3557;
        box-shadow: 0 0 0 2px #e63946, 0 2px 6px rgba(0, 0, 0, 0.3);
      }
    `;
  }

  mount(): void {
    if (!this.badgeContainer.parentElement) {
      document.body.appendChild(this.badgeContainer);
    }
  }

  unmount(): void {
    this.badgeContainer.remove();
  }

  /**
   * Add an annotation for an element
   */
  add(elementInfo: ElementInfo, feedback: string): Annotation {
    const id = `annotation-${this.nextId++}`;
    const annotation: Annotation = {
      id,
      selector: elementInfo.selector,
      feedback,
      elementInfo,
      timestamp: Date.now(),
    };

    this.annotations.set(id, annotation);
    this.renderBadge(annotation);

    return annotation;
  }

  /**
   * Update an existing annotation's feedback
   */
  update(id: string, feedback: string): boolean {
    const annotation = this.annotations.get(id);
    if (!annotation) return false;

    annotation.feedback = feedback;
    annotation.timestamp = Date.now();
    return true;
  }

  /**
   * Remove an annotation
   */
  remove(id: string): boolean {
    const annotation = this.annotations.get(id);
    if (!annotation) return false;

    // Remove badge
    const badge = this.shadow.querySelector(`[data-annotation-id="${id}"]`);
    badge?.remove();

    this.annotations.delete(id);
    this.renumberBadges();
    return true;
  }

  /**
   * Clear all annotations
   */
  clear(): void {
    this.annotations.clear();
    // Remove all badges
    const badges = this.shadow.querySelectorAll('.redline-badge');
    badges.forEach((badge) => badge.remove());
    this.nextId = 1;
  }

  /**
   * Get all annotations
   */
  getAll(): Annotation[] {
    return Array.from(this.annotations.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get annotation by ID
   */
  get(id: string): Annotation | undefined {
    return this.annotations.get(id);
  }

  /**
   * Get annotation count
   */
  count(): number {
    return this.annotations.size;
  }

  /**
   * Find annotation by selector (if element was previously annotated)
   */
  findBySelector(selector: string): Annotation | undefined {
    for (const annotation of this.annotations.values()) {
      if (annotation.selector === selector) {
        return annotation;
      }
    }
    return undefined;
  }

  /**
   * Render a badge for an annotation
   */
  private renderBadge(annotation: Annotation): void {
    const badge = document.createElement('div');
    badge.className = 'redline-badge';
    badge.setAttribute('data-annotation-id', annotation.id);
    badge.textContent = String(this.annotations.size);

    // Position badge at element
    this.positionBadge(badge, annotation.elementInfo.boundingRect);

    badge.addEventListener('click', () => {
      this.onBadgeClick?.(annotation.id);
    });

    this.shadow.appendChild(badge);
  }

  /**
   * Position a badge at an element's top-left corner
   */
  private positionBadge(badge: HTMLElement, rect: DOMRect): void {
    badge.style.left = `${rect.left - 8}px`;
    badge.style.top = `${rect.top - 8}px`;
  }

  /**
   * Update all badge positions (call on scroll/resize)
   */
  updateBadgePositions(): void {
    for (const annotation of this.annotations.values()) {
      const badge = this.shadow.querySelector(
        `[data-annotation-id="${annotation.id}"]`
      ) as HTMLElement;
      if (!badge) continue;

      // Try to find the element again
      try {
        const element = document.querySelector(annotation.selector);
        if (element) {
          const rect = element.getBoundingClientRect();
          this.positionBadge(badge, rect);
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      } catch {
        badge.style.display = 'none';
      }
    }
  }

  /**
   * Renumber badges after removal
   */
  private renumberBadges(): void {
    const sorted = this.getAll();
    sorted.forEach((annotation, index) => {
      const badge = this.shadow.querySelector(
        `[data-annotation-id="${annotation.id}"]`
      ) as HTMLElement;
      if (badge) {
        badge.textContent = String(index + 1);
      }
    });
  }

  /**
   * Highlight a specific badge as selected
   */
  selectBadge(id: string | null): void {
    // Remove selected from all
    const badges = this.shadow.querySelectorAll('.redline-badge');
    badges.forEach((badge) => badge.classList.remove('selected'));

    // Add selected to target
    if (id) {
      const badge = this.shadow.querySelector(`[data-annotation-id="${id}"]`);
      badge?.classList.add('selected');
    }
  }

  /**
   * Callback for badge clicks
   */
  onBadgeClick?: (id: string) => void;
}
