import { HighlightOverlay } from './HighlightOverlay';
import { LayerNavigator } from './LayerNavigator';
import { StyleAnalyzer } from './StyleAnalyzer';
import { AlignmentGuides } from './AlignmentGuides';

export interface ElementInspectorCallbacks {
  onDeactivate?: () => void;
}

/**
 * ElementInspector — ruler lines by default plus full box-model colors (margin, border,
 * padding), hover label, Option typography. Annotation / AI clipboard flows stay removed.
 */
export class ElementInspector {
  private isActive = false;
  private callbacks: ElementInspectorCallbacks;

  private alignmentGuides: AlignmentGuides;
  private highlightOverlay: HighlightOverlay;
  private styleAnalyzer: StyleAnalyzer;
  private layerNavigator: LayerNavigator;

  private currentElement: Element | null = null;

  /** Tracks Option (Alt) so tooltip typography updates without moving the mouse */
  private lastAltKeyForTooltip = false;

  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleWheel: (e: WheelEvent) => void;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleKeyUp: (e: KeyboardEvent) => void;
  private boundHandleScroll: () => void;

  private accumulatedWheelDelta = 0;
  private readonly WHEEL_THRESHOLD = 50;
  private hasShownBoundsShake = false;
  private boundsShakeResetTimeout: ReturnType<typeof setTimeout> | null = null;

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
    this.boundHandleWheel = this.handleWheel.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);
  }

  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.alignmentGuides.mount();
    this.highlightOverlay.mount();

    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('wheel', this.boundHandleWheel, { passive: false, capture: true });
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
    window.addEventListener('scroll', this.boundHandleScroll, true);

    document.body.style.cursor = 'crosshair';
  }

  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;

    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('wheel', this.boundHandleWheel, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);

    this.highlightOverlay.hide();
    this.highlightOverlay.unmount();

    this.alignmentGuides.hide();
    this.alignmentGuides.unmount();

    document.body.style.cursor = '';

    this.currentElement = null;
    this.lastAltKeyForTooltip = false;
    this.layerNavigator.reset();
    this.accumulatedWheelDelta = 0;
    this.hasShownBoundsShake = false;
    if (this.boundsShakeResetTimeout) {
      clearTimeout(this.boundsShakeResetTimeout);
      this.boundsShakeResetTimeout = null;
    }

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

    const altNow = e.altKey;
    this.lastAltKeyForTooltip = altNow;

    this.layerNavigator.updateAtPoint(e.clientX, e.clientY);
    const element = this.layerNavigator.getCurrentElement();
    if (!element) {
      return;
    }

    const elementChanged = element !== this.currentElement;
    if (elementChanged) {
      this.currentElement = element;
      this.accumulatedWheelDelta = 0;
      this.hasShownBoundsShake = false;
    }

    this.alignmentGuides.showGuides(element);

    this.syncHighlightOverlay(element);
  }

  private syncHighlightOverlay(element: Element): void {
    const showTypographyInTooltip = this.lastAltKeyForTooltip;
    this.highlightOverlay.highlight(element, {
      showTypographyInTooltip,
      typography: showTypographyInTooltip
        ? this.styleAnalyzer.extractTypographyStyles(element)
        : null,
    });
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    this.accumulatedWheelDelta += e.deltaY;

    if (Math.abs(this.accumulatedWheelDelta) < this.WHEEL_THRESHOLD) {
      return;
    }

    const direction = this.accumulatedWheelDelta > 0 ? 1 : -1;
    const canNavigate =
      direction > 0 ? this.layerNavigator.canNavigateUp() : this.layerNavigator.canNavigateDown();

    if (!canNavigate) {
      if (!this.hasShownBoundsShake) {
        this.highlightOverlay.shake();
        this.hasShownBoundsShake = true;
      }
      this.accumulatedWheelDelta = 0;

      if (this.boundsShakeResetTimeout) {
        clearTimeout(this.boundsShakeResetTimeout);
      }
      this.boundsShakeResetTimeout = setTimeout(() => {
        this.hasShownBoundsShake = false;
        this.boundsShakeResetTimeout = null;
      }, 150);

      return;
    }

    this.hasShownBoundsShake = false;
    if (this.boundsShakeResetTimeout) {
      clearTimeout(this.boundsShakeResetTimeout);
      this.boundsShakeResetTimeout = null;
    }

    if (direction > 0) {
      this.layerNavigator.navigateUp();
    } else {
      this.layerNavigator.navigateDown();
    }

    this.accumulatedWheelDelta -= direction * this.WHEEL_THRESHOLD;

    const el = this.layerNavigator.getCurrentElement();
    if (el) {
      this.currentElement = el;
      this.alignmentGuides.showGuides(el);
      this.syncHighlightOverlay(el);
    }
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

      case 'Alt':
        if (!e.repeat && this.currentElement) {
          this.lastAltKeyForTooltip = true;
          this.syncHighlightOverlay(this.currentElement);
        }
        break;

      default:
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.isActive) return;

    const target = e.target as Element;
    const composedPath = e.composedPath();
    const actualTarget = composedPath[0] as Element;

    const isTypingInInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      actualTarget.tagName === 'INPUT' ||
      actualTarget.tagName === 'TEXTAREA';

    if (isTypingInInput) {
      return;
    }

    if (e.key === 'Alt') {
      this.lastAltKeyForTooltip = false;
      if (this.currentElement) {
        this.syncHighlightOverlay(this.currentElement);
      }
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
