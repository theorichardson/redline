import type { ElementInfo, AncestorNode, AlignmentGroup, AlignedElementInfo } from '../shared/types';
import { HighlightOverlay } from './HighlightOverlay';
import { LayerNavigator } from './LayerNavigator';
import { StyleAnalyzer } from './StyleAnalyzer';
import { SelectorGenerator } from './SelectorGenerator';
import { ReactDetector } from './ReactDetector';
import { AnnotationManager } from './AnnotationManager';
import { InfoPanel } from './InfoPanel';
import { LLMFormatter } from './LLMFormatter';
import { AlignmentGuides, type RulerLine } from './AlignmentGuides';
import { RulerPrompt } from './RulerPrompt';
import { AlignmentAnalyzer } from './AlignmentAnalyzer';

export interface ElementInspectorCallbacks {
  onDeactivate?: () => void;
}

/**
 * ElementInspector - Main controller coordinating all inspection features
 * Manages activation state, event handling, and component coordination
 */
export class ElementInspector {
  private isActive = false;
  private isRulerMode = false; // When true, show alignment guides instead of details
  private isHybridMode = false; // When true, show both alignment guides AND details
  private isLocked = false; // When true, don't follow mouse (element selected)
  private callbacks: ElementInspectorCallbacks;

  // Components
  private highlightOverlay: HighlightOverlay;
  private alignmentGuides: AlignmentGuides;
  private rulerPrompt: RulerPrompt;
  private alignmentAnalyzer: AlignmentAnalyzer;
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
  private selectedRulerLine: RulerLine | null = null;

  // Bound event handlers (for removal)
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleClick: (e: MouseEvent) => void;
  private boundHandleWheel: (e: WheelEvent) => void;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleKeyUp: (e: KeyboardEvent) => void;
  private boundHandleScroll: () => void;

  // Scroll position-based navigation
  private accumulatedWheelDelta = 0;
  private readonly WHEEL_THRESHOLD = 50; // Pixels of scroll needed to trigger navigation
  private hasShownBoundsShake = false; // Prevents repeated shake at bounds
  private boundsShakeResetTimeout: ReturnType<typeof setTimeout> | null = null;

  // Shift key state for temporarily showing rulers in redline mode
  private isShiftHeld = false;

  /** Tracks Alt (Option) so tooltip typography updates on keyup without mouse motion */
  private lastAltKeyForTooltip = false;

  // Track if CMD/Ctrl freeze visual is currently shown (for cleanup)
  private isFreezeVisualShown = false;

