import { HighlightOverlay } from './HighlightOverlay';
import { LayerNavigator } from './LayerNavigator';
import { StyleAnalyzer } from './StyleAnalyzer';
import { AlignmentGuides } from './AlignmentGuides';
import { Tooltip } from './Tooltip';
import { formatElementDisplayName } from './elementDisplayName';

export interface ElementInspectorCallbacks {
  onDeactivate?: () => void;
  /** Fires whenever a new element is highlighted via mousemove. */
  onHover?: (element: Element) => void;
  /** Fires when the user clicks an element and its name is copied. */
  onCopy?: () => void;
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
  private copyFeedbackTooltip: Tooltip;

  private currentElement: Element | null = null;

  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleClick: (e: MouseEvent) => void;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleScroll: () => void;

  constructor(callbacks: ElementInspectorCallbacks = {}) {
    this.callbacks = callbacks;
    this.layerNavigator = new LayerNavigator();
    this.styleAnalyzer = new StyleAnalyzer();
    this.highlightOverlay = new HighlightOverlay();
    this.copyFeedbackTooltip = new Tooltip('redline-copy-feedback-tooltip');
    this.alignmentGuides = new AlignmentGuides({}, {
      enableRulerInteraction: false,
      showElementHighlightFrame: false,
    });

    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);
  }

  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.alignmentGuides.mount();
    this.highlightOverlay.mount();

    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('click', this.boundHandleClick, true);
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    window.addEventListener('scroll', this.boundHandleScroll, true);

    document.body.style.cursor = 'crosshair';
  }

  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;

    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);

    this.highlightOverlay.hide();
    this.highlightOverlay.unmount();
    this.copyFeedbackTooltip.hide();

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

    const isNewHover = element !== this.currentElement;
    this.currentElement = element;

    this.alignmentGuides.showGuides(element);

    this.syncHighlightOverlay(element);

    if (isNewHover) this.callbacks.onHover?.(element);
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isActive) return;

    const target = e.target as Element;
    if (
      target.closest('[data-redline-guides]') ||
      target.closest('[data-redline-overlay]') ||
      target.closest('[data-redline-ui]')
    ) {
      return;
    }

    // Use the element selected by hover and/or arrow-key navigation.
    // Do not call updateAtPoint here — it resets the navigator to the
    // topmost element at the cursor and would undo ArrowUp/Down/Left/Right.
    const element =
      this.currentElement ?? this.layerNavigator.getCurrentElement();
    if (!element) return;

    const name = formatElementDisplayName(element);
    void this.copyTextToClipboard(name).then((copied) => {
      if (!copied || !this.isActive) return;

      this.callbacks.onCopy?.();

      this.copyFeedbackTooltip.showTemporary(
        {
          content: `Copied: ${name}`,
          x: e.clientX,
          y: e.clientY,
          size: 'small',
          offset: { x: 12, y: 12 },
        },
        1500,
      );
    });

    e.preventDefault();
    e.stopPropagation();
  }

  private async copyTextToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    }
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
        this.layerNavigator.navigateStackTowardRoot();
        this.applyCurrentNavigatorElement();
        this.callbacks.onArrowKey?.('up');
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.layerNavigator.navigateStackTowardLeaf();
        this.applyCurrentNavigatorElement();
        this.callbacks.onArrowKey?.('down');
        break;

      case 'ArrowRight':
        e.preventDefault();
        this.layerNavigator.navigateNext();
        this.applyCurrentNavigatorElement();
        this.callbacks.onArrowKey?.('right');
        break;

      case 'ArrowLeft':
        e.preventDefault();
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
}
