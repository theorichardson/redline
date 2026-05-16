import { HighlightOverlay } from './HighlightOverlay';
import { LayerNavigator } from './LayerNavigator';
import { StyleAnalyzer } from './StyleAnalyzer';
import { AlignmentGuides } from './AlignmentGuides';

export interface ElementInspectorCallbacks {
  onDeactivate?: () => void;
  /** Fires whenever a new element is highlighted via mousemove. */
  onHover?: (element: Element) => void;
  /** Fires whenever an arrow key is consumed by the inspector. */
  onArrowKey?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  /**
   * Fires when Escape was the trigger for deactivation (vs FAB click,
   * popup, or programmatic). Distinct from onDeactivate so onboarding can
   * confirm the user actually used the keyboard exit.
   */
  onEscape?: () => void;
}

/**
 * ElementInspector — ruler lines by default plus full box-model colors (margin, border,
 * padding), hover label with typography when the element has text. Annotation / AI clipboard flows stay removed.
 */
export class ElementInspector {
  private isActive = false;
  private callbacks: ElementInspectorCallbacks;

  private alignmentGuides: AlignmentGuides;
  private highlightOverlay: HighlightOverlay;
  private styleAnalyzer: StyleAnalyzer;
  private layerNavigator: LayerNavigator;

  private currentElement: Element | null = null;

  // Tracks how many ArrowDown presses have stacked. Each press drills one
  // DOM level deeper under `currentElement`, expanding each outlined node
  // into its children where possible and leaving shallow branches pinned at
  // their deepest node so uneven nesting stays visible together.
  private childrenDepth = 0;

  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleScroll: () => void;

  constructor(callbacks: ElementInspectorCallbacks = {}) {
    this.callbacks = callbacks;
    this.layerNavigator = new LayerNavigator();
    this.styleAnalyzer = new StyleAnalyzer();
    this.highlightOverlay = new HighlightOverlay();
    this.alignmentGuides = new AlignmentGuides({}, {
      enableRulerInteraction: false,
      showElementHighlightFrame: false,
    });

    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);
  }

  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.alignmentGuides.mount();
    this.highlightOverlay.mount();

    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    window.addEventListener('scroll', this.boundHandleScroll, true);

    document.body.style.cursor = 'crosshair';
  }

  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;

    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);

    this.highlightOverlay.hide();
    this.highlightOverlay.unmount();

    this.alignmentGuides.hide();
    this.alignmentGuides.unmount();

    document.body.style.cursor = '';

    this.currentElement = null;
    this.layerNavigator.reset();

    this.callbacks.onDeactivate?.();
  }

  toggle(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  getIsActive(): boolean {
    return this.isActive;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isActive) return;

    const target = e.target as Element;
    if (
      target.closest('[data-redline-guides]') ||
      target.closest('[data-redline-overlay]') ||
      target.closest('[data-redline-ui]')
    ) {
      return;
    }

    this.layerNavigator.updateAtPoint(e.clientX, e.clientY);
    const element = this.layerNavigator.getCurrentElement();
    if (!element) {
      return;
    }

    // Moving the cursor onto a different element resets any child-outline
    // state from a previous ArrowDown press — otherwise stale outlines
    // would persist over an unrelated element.
    const isNewHover = element !== this.currentElement;
    if (isNewHover) {
      this.resetChildrenDepth();
    }
    this.currentElement = element;

    this.alignmentGuides.showGuides(element);

    this.syncHighlightOverlay(element);

    if (isNewHover) this.callbacks.onHover?.(element);
  }

  private syncHighlightOverlay(element: Element): void {
    this.highlightOverlay.highlight(element, {
      typography: this.styleAnalyzer.extractTypographyStyles(element),
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    const target = e.target as Element;
    const composedPath = e.composedPath();
    const actualTarget = composedPath[0] as Element;

    const isTypingInInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      actualTarget.tagName === 'INPUT' ||
      actualTarget.tagName === 'TEXTAREA';

    if (isTypingInInput && e.key !== 'Escape') {
      return;
    }

    switch (e.key) {
      case 'Escape':
        this.callbacks.onEscape?.();
        this.deactivate();
        e.preventDefault();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.resetChildrenDepth();
        this.layerNavigator.navigateUp();
        this.applyCurrentNavigatorElement();
        this.callbacks.onArrowKey?.('up');
        break;

      case 'ArrowDown':
        // Down = drill one step deeper in parallel across every outlined
        // subtree; shallow branches stay highlighted at their leaf instead
        // of disappearing when sibling branches go deeper.
        e.preventDefault();
        if (!this.currentElement) break;
        this.childrenDepth += 1;
        const baseChildren = this.collectInspectableChildren(
          this.currentElement,
        );
        if (baseChildren.length === 0) {
          this.childrenDepth -= 1;
          break;
        }
        let frontier = baseChildren;
        let stuck = false;
        for (let i = 1; i < this.childrenDepth; i++) {
          const next = this.parallelDrillOneStep(frontier);
          if (this.areSameFrontiers(frontier, next)) {
            stuck = true;
            break;
          }
          frontier = next;
        }
        if (stuck) {
          this.childrenDepth -= 1;
        }
        this.highlightOverlay.highlightChildren(frontier);
        this.callbacks.onArrowKey?.('down');
        break;

      case 'ArrowRight':
        e.preventDefault();
        this.resetChildrenDepth();
        this.layerNavigator.navigateNext();
        this.applyCurrentNavigatorElement();
        this.callbacks.onArrowKey?.('right');
        break;

      case 'ArrowLeft':
        e.preventDefault();
        this.resetChildrenDepth();
        this.layerNavigator.navigatePrevious();
        this.applyCurrentNavigatorElement();
        this.callbacks.onArrowKey?.('left');
        break;

      default:
        break;
    }
  }

  private handleScroll(): void {
    if (!this.isActive || !this.currentElement) return;

    this.alignmentGuides.showGuides(this.currentElement);
    this.syncHighlightOverlay(this.currentElement);
  }

  private applyCurrentNavigatorElement(): void {
    const element = this.layerNavigator.getCurrentElement();
    if (element) {
      this.currentElement = element;
      this.alignmentGuides.showGuides(element);
      this.syncHighlightOverlay(element);
    }
  }

  /**
   * Clear stacked-Down state and remove all child outlines from the overlay.
   */
  private resetChildrenDepth(): void {
    this.childrenDepth = 0;
    this.highlightOverlay.clearChildrenHighlight();
  }

  /** Direct element children suitable for outline drill-down (same filters as before). */
  private collectInspectableChildren(parent: Element): Element[] {
    const out: Element[] = [];
    for (const child of Array.from(parent.children)) {
      if (
        child.hasAttribute('data-redline-overlay') ||
        child.hasAttribute('data-redline-panel') ||
        child.hasAttribute('data-redline-ui') ||
        child.hasAttribute('data-redline-badges')
      ) {
        continue;
      }
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      out.push(child);
    }
    return out;
  }

  /**
   * One parallel drill step: each node becomes its inspectable children,
   * or stays put if it has none (leaf branch stays selected).
   */
  private parallelDrillOneStep(frontier: Element[]): Element[] {
    const next: Element[] = [];
    for (const node of frontier) {
      const kids = this.collectInspectableChildren(node);
      if (kids.length > 0) {
        next.push(...kids);
      } else {
        next.push(node);
      }
    }
    return next;
  }

  private areSameFrontiers(a: Element[], b: Element[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((el, i) => el === b[i]);
  }
}