  constructor(callbacks: ElementInspectorCallbacks = {}) {
    this.callbacks = callbacks;

    // Initialize components
    this.highlightOverlay = new HighlightOverlay();
    this.alignmentAnalyzer = new AlignmentAnalyzer();
    this.layerNavigator = new LayerNavigator();
    this.styleAnalyzer = new StyleAnalyzer();
    this.selectorGenerator = new SelectorGenerator();
    this.reactDetector = new ReactDetector();
    this.annotationManager = new AnnotationManager();
    this.llmFormatter = new LLMFormatter();

    // Initialize alignment guides with line click and hover callbacks
    this.alignmentGuides = new AlignmentGuides({
      onLineClick: (line, clickPos) => this.handleRulerLineClick(line, clickPos),
      onLineHover: (line) => this.handleRulerLineHover(line),
    });

    // Initialize ruler prompt
    this.rulerPrompt = new RulerPrompt({
      onSubmit: (prompt) => this.handleRulerPromptSubmit(prompt),
      onCancel: () => this.handleRulerPromptCancel(),
    });

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
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);
  }

  /**
   * Activate inspection mode
   */
  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.isLocked = false;

    // Mount UI components based on mode
    if (this.isRulerMode) {
      // Ruler mode: only show alignment guides
      this.alignmentGuides.mount();
      this.rulerPrompt.mount();
    } else if (this.isHybridMode) {
      // Hybrid mode: show both alignment guides AND details panel
      this.highlightOverlay.mount();
      this.infoPanel.mount();
      this.alignmentGuides.mount();
      this.rulerPrompt.mount();
    } else {
      // Normal redline mode: only show details panel
      this.highlightOverlay.mount();
      this.infoPanel.mount();
    }
    this.annotationManager.mount();

    // Add event listeners
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('click', this.boundHandleClick, true);
    document.addEventListener('wheel', this.boundHandleWheel, { passive: false, capture: true });
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
    window.addEventListener('scroll', this.boundHandleScroll, true);

    // Set cursor
    document.body.style.cursor = 'crosshair';
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
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);

    // Hide UI (including tooltips)
    this.highlightOverlay.hide();
    this.alignmentGuides.hide();
    this.infoPanel.hide();
    this.rulerPrompt.hide();

    // Unmount (but keep annotation badges visible)
    this.highlightOverlay.unmount();
    this.alignmentGuides.unmount();
    this.infoPanel.unmount();
    this.rulerPrompt.unmount();

    // Reset cursor
    document.body.style.cursor = '';

    // Reset state
    this.currentElement = null;
    this.currentElementInfo = null;
    this.selectedRulerLine = null;
    this.isShiftHeld = false;
    this.lastAltKeyForTooltip = false;
    this.isFreezeVisualShown = false;
    this.layerNavigator.reset();
    this.accumulatedWheelDelta = 0;
    this.hasShownBoundsShake = false;
    if (this.boundsShakeResetTimeout) {
      clearTimeout(this.boundsShakeResetTimeout);
      this.boundsShakeResetTimeout = null;
    }

    // Notify listeners
    this.callbacks.onDeactivate?.();
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

  /**
   * Activate ruler mode
   */
  activateRulerMode(): void {
    if (this.isRulerMode) return;

    this.isRulerMode = true;

    // If inspector is active, switch to ruler display
    if (this.isActive) {
      this.highlightOverlay.hide();
      this.highlightOverlay.unmount();
      this.infoPanel.hide();
      this.infoPanel.unmount();
      this.alignmentGuides.mount();
      this.rulerPrompt.mount();

      // Re-highlight current element with ruler mode
      if (this.currentElement) {
        this.alignmentGuides.showGuides(this.currentElement);
      }
    }

  }

  /**
   * Deactivate ruler mode
   */
  deactivateRulerMode(): void {
    if (!this.isRulerMode) return;

    this.isRulerMode = false;

    // If inspector is active, switch back to normal display
    if (this.isActive) {
      this.alignmentGuides.hide();
      this.alignmentGuides.unmount();
      this.rulerPrompt.hide();
      this.rulerPrompt.unmount();
      this.highlightOverlay.mount();
      this.infoPanel.mount();

      // Re-highlight current element with normal mode
      if (this.currentElement) {
        this.applyHighlight(this.currentElement);
      }
    } else {
      this.alignmentGuides.hide();
      this.alignmentGuides.unmount();
      this.rulerPrompt.hide();
      this.rulerPrompt.unmount();
    }

    // Clear selection state
    this.selectedRulerLine = null;

  }

  /**
   * Toggle ruler mode
   */
  toggleRulerMode(): void {
    if (this.isRulerMode) {
      this.deactivateRulerMode();
    } else {
      this.activateRulerMode();
    }
  }

  /**
   * Check if ruler mode is active
   */
  getIsRulerMode(): boolean {
    return this.isRulerMode;
  }

  /**
   * Activate hybrid mode (combination of redline and ruler)
   */
  activateHybridMode(): void {
    if (this.isHybridMode) return;

    this.isHybridMode = true;
    this.isRulerMode = false; // Ensure ruler mode is off

    // Set hybrid mode on alignment guides
    this.alignmentGuides.setHybridMode(true);

    // If inspector is active, switch to hybrid display
    if (this.isActive) {
      // Mount both components
      this.highlightOverlay.mount();
      this.infoPanel.mount();
      this.alignmentGuides.mount();
      this.rulerPrompt.mount();

      // Show both overlays for current element
      if (this.currentElement) {
        this.syncHighlightForElement(this.currentElement);
      }
    }

  }

  /**
   * Deactivate hybrid mode
   */
  deactivateHybridMode(): void {
    if (!this.isHybridMode) return;

    this.isHybridMode = false;

    // Set hybrid mode off on alignment guides
    this.alignmentGuides.setHybridMode(false);

    // Hide and unmount alignment guides (keep redline components)
    this.alignmentGuides.hide();
    this.alignmentGuides.unmount();
    this.rulerPrompt.hide();
    this.rulerPrompt.unmount();

    // Clear selection state
    this.selectedRulerLine = null;

  }

  /**
   * Check if hybrid mode is active
   */
  getIsHybridMode(): boolean {
    return this.isHybridMode;
  }

  private applyHighlight(element: Element): void {
    const show = this.lastAltKeyForTooltip;
    this.highlightOverlay.highlight(element, {
      showTypographyInTooltip: show,
      typography: show ? this.styleAnalyzer.extractTypographyStyles(element) : null,
    });
  }

  /** Highlight and alignment guides according to ruler / hybrid / Shift state */
  private syncHighlightForElement(element: Element): void {
    if (this.isRulerMode) {
      this.alignmentGuides.showGuides(element);
      return;
    }
    const showRulersTemporarily = !this.isHybridMode && this.isShiftHeld;
    if (this.isHybridMode) {
      this.alignmentGuides.showGuides(element);
      this.applyHighlight(element);
    } else if (showRulersTemporarily) {
      this.alignmentGuides.showGuides(element);
      this.applyHighlight(element);
    } else {
      this.applyHighlight(element);
    }
  }

  // --- Event Handlers ---

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isActive || this.isLocked) return;

    const altNow = e.altKey;
    const altToggled = altNow !== this.lastAltKeyForTooltip;
    this.lastAltKeyForTooltip = altNow;

    // Check if we're interacting with ruler UI (in any mode that shows rulers)
    const showingRulers = this.isRulerMode || this.isHybridMode || this.isShiftHeld;
    if (showingRulers) {
      const target = e.target as Element;
      
      // Don't update element if hovering over ruler lines or prompt
      // This prevents flickering when moving mouse toward ruler lines
      if (
        target.closest('[data-redline-guides]') ||
        target.closest('[data-redline-ui]')
      ) {
        return;
      }
      
      // Don't update while a line is selected (prompt is open)
      if (this.selectedRulerLine) {
        return;
      }
    }
    
    // Check CMD/Ctrl state for freeze behavior (check actual key state, not a flag)
    const isCmdHeld = e.metaKey || e.ctrlKey;
    
    // Update freeze visual based on actual key state
    if (isCmdHeld && !this.isFreezeVisualShown && this.currentElement) {
      this.isFreezeVisualShown = true;
      this.highlightOverlay.setFrozen(true);
    } else if (!isCmdHeld && this.isFreezeVisualShown) {
      this.isFreezeVisualShown = false;
      this.highlightOverlay.setFrozen(false);
    }
    
    // If CMD is held (element freeze), keep current element
    // This allows user to keep an element selected while moving the mouse
    if (isCmdHeld) {
      if (this.currentElement && altToggled) {
        this.syncHighlightForElement(this.currentElement);
      }
      return;
    }

    // Update layer navigator
    this.layerNavigator.updateAtPoint(e.clientX, e.clientY);

    const element = this.layerNavigator.getCurrentElement();
    const elementChanged = element !== null && element !== this.currentElement;

    if (elementChanged && element) {
      this.currentElement = element;
      this.accumulatedWheelDelta = 0;
      this.hasShownBoundsShake = false;
    }

    if (!element) {
      return;
    }

    if (elementChanged || altToggled) {
      this.syncHighlightForElement(element);
    }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isActive) return;

    // Check if click is on our UI (let it through)
    const target = e.target as Element;
    if (
      target.closest('[data-redline-overlay]') ||
      target.closest('[data-redline-panel]') ||
      target.closest('[data-redline-badges]') ||
      target.closest('[data-redline-ui]') ||
      target.closest('[data-redline-guides]')
    ) {
      return; // Let the click through to our UI (including ruler lines)
    }

    e.preventDefault();
    e.stopPropagation();

    // In ruler mode, clicking outside the guides clears selection
    if (this.isRulerMode) {
      if (this.selectedRulerLine) {
        this.rulerPrompt.hide();
        this.alignmentGuides.clearSelection();
        this.selectedRulerLine = null;
      }
      return;
    }

    // In hybrid mode, allow element selection while still showing ruler guides
    if (this.isHybridMode) {
      if (this.selectedRulerLine) {
        this.rulerPrompt.hide();
        this.alignmentGuides.clearSelection();
        this.selectedRulerLine = null;
      }
      // Continue to element selection below
    }

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

    // Accumulate scroll delta
    this.accumulatedWheelDelta += e.deltaY;

    // Check if we've scrolled enough to trigger navigation
    if (Math.abs(this.accumulatedWheelDelta) < this.WHEEL_THRESHOLD) {
      return; // Not enough scroll yet
    }

    // Determine direction and check if we can navigate
    const direction = this.accumulatedWheelDelta > 0 ? 1 : -1;
    const canNavigate =
      direction > 0 ? this.layerNavigator.canNavigateUp() : this.layerNavigator.canNavigateDown();

    if (!canNavigate) {
      // At bounds - shake once to indicate can't go further
      if (!this.hasShownBoundsShake) {
        this.highlightOverlay.shake();
        this.hasShownBoundsShake = true;
      }
      // Reset accumulator but keep the flag set
      this.accumulatedWheelDelta = 0;

      // Allow re-triggering after a pause (new scroll gesture)
      if (this.boundsShakeResetTimeout) {
        clearTimeout(this.boundsShakeResetTimeout);
      }
      this.boundsShakeResetTimeout = setTimeout(() => {
        this.hasShownBoundsShake = false;
        this.boundsShakeResetTimeout = null;
      }, 150);

      return;
    }

    // Successfully navigating - clear the bounds shake state
    this.hasShownBoundsShake = false;
    if (this.boundsShakeResetTimeout) {
      clearTimeout(this.boundsShakeResetTimeout);
      this.boundsShakeResetTimeout = null;
    }

    if (direction > 0) {
      // Scroll down = go toward parents (deeper in stack)
      this.layerNavigator.navigateUp();
    } else {
      // Scroll up = go toward children (shallower in stack)
      this.layerNavigator.navigateDown();
    }

    // Subtract threshold (preserves momentum for fast scrolling)
    this.accumulatedWheelDelta -= direction * this.WHEEL_THRESHOLD;

    // Update highlight
    const element = this.layerNavigator.getCurrentElement();
    if (element) {
      this.currentElement = element;

      // Show guides or highlight based on mode
      if (this.isRulerMode) {
        this.alignmentGuides.showGuides(element);
      } else {
        this.syncHighlightForElement(element);
      }

      // If panel is visible, update it
      if (this.isLocked && this.infoPanel.isVisible() && !this.isRulerMode) {
        this.selectElement(element);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    // Check if typing in input (check both direct target and composed path for Shadow DOM)
    const target = e.target as Element;
    const composedPath = e.composedPath();
    const actualTarget = composedPath[0] as Element;
    
    const isTypingInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        actualTarget.tagName === 'INPUT' || actualTarget.tagName === 'TEXTAREA';
    
    if (isTypingInInput) {
      // Only handle Escape in inputs
      if (e.key === 'Escape') {
        this.handlePanelClose();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        // In ruler or hybrid mode, Escape cancels selection first
        if ((this.isRulerMode || this.isHybridMode) && this.selectedRulerLine) {
          this.rulerPrompt.hide();
          this.alignmentGuides.clearSelection();
          this.alignmentGuides.hide();
          this.highlightOverlay.hide();
          this.selectedRulerLine = null;
          e.preventDefault();
          return;
        }

        if (this.isLocked) {
          // Unlock and go back to hover mode
          this.isLocked = false;
          this.infoPanel.hide();
          this.highlightOverlay.hide();
          this.alignmentGuides.hide();
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

      case 'Shift':
        // In redline mode (not ruler or hybrid), Shift temporarily shows rulers
        if (!this.isRulerMode && !this.isHybridMode && this.isActive && !this.isShiftHeld) {
          e.preventDefault();
          this.isShiftHeld = true;
          // Mount alignment guides once to show rulers
          this.alignmentGuides.mount();
          if (this.currentElement) {
            this.alignmentGuides.showGuides(this.currentElement);
          }
        }
        break;

      case 'Alt':
        if (!e.repeat && this.currentElement) {
          this.lastAltKeyForTooltip = true;
          this.syncHighlightForElement(this.currentElement);
        }
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.isActive) return;

    // Check if typing in input (check both direct target and composed path for Shadow DOM)
    const target = e.target as Element;
    const composedPath = e.composedPath();
    const actualTarget = composedPath[0] as Element;
    
    const isTypingInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        actualTarget.tagName === 'INPUT' || actualTarget.tagName === 'TEXTAREA';
    
    if (isTypingInInput) {
      return;
    }

    if (e.key === 'Shift') {
      // In redline mode, releasing Shift hides the temporarily shown rulers
      if (this.isShiftHeld) {
        this.isShiftHeld = false;
        this.alignmentGuides.hide();
        this.alignmentGuides.unmount();
      }
    }

    if (e.key === 'Alt') {
      this.lastAltKeyForTooltip = false;
      if (this.currentElement) {
        this.syncHighlightForElement(this.currentElement);
      }
    }
    // Note: CMD/Ctrl freeze is handled in handleMouseMove based on actual key state
  }

  private handleScroll(): void {
    if (!this.isActive) return;

    // Update badge positions
    this.annotationManager.updateBadgePositions();

    // Update highlight position if element is selected
    if (this.currentElement) {
      if (this.isRulerMode) {
        this.alignmentGuides.showGuides(this.currentElement);
      } else {
        this.syncHighlightForElement(this.currentElement);
      }
    }
  }

  // --- Selection & Info ---

  private selectElement(element: Element): void {
    this.isLocked = true;
    this.currentElement = element;
    
    this.syncHighlightForElement(element);

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

      // Show guides or highlight based on mode
      if (this.isRulerMode) {
        this.alignmentGuides.showGuides(element);
      } else {
        this.syncHighlightForElement(element);
      }

      if (this.isLocked && !this.isRulerMode) {
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
      typography: this.styleAnalyzer.extractTypographyStyles(element),
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
    let markdown: string;

    if (annotations.length === 0 && this.currentElementInfo) {
      // If no annotations but element is selected, copy element info
      markdown = this.llmFormatter.formatElementInfo(this.currentElementInfo);
    } else {
      // Otherwise format annotations (which handles empty case)
      markdown = this.llmFormatter.formatAnnotations(annotations);
    }

    navigator.clipboard.writeText(markdown);
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

  // --- Ruler Mode Handlers ---

  private handleRulerLineClick(line: RulerLine, clickPosition: { x: number; y: number }): void {
    this.selectedRulerLine = line;

    // Show the prompt near where the user clicked
    const alignmentTypeLabel = this.formatAlignmentTypeLabel(line.type);

    this.rulerPrompt.show(
      clickPosition,
      line.orientation,
      line.elements.length,
      alignmentTypeLabel
    );

  }

  private handleRulerLineHover(_line: RulerLine | null): void {
    // This is called when hovering over ruler lines to show preview
    // The actual highlighting is done in AlignmentGuides
  }

  private handleRulerPromptSubmit(prompt: string): void {
    if (!this.selectedRulerLine) return;

    // Build alignment group
    const alignmentGroup = this.buildAlignmentGroup(this.selectedRulerLine, prompt);

    // Format for LLM
    const markdown = this.llmFormatter.formatAlignmentGroup(alignmentGroup);

    // Copy to clipboard
    navigator.clipboard.writeText(markdown);

    // Hide prompt and clear selection
    this.rulerPrompt.hide();
    this.alignmentGuides.clearSelection();
    this.selectedRulerLine = null;
  }

  private handleRulerPromptCancel(): void {
    this.rulerPrompt.hide();
    if (this.selectedRulerLine) {
      this.alignmentGuides.clearSelection();
      this.selectedRulerLine = null;
    }
  }

  private formatAlignmentTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      top: 'top edge',
      bottom: 'bottom edge',
      left: 'left edge',
      right: 'right edge',
      centerX: 'horizontal center',
      centerY: 'vertical center',
    };
    return labels[type] || type;
  }

  private buildAlignmentGroup(line: RulerLine, prompt: string): AlignmentGroup {
    const axis = line.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const elements: AlignedElementInfo[] = [];

    for (const element of line.elements) {
      const elementInfo = this.buildElementInfo(element);
      const rect = element.getBoundingClientRect();

      // Calculate offset from line
      let offset: number;
      if (axis === 'horizontal') {
        switch (line.type) {
          case 'top':
            offset = rect.top - line.position;
            break;
          case 'bottom':
            offset = rect.bottom - line.position;
            break;
          case 'centerY':
            offset = rect.top + rect.height / 2 - line.position;
            break;
          default:
            offset = 0;
        }
      } else {
        switch (line.type) {
          case 'left':
            offset = rect.left - line.position;
            break;
          case 'right':
            offset = rect.right - line.position;
            break;
          case 'centerX':
            offset = rect.left + rect.width / 2 - line.position;
            break;
          default:
            offset = 0;
        }
      }

      // Get alignment context
      const alignmentContext = this.alignmentAnalyzer.getAlignmentContext(
        element,
        line.elements
      );

      elements.push({
        ...elementInfo,
        offsetFromLine: offset,
        alignmentContext,
      });
    }

    return {
      axis,
      position: line.position,
      alignmentType: line.type,
      elements,
      prompt,
    };
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
