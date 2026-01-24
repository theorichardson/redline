import type { AncestorNode } from '../shared/types';

/**
 * LayerNavigator - Navigate through overlapping/nested elements at a point
 * Uses document.elementsFromPoint() to get all elements at cursor position
 * Allows cycling through layers with scroll wheel or arrow keys
 */
export class LayerNavigator {
  private elementStack: Element[] = [];
  private currentIndex = 0;

  /**
   * Update the element stack at the given coordinates
   * Filters out our own UI elements
   */
  updateAtPoint(x: number, y: number): void {

    // Get all elements at this point, from topmost to bottommost
    const elements = document.elementsFromPoint(x, y);

    // Filter out Redline UI elements and html/body
    this.elementStack = elements.filter((el) => {
      // Skip our own UI (any element with data-redline-* attributes)
      if (
        el.hasAttribute('data-redline-overlay') ||
        el.hasAttribute('data-redline-panel') ||
        el.hasAttribute('data-redline-ui') ||
        el.hasAttribute('data-redline-badges')
      ) {
        return false;
      }
      if (
        el.closest('[data-redline-overlay]') ||
        el.closest('[data-redline-panel]') ||
        el.closest('[data-redline-ui]') ||
        el.closest('[data-redline-badges]')
      ) {
        return false;
      }
      // Skip html and body (rarely useful to inspect)
      if (el.tagName === 'HTML' || el.tagName === 'BODY') {
        return false;
      }
      return true;
    });

    // Reset to topmost element
    this.currentIndex = 0;
  }

  /**
   * Navigate up the stack (toward parent/deeper elements)
   */
  navigateUp(): Element | null {
    if (this.currentIndex < this.elementStack.length - 1) {
      this.currentIndex++;
    }
    return this.getCurrentElement();
  }

  /**
   * Navigate down the stack (toward child/topmost elements)
   */
  navigateDown(): Element | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
    return this.getCurrentElement();
  }

  /**
   * Jump to a specific index in the stack
   */
  jumpTo(index: number): Element | null {
    if (index >= 0 && index < this.elementStack.length) {
      this.currentIndex = index;
    }
    return this.getCurrentElement();
  }

  /**
   * Get the currently selected element
   */
  getCurrentElement(): Element | null {
    return this.elementStack[this.currentIndex] ?? null;
  }

  /**
   * Get the current index in the stack
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get total number of elements in stack
   */
  getStackSize(): number {
    return this.elementStack.length;
  }

  /**
   * Get the full element stack
   */
  getStack(): Element[] {
    return [...this.elementStack];
  }

  /**
   * Get breadcrumb path from current element to root
   * Returns array from root to current element (for display)
   */
  getBreadcrumbPath(): AncestorNode[] {
    const current = this.getCurrentElement();
    if (!current) return [];

    const path: AncestorNode[] = [];
    let el: Element | null = current;

    while (el && el !== document.documentElement) {
      path.unshift({
        tagName: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: Array.from(el.classList).slice(0, 2),
        selector: this.getSimpleSelector(el),
      });
      el = el.parentElement;
    }

    return path;
  }

  /**
   * Generate a simple selector for breadcrumb display
   */
  private getSimpleSelector(element: Element): string {
    const tag = element.tagName.toLowerCase();

    if (element.id) {
      return `${tag}#${element.id}`;
    }

    const classes = Array.from(element.classList).slice(0, 2);
    if (classes.length > 0) {
      return `${tag}.${classes.join('.')}`;
    }

    return tag;
  }

  /**
   * Check if there are more layers above (toward parents)
   */
  canNavigateUp(): boolean {
    return this.currentIndex < this.elementStack.length - 1;
  }

  /**
   * Check if there are more layers below (toward children)
   */
  canNavigateDown(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Reset navigation state
   */
  reset(): void {
    this.elementStack = [];
    this.currentIndex = 0;
  }

  /**
   * Get layer indicator text (e.g., "2 / 5")
   */
  getLayerIndicator(): string {
    if (this.elementStack.length === 0) return '';
    return `${this.currentIndex + 1} / ${this.elementStack.length}`;
  }
}
