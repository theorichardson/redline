import type { ElementInfo, AncestorNode } from '../shared/types';
import { HighlightOverlay } from './HighlightOverlay';
import { LayerNavigator } from './LayerNavigator';
import { StyleAnalyzer } from './StyleAnalyzer';
import { SelectorGenerator } from './SelectorGenerator';
import { ReactDetector } from './ReactDetector';
import { AnnotationManager } from './AnnotationManager';
import { InfoPanel } from './InfoPanel';
import { LLMFormatter } from './LLMFormatter';

/**
 * ElementInspector - Main controller coordinating all inspection features
 * Manages activation state, event handling, and component coordination
 */
export class ElementInspector {
  private isActive = false;
  private isLocked = false; // When true, don't follow mouse (element selected)

  // Components
  private highlightOverlay: HighlightOverlay;
  private layerNavigator: LayerNavigator;
  private styleAnalyzer: StyleAnalyzer;
  private selectorGenerator: SelectorGenerator;
  private reactDetector: ReactDetector;
  private annotationManager: AnnotationManager;
  private infoPanel: InfoPanel;
  private llmFormatter: LLMFormatter;

  // Current state
  private currentElement: Element | null = null;
  private currentElementInfo: ElementInfo | null = null;
  private lastClickPosition: { x: number; y: number } = { x: 0, y: 0 };

  // Bound event handlers (for removal)
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleClick: (e: MouseEvent) => void;
  private boundHandleWheel: (e: WheelEvent) => void;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleScroll: () => void;

  // Scroll throttling - time-based to prevent rapid navigation
  private lastWheelNavigationTime = 0;
  private readonly WHEEL_THROTTLE_MS = 300; // Only allow navigation every 300ms

