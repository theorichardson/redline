import { HighlightOverlay } from './HighlightOverlay';
import { LayerNavigator } from './LayerNavigator';
import { StyleAnalyzer } from './StyleAnalyzer';
import { AlignmentGuides } from './AlignmentGuides';

export interface ElementInspectorCallbacks {
  onDeactivate?: () => void;
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

    this.currentElement = element;

    this.alignmentGuides.showGuides(element);

    this.syncHighlightOverlay(element);
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
        this.deactivate();
        e.preventDefault();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.layerNavigator.navigateUp();
        this.applyCurrentNavigatorElement();
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.layerNavigator.navigateDown();
        this.applyCurrentNavigatorElement();
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
}