  constructor() {
    // Initialize components
    this.highlightOverlay = new HighlightOverlay();
    this.layerNavigator = new LayerNavigator();
    this.styleAnalyzer = new StyleAnalyzer();
    this.selectorGenerator = new SelectorGenerator();
    this.reactDetector = new ReactDetector();
    this.annotationManager = new AnnotationManager();
    this.llmFormatter = new LLMFormatter();

    // Initialize info panel with callbacks
    this.infoPanel = new InfoPanel({
      onAddAnnotation: (feedback) => this.handleAddAnnotation(feedback),
      onUpdateAnnotation: (id, feedback) => this.handleUpdateAnnotation(id, feedback),
      onRemoveAnnotation: (id) => this.handleRemoveAnnotation(id),
      onCopyAll: () => this.handleCopyAll(),
      onClearAll: () => this.handleClearAll(),
      onClose: () => this.handlePanelClose(),
      onBreadcrumbClick: (index) => this.handleBreadcrumbClick(index),
    });

    // Set up badge click handler
    this.annotationManager.onBadgeClick = (id) => {
      const annotation = this.annotationManager.get(id);
      if (annotation) {
        // Find and select the element
        try {
          const element = document.querySelector(annotation.selector);
          if (element) {
            this.selectElement(element);
          }
        } catch {
          // Selector might be invalid
        }
      }
    };

    // Bind event handlers
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleWheel = this.handleWheel.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);
  }

  /**
   * Activate inspection mode
   */
  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.isLocked = false;

    // Mount UI components
    this.highlightOverlay.mount();
    this.annotationManager.mount();
    this.infoPanel.mount();

    // Add event listeners
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('click', this.boundHandleClick, true);
    document.addEventListener('wheel', this.boundHandleWheel, { passive: false, capture: true });
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    window.addEventListener('scroll', this.boundHandleScroll, true);

    // Set cursor
    document.body.style.cursor = 'crosshair';

    console.log('[Redline] Inspection mode activated');
  }

  /**
   * Deactivate inspection mode
   */
  deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.isLocked = false;

    // Remove event listeners
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    document.removeEventListener('wheel', this.boundHandleWheel, true);
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);

    // Hide UI
    this.highlightOverlay.hide();
    this.infoPanel.hide();

    // Unmount (but keep annotation badges visible)
    this.highlightOverlay.unmount();
    this.infoPanel.unmount();

    // Reset cursor
    document.body.style.cursor = '';

    // Reset state
    this.currentElement = null;
    this.currentElementInfo = null;
    this.layerNavigator.reset();

    console.log('[Redline] Inspection mode deactivated');
  }

  /**
   * Toggle inspection mode
   */
  toggle(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /**
   * Check if inspection is active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  // --- Event Handlers ---

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isActive || this.isLocked) return;

    // Update layer navigator
    this.layerNavigator.updateAtPoint(e.clientX, e.clientY);

    // Get current element
    const element = this.layerNavigator.getCurrentElement();
    if (element && element !== this.currentElement) {
      this.currentElement = element;
      this.highlightOverlay.highlight(element);
    }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isActive) return;

    // Check if click is on our UI
    const target = e.target as Element;
    if (
      target.closest('[data-redline-overlay]') ||
      target.closest('[data-redline-panel]') ||
      target.closest('[data-redline-badges]') ||
      target.closest('[data-redline-ui]')
    ) {
      return; // Let the click through to our UI
    }

    e.preventDefault();
    e.stopPropagation();

    // Save click position for panel positioning
    this.lastClickPosition = { x: e.clientX, y: e.clientY };

    // Lock selection and show info panel
    const element = this.layerNavigator.getCurrentElement();
    if (element) {
      this.selectElement(element);
    }
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.isActive) return;

    // Check if over our panel
    const target = e.target as Element;
    if (target.closest('[data-redline-panel]')) {
      return; // Allow scrolling in panel
    }

    e.preventDefault();
    e.stopPropagation();

    // Throttle navigation based on time
    const now = Date.now();
    if (now - this.lastWheelNavigationTime < this.WHEEL_THROTTLE_MS) {
      return; // Too soon since last navigation, ignore this scroll
    }

    this.lastWheelNavigationTime = now;

    // Navigate layers based on scroll direction
    if (e.deltaY > 0) {
      // Scroll down = go toward parents (deeper in stack)
      this.layerNavigator.navigateUp();
    } else {
      // Scroll up = go toward children (shallower in stack)
      this.layerNavigator.navigateDown();
    }

    // Update highlight
    const element = this.layerNavigator.getCurrentElement();
    if (element) {
      this.currentElement = element;
      this.highlightOverlay.highlight(element);

      // If panel is visible, update it
      if (this.isLocked && this.infoPanel.isVisible()) {
        this.selectElement(element);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    // Check if typing in input
    const target = e.target as Element;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      // Only handle Escape in inputs
      if (e.key === 'Escape') {
        this.handlePanelClose();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if (this.isLocked) {
          // Unlock and go back to hover mode
          this.isLocked = false;
          this.infoPanel.hide();
        } else {
          // Deactivate entirely
          this.deactivate();
        }
        e.preventDefault();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.layerNavigator.navigateUp();
        this.updateCurrentElement();
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.layerNavigator.navigateDown();
        this.updateCurrentElement();
        break;

      case 'Enter':
        e.preventDefault();
        if (!this.isLocked && this.currentElement) {
          this.selectElement(this.currentElement);
        }
        break;
    }
  }

  private handleScroll(): void {
    if (!this.isActive) return;

    // Update badge positions
    this.annotationManager.updateBadgePositions();

    // Update highlight position if element is selected
    if (this.currentElement) {
      this.highlightOverlay.highlight(this.currentElement);
    }
  }

  // --- Selection & Info ---

  private selectElement(element: Element): void {
    this.isLocked = true;
    this.currentElement = element;
    this.highlightOverlay.highlight(element);

    // Build element info
    this.currentElementInfo = this.buildElementInfo(element);

    // Get existing annotation if any
    const existingAnnotation = this.annotationManager.findBySelector(
      this.currentElementInfo.selector
    );

    // Get issues
    const issues = this.styleAnalyzer.identifyIssues(
      element,
      this.currentElementInfo.computedStyles,
      this.currentElementInfo.heightChain
    );

    // Show info panel at click position
    this.infoPanel.show(
      this.currentElementInfo,
      this.layerNavigator.getLayerIndicator(),
      this.layerNavigator.getBreadcrumbPath(),
      issues,
      existingAnnotation || null,
      this.lastClickPosition
    );

    // Update annotation count
    this.infoPanel.updateAnnotationCount(this.annotationManager.count());
  }

  private updateCurrentElement(): void {
    const element = this.layerNavigator.getCurrentElement();
    if (element) {
      this.currentElement = element;
      this.highlightOverlay.highlight(element);

      if (this.isLocked) {
        this.selectElement(element);
      }
    }
  }

  private buildElementInfo(element: Element): ElementInfo {
    const selector = this.selectorGenerator.generate(element);
    const computedStyles = this.styleAnalyzer.extractLayoutStyles(element);
    const heightChain = this.styleAnalyzer.analyzeHeightChain(element);
    const parentContainer = this.styleAnalyzer.getParentContainerInfo(element);
    const reactComponent = this.reactDetector.getComponentInfo(element);

    // Get siblings info
    const parent = element.parentElement;
    const siblings = parent ? Array.from(parent.children) : [];
    const siblingIndex = siblings.indexOf(element);

    // Build ancestor path
    const ancestorPath: AncestorNode[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement && ancestorPath.length < 10) {
      ancestorPath.unshift({
        tagName: current.tagName.toLowerCase(),
        id: current.id || null,
        classes: Array.from(current.classList).slice(0, 2),
        selector: this.getSimpleSelector(current),
      });
      current = current.parentElement;
    }

    return {
      selector,
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      classList: Array.from(element.classList),
      outerHTML: element.outerHTML,
      computedStyles,
      boundingRect: element.getBoundingClientRect(),
      ancestorPath,
      heightChain,
      parentContainer,
      reactComponent,
      siblingCount: siblings.length,
      siblingIndex,
    };
  }

  private getSimpleSelector(element: Element): string {
    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${element.id}`;
    const classes = Array.from(element.classList).slice(0, 2);
    if (classes.length > 0) return `${tag}.${classes.join('.')}`;
    return tag;
  }

  // --- Annotation Handlers ---

  private handleAddAnnotation(feedback: string): void {
    if (!this.currentElementInfo) return;

    this.annotationManager.add(this.currentElementInfo, feedback);
    this.infoPanel.updateAnnotationCount(this.annotationManager.count());

    // Return to hover mode
    this.isLocked = false;
    this.infoPanel.hide();
  }

  private handleUpdateAnnotation(id: string, feedback: string): void {
    this.annotationManager.update(id, feedback);

    // Return to hover mode
    this.isLocked = false;
    this.infoPanel.hide();
  }

  private handleRemoveAnnotation(id: string): void {
    this.annotationManager.remove(id);
    this.infoPanel.updateAnnotationCount(this.annotationManager.count());
  }

  private handleCopyAll(): void {
    const annotations = this.annotationManager.getAll();
    const markdown = this.llmFormatter.formatAnnotations(annotations);

    navigator.clipboard.writeText(markdown).then(() => {
      console.log('[Redline] Copied to clipboard');
      // Could show a toast notification here
    });
  }

  private handleClearAll(): void {
    this.annotationManager.clear();
    this.infoPanel.updateAnnotationCount(0);
    this.isLocked = false;
    this.infoPanel.hide();
  }

  private handlePanelClose(): void {
    this.isLocked = false;
    this.infoPanel.hide();
  }

  private handleBreadcrumbClick(index: number): void {
    // Get the breadcrumb path and find the element at that index
    const path = this.layerNavigator.getBreadcrumbPath();
    if (index >= 0 && index < path.length) {
      // We need to navigate the layer stack to find this ancestor
      const targetSelector = path[index].selector;

      // Try to find this element in the current stack
      const stack = this.layerNavigator.getStack();
      const stackIndex = stack.findIndex((el) => {
        const selector = this.getSimpleSelector(el);
        return selector === targetSelector;
      });

      if (stackIndex >= 0) {
        this.layerNavigator.jumpTo(stackIndex);
        this.updateCurrentElement();
      }
    }
  }

  // --- Public Methods ---

  /**
   * Clear all annotations
   */
  clearAnnotations(): void {
    this.annotationManager.clear();
    this.infoPanel.updateAnnotationCount(0);
  }

  /**
   * Get annotation count
   */
  getAnnotationCount(): number {
    return this.annotationManager.count();
  }
}
