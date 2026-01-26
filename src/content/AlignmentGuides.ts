/**
 * AlignmentGuides - Shows alignment rulers and guides like Figma
 * Renders thin red lines from element edges to help visualize alignment
 * Now supports interactive ruler lines for multi-element selection
 */

import { getTooltipCSS } from './styles';

interface AlignmentMatch {
  element: Element;
  type: 'top' | 'bottom' | 'left' | 'right' | 'centerX' | 'centerY';
  coordinate: number;
  distance: number;
}

export interface RulerLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
  type: 'top' | 'bottom' | 'left' | 'right' | 'centerX' | 'centerY';
  elements: Element[]; // All elements that the line passes through
  lineElement: HTMLElement; // DOM element for the line
}

export interface RulerLineCallbacks {
  onLineClick?: (line: RulerLine, clickPosition: { x: number; y: number }) => void;
  onLineHover?: (line: RulerLine | null) => void;
}

export class AlignmentGuides {
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private highlightBox: HTMLElement;
  private linesContainer: HTMLElement;
  private labelsContainer: HTMLElement;
  private callbacks: RulerLineCallbacks;

  private guideColor = '#e63946';
  private readonly ALIGNMENT_THRESHOLD = 2; // pixels for alignment matching
  private readonly MAX_ELEMENTS = 100;

  private rulerLines: RulerLine[] = [];
  private selectedLine: RulerLine | null = null;
  private hoveredLine: RulerLine | null = null;
  private isShowingElementPreviews = false;
  private isShiftPressed = false;
  private isHybridMode = false;
  private currentElement: Element | null = null; // Store element to re-render on shift toggle
  
  // Bound keyboard handlers
  private boundHandleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundHandleKeyUp: ((e: KeyboardEvent) => void) | null = null;

  constructor(callbacks: RulerLineCallbacks = {}) {
    this.callbacks = callbacks;

    // Create shadow DOM host for style isolation
    this.container = document.createElement('div');
    this.container.setAttribute('data-redline-guides', 'true');
    this.container.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483645 !important;
    `;
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Highlight box around element
    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'highlight-box';

    // Container for lines
    this.linesContainer = document.createElement('div');
    this.linesContainer.className = 'guides-lines';

    // Container for labels
    this.labelsContainer = document.createElement('div');
    this.labelsContainer.className = 'guides-labels';

    this.shadow.appendChild(this.highlightBox);
    this.shadow.appendChild(this.linesContainer);
    this.shadow.appendChild(this.labelsContainer);
  }

  private getStyles(): string {
    return `
      .highlight-box {
        position: fixed;
        pointer-events: none;
        border: 2px solid ${this.guideColor};
        box-sizing: border-box;
        display: none;
        z-index: 3;
      }

      .guides-lines {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
      }

      .guides-labels {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2;
      }

      /* Guide lines with larger hit area using padding */
      .guide-line {
        position: fixed;
        background: ${this.guideColor};
        pointer-events: auto;
        opacity: 0.4;
        cursor: pointer;
        transition: opacity 0.15s;
        box-sizing: content-box;
        background-clip: content-box;
      }

      .guide-line:hover {
        opacity: 0.9;
      }

      .guide-line.hovered {
        opacity: 0.7;
      }

      .guide-line.selected {
        opacity: 1;
      }

      /* In hybrid mode, don't show hover effects by default */
      .guide-line.hybrid-mode {
        cursor: default;
        pointer-events: auto;
      }

      .guide-line.hybrid-mode:hover {
        opacity: 0.9;
        cursor: pointer;
      }

      .guide-line.hybrid-mode.hovered {
        opacity: 0.7;
        cursor: pointer;
      }

      .guide-line.hybrid-mode.hovered:hover {
        opacity: 0.9;
      }

      /* Horizontal lines: 1px tall with 6px padding top/bottom for hit area */
      .guide-line-horizontal {
        height: 1px;
        width: 100vw;
        left: 0;
        padding: 6px 0;
        margin-top: -6px;
      }

      .guide-line-horizontal:hover,
      .guide-line-horizontal.selected {
        height: 2px;
        margin-top: -6px;
      }

      /* Vertical lines: 1px wide with 6px padding left/right for hit area */
      .guide-line-vertical {
        width: 1px;
        height: 100vh;
        top: 0;
        padding: 0 6px;
        margin-left: -6px;
      }

      .guide-line-vertical:hover,
      .guide-line-vertical.selected {
        width: 2px;
        margin-left: -6px;
      }

      .guide-line-center {
        opacity: 0.25;
      }

      .guide-line-center:hover {
        opacity: 0.6;
      }

      .guide-line-center.hovered {
        opacity: 0.6;
      }

      /* In hybrid mode, center lines don't show hover by default */
      .guide-line-center.hybrid-mode:hover {
        opacity: 0.6;
      }

      .guide-line-center.hybrid-mode.hovered {
        opacity: 0.6;
      }

      .guide-line-center.hybrid-mode.hovered:hover {
        opacity: 0.6;
      }

      .guide-marker {
        position: fixed;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${this.guideColor};
        transform: translate(-50%, -50%);
        pointer-events: none;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
      }

      /* Preview highlight (on hover) - dashed border */
      .element-highlight-preview {
        position: fixed;
        border: 2px dashed ${this.guideColor};
        box-sizing: border-box;
        pointer-events: none;
        opacity: 0.4;
        z-index: 4;
        background: rgba(230, 57, 70, 0.05);
      }

      /* Selected highlight (on click) - solid border */
      .element-highlight {
        position: fixed;
        border: 2px solid ${this.guideColor};
        box-sizing: border-box;
        pointer-events: none;
        opacity: 0.6;
        z-index: 4;
        background: rgba(230, 57, 70, 0.1);
      }
    `;
  }

  mount(): void {
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
      console.log('[Redline] Alignment guides mounted');
      
      // Add global keyboard listeners for Shift key detection
      this.boundHandleKeyDown = this.handleKeyDown.bind(this);
      this.boundHandleKeyUp = this.handleKeyUp.bind(this);
      document.addEventListener('keydown', this.boundHandleKeyDown, true);
      document.addEventListener('keyup', this.boundHandleKeyUp, true);
    }
  }

  unmount(): void {
    this.container.remove();
    
    // Remove keyboard listeners
    if (this.boundHandleKeyDown) {
      document.removeEventListener('keydown', this.boundHandleKeyDown, true);
      this.boundHandleKeyDown = null;
    }
    if (this.boundHandleKeyUp) {
      document.removeEventListener('keyup', this.boundHandleKeyUp, true);
      this.boundHandleKeyUp = null;
    }
  }

  showGuides(element: Element): void {
    // Store current element for re-rendering when Shift is toggled
    this.currentElement = element;
    
    // Clear previous guides but preserve selection state if same element
    this.linesContainer.innerHTML = '';
    this.labelsContainer.innerHTML = '';
    this.rulerLines = [];
    this.hoveredLine = null;
    // Don't clear selectedLine here - let it persist

    const rect = element.getBoundingClientRect();

    // Draw highlight box around element
    this.highlightBox.style.top = `${rect.top}px`;
    this.highlightBox.style.left = `${rect.left}px`;
    this.highlightBox.style.width = `${rect.width}px`;
    this.highlightBox.style.height = `${rect.height}px`;
    this.highlightBox.style.display = 'block';
    
    // In hybrid mode, only show rulers if Shift is pressed
    const shouldShowRulers = !this.isHybridMode || this.isShiftPressed;
    
    if (shouldShowRulers) {
      // Find nearby elements and their alignment matches (for distance labels)
      const matches = this.findAlignmentMatches(element, rect);

      // Draw ruler lines from all edges (now interactive with intersection-based selection)
      this.drawRulerLines(rect);

      // Draw alignment matches
      this.drawAlignmentMatches(rect, matches);

      // Draw distance labels
      this.drawDistanceLabels(rect, matches);
    }
  }

  hide(): void {
    this.highlightBox.style.display = 'none';
    this.linesContainer.innerHTML = '';
    this.labelsContainer.innerHTML = '';
    this.rulerLines = [];
    this.selectedLine = null;
    this.hoveredLine = null;
    this.currentElement = null;
  }

  getSelectedLine(): RulerLine | null {
    return this.selectedLine;
  }

  setHybridMode(isHybrid: boolean): void {
    this.isHybridMode = isHybrid;
    
    // Update all existing ruler lines to add/remove hybrid-mode class
    this.rulerLines.forEach(line => {
      if (isHybrid) {
        line.lineElement.classList.add('hybrid-mode');
      } else {
        line.lineElement.classList.remove('hybrid-mode');
      }
    });
  }

  clearSelection(): void {
    if (this.selectedLine) {
      this.selectedLine.lineElement.classList.remove('selected');
      this.selectedLine = null;
    }

    // Remove selected element highlights
    const highlights = this.shadow.querySelectorAll('.element-highlight');
    highlights.forEach((h) => h.remove());
  }

  clearHoverHighlights(): void {
    if (this.hoveredLine) {
      this.hoveredLine.lineElement.classList.remove('hovered');
      this.hoveredLine = null;
    }

    this.clearElementPreviews();
  }

  /**
   * Clear only the element preview highlights, without affecting hover state
   */
  private clearElementPreviews(): void {
    const previews = this.shadow.querySelectorAll('.element-highlight-preview');
    previews.forEach((h) => h.remove());
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Shift' && !this.isShiftPressed) {
      this.isShiftPressed = true;
      
      // In hybrid mode, show rulers when Shift is pressed
      if (this.isHybridMode && this.currentElement) {
        this.showGuides(this.currentElement);
        return;
      }
      
      // In ruler mode, show element previews if hovering over a line
      if (!this.isHybridMode && this.hoveredLine && !this.selectedLine) {
        this.showElementPreviews(this.hoveredLine);
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Shift' && this.isShiftPressed) {
      this.isShiftPressed = false;
      
      // In hybrid mode, hide rulers when Shift is released
      if (this.isHybridMode && this.currentElement) {
        this.showGuides(this.currentElement);
        return;
      }
      
      // In ruler mode, hide element previews
      if (!this.isHybridMode && this.hoveredLine && !this.selectedLine) {
        this.hideElementPreviews();
      }
    }
  }

  private showElementPreviews(line: RulerLine): void {
    if (this.isShowingElementPreviews) return;
    
    // Recalculate elements to ensure current list
    line.elements = this.getElementsIntersectingLine(line.orientation, line.position);
    this.isShowingElementPreviews = true;

    // Show preview highlights for all elements on this line
    line.elements.forEach((el) => {
      this.highlightElementPreview(el);
    });
  }

  private hideElementPreviews(): void {
    if (!this.isShowingElementPreviews) return;
    
    this.clearElementPreviews();
    this.isShowingElementPreviews = false;
  }

  private drawRulerLines(rect: DOMRect): void {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Top edge line - finds ALL elements the line passes through
    this.createInteractiveLine('horizontal', rect.top, 'top');
    
    // Bottom edge line
    this.createInteractiveLine('horizontal', rect.bottom, 'bottom');
    
    // Left edge line
    this.createInteractiveLine('vertical', rect.left, 'left');
    
    // Right edge line
    this.createInteractiveLine('vertical', rect.right, 'right');

    // Center lines
    this.createInteractiveLine('vertical', centerX, 'centerX', 'center');
    this.createInteractiveLine('horizontal', centerY, 'centerY', 'center');
  }

  /**
   * Find ALL elements that a ruler line passes through
   * Uses document.elementsFromPoint for robust hit testing that handles
   * complex CSS layouts, transforms, and stacking contexts
   */
  private getElementsIntersectingLine(
    orientation: 'horizontal' | 'vertical',
    position: number
  ): Element[] {
    const elementsSet = new Set<Element>();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Sample points along the line
    const SAMPLE_INTERVAL = 20; // pixels between sample points
    
    if (orientation === 'horizontal') {
      // Horizontal line at Y=position, sample along X axis
      for (let x = 0; x < viewportWidth; x += SAMPLE_INTERVAL) {
        const elementsAtPoint = document.elementsFromPoint(x, position);
        for (const el of elementsAtPoint) {
          if (this.isValidElement(el)) {
            elementsSet.add(el);
          }
        }
      }
    } else {
      // Vertical line at X=position, sample along Y axis
      for (let y = 0; y < viewportHeight; y += SAMPLE_INTERVAL) {
        const elementsAtPoint = document.elementsFromPoint(position, y);
        for (const el of elementsAtPoint) {
          if (this.isValidElement(el)) {
            elementsSet.add(el);
          }
        }
      }
    }
    
    // Convert to array and filter to get meaningful elements
    // (prefer leaf nodes or elements with actual content)
    const elements = Array.from(elementsSet);
    
    // Sort by depth (deepest first) to prioritize specific elements
    elements.sort((a, b) => {
      const depthA = this.getElementDepth(a);
      const depthB = this.getElementDepth(b);
      return depthB - depthA;
    });
    
    // Limit to reasonable number
    return elements.slice(0, this.MAX_ELEMENTS);
  }
  
  /**
   * Check if an element is valid for selection (not our UI, not utility elements)
   */
  private isValidElement(el: Element): boolean {
    // Skip Redline UI elements
    if (
      el.hasAttribute('data-redline-overlay') ||
      el.hasAttribute('data-redline-panel') ||
      el.hasAttribute('data-redline-guides') ||
      el.hasAttribute('data-redline-ui') ||
      el.hasAttribute('data-redline-badges')
    ) {
      return false;
    }
    
    // Skip document-level elements
    const tagName = el.tagName.toUpperCase();
    if (tagName === 'HTML' || tagName === 'BODY' || tagName === 'SCRIPT' || tagName === 'STYLE') {
      return false;
    }
    
    // Must have size
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Get the depth of an element in the DOM tree
   */
  private getElementDepth(el: Element): number {
    let depth = 0;
    let current: Element | null = el;
    while (current && current !== document.documentElement) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  /**
   * Get all visible elements in viewport (excluding Redline UI)
   */
  private getAllVisibleElements(): Element[] {
    const elements: Element[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const el = node as Element;
          
          // Skip Redline UI elements
          if (
            el.hasAttribute('data-redline-overlay') ||
            el.hasAttribute('data-redline-panel') ||
            el.hasAttribute('data-redline-guides') ||
            el.hasAttribute('data-redline-ui') ||
            el.hasAttribute('data-redline-badges') ||
            el.tagName === 'HTML' ||
            el.tagName === 'BODY' ||
            el.tagName === 'SCRIPT' ||
            el.tagName === 'STYLE'
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if element is in viewport and has size
          const rect = el.getBoundingClientRect();
          const inViewport =
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0;

          if (inViewport && rect.width > 0 && rect.height > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let currentNode = walker.nextNode();
    while (currentNode && elements.length < this.MAX_ELEMENTS) {
      elements.push(currentNode as Element);
      currentNode = walker.nextNode();
    }

    return elements;
  }

  private createInteractiveLine(
    orientation: 'horizontal' | 'vertical',
    position: number,
    type: 'top' | 'bottom' | 'left' | 'right' | 'centerX' | 'centerY',
    styleType: 'edge' | 'center' = 'edge'
  ): HTMLElement {
    const line = document.createElement('div');
    line.className = `guide-line guide-line-${orientation}`;
    
    if (styleType === 'center') {
      line.classList.add('guide-line-center');
    }
    
    if (this.isHybridMode) {
      line.classList.add('hybrid-mode');
    }

    if (orientation === 'horizontal') {
      line.style.top = `${position}px`;
    } else {
      line.style.left = `${position}px`;
    }

    // Get ALL elements that this line passes through
    const elements = this.getElementsIntersectingLine(orientation, position);

    // Store ruler line data
    const rulerLine: RulerLine = {
      orientation,
      position,
      type,
      elements,
      lineElement: line,
    };
    this.rulerLines.push(rulerLine);

    // Add hover handlers for preview (check global Shift state)
    line.addEventListener('mouseenter', () => {
      this.handleLineHover(rulerLine);
    });

    line.addEventListener('mouseleave', () => {
      this.handleLineHover(null);
    });

    // Add click handler - pass click coordinates for prompt positioning
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleLineClick(rulerLine, { x: e.clientX, y: e.clientY });
    });

    this.linesContainer.appendChild(line);
    return line;
  }

  private handleLineHover(line: RulerLine | null): void {
    // Don't show hover preview if a line is already selected
    if (this.selectedLine) return;

    // In hybrid mode, only allow hover effects when Shift is pressed
    if (this.isHybridMode && !this.isShiftPressed) {
      return;
    }

    // Clear previous hover state
    this.clearHoverHighlights();
    this.isShowingElementPreviews = false;

    if (line) {
      this.hoveredLine = line;
      line.lineElement.classList.add('hovered');

      // Show element previews if Shift is currently held (only in ruler mode)
      if (this.isShiftPressed && !this.isHybridMode) {
        this.showElementPreviews(line);
      }
    }

    // Notify callback
    if (this.callbacks.onLineHover) {
      this.callbacks.onLineHover(line);
    }
  }

  private handleLineClick(line: RulerLine, clickPosition: { x: number; y: number }): void {
    // Clear previous selection and hover state
    this.clearSelection();
    this.clearHoverHighlights();

    // Recalculate elements at click time to ensure we have the current list
    // This is important because the elements array might be stale if the page changed
    line.elements = this.getElementsIntersectingLine(line.orientation, line.position);

    // Select this line
    this.selectedLine = line;
    line.lineElement.classList.add('selected');

    // Highlight all elements on this line (solid, not dashed)
    line.elements.forEach((el) => {
      this.highlightElement(el);
    });

    // Notify callback with click position for prompt positioning
    if (this.callbacks.onLineClick) {
      this.callbacks.onLineClick(line, clickPosition);
    }
  }

  private highlightElementPreview(element: Element): void {
    const rect = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'element-highlight-preview';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    this.labelsContainer.appendChild(highlight);
  }

  private highlightElement(element: Element): void {
    const rect = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'element-highlight';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    this.labelsContainer.appendChild(highlight);
  }

  private findAlignmentMatches(element: Element, rect: DOMRect): AlignmentMatch[] {
    const matches: AlignmentMatch[] = [];
    
    // Get all visible elements (reuse getAllVisibleElements)
    const allElements = this.getAllVisibleElements().filter(el => el !== element);
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (const el of allElements) {
      const elRect = el.getBoundingClientRect();
      const elCenterX = elRect.left + elRect.width / 2;
      const elCenterY = elRect.top + elRect.height / 2;

      // Check top edge alignment
      if (Math.abs(rect.top - elRect.top) <= this.ALIGNMENT_THRESHOLD) {
        matches.push({
          element: el,
          type: 'top',
          coordinate: elRect.top,
          distance: Math.abs(rect.left - elRect.left),
        });
      }

      // Check bottom edge alignment
      if (Math.abs(rect.bottom - elRect.bottom) <= this.ALIGNMENT_THRESHOLD) {
        matches.push({
          element: el,
          type: 'bottom',
          coordinate: elRect.bottom,
          distance: Math.abs(rect.left - elRect.left),
        });
      }

      // Check left edge alignment
      if (Math.abs(rect.left - elRect.left) <= this.ALIGNMENT_THRESHOLD) {
        matches.push({
          element: el,
          type: 'left',
          coordinate: elRect.left,
          distance: Math.abs(rect.top - elRect.top),
        });
      }

      // Check right edge alignment
      if (Math.abs(rect.right - elRect.right) <= this.ALIGNMENT_THRESHOLD) {
        matches.push({
          element: el,
          type: 'right',
          coordinate: elRect.right,
          distance: Math.abs(rect.top - elRect.top),
        });
      }

      // Check center X alignment
      if (Math.abs(centerX - elCenterX) <= this.ALIGNMENT_THRESHOLD) {
        matches.push({
          element: el,
          type: 'centerX',
          coordinate: elCenterX,
          distance: Math.abs(rect.top - elRect.top),
        });
      }

      // Check center Y alignment
      if (Math.abs(centerY - elCenterY) <= this.ALIGNMENT_THRESHOLD) {
        matches.push({
          element: el,
          type: 'centerY',
          coordinate: elCenterY,
          distance: Math.abs(rect.left - elRect.left),
        });
      }
    }

    return matches;
  }

  private drawAlignmentMatches(rect: DOMRect, matches: AlignmentMatch[]): void {
    const drawn = new Set<string>();

    for (const match of matches) {
      const matchRect = match.element.getBoundingClientRect();
      let key = '';
      let x = 0;
      let y = 0;

      switch (match.type) {
        case 'top':
          key = `h-${match.coordinate}`;
          x = Math.min(rect.left, matchRect.left);
          y = match.coordinate;
          break;
        case 'bottom':
          key = `h-${match.coordinate}`;
          x = Math.min(rect.left, matchRect.left);
          y = match.coordinate;
          break;
        case 'left':
          key = `v-${match.coordinate}`;
          x = match.coordinate;
          y = Math.min(rect.top, matchRect.top);
          break;
        case 'right':
          key = `v-${match.coordinate}`;
          x = match.coordinate;
          y = Math.min(rect.top, matchRect.top);
          break;
        case 'centerX':
          key = `v-${match.coordinate}`;
          x = match.coordinate;
          y = Math.min(rect.top, matchRect.top);
          break;
        case 'centerY':
          key = `h-${match.coordinate}`;
          x = Math.min(rect.left, matchRect.left);
          y = match.coordinate;
          break;
      }

      // Draw marker at intersection if not already drawn
      if (!drawn.has(key)) {
        this.createMarker(x, y);
        drawn.add(key);
      }
    }
  }

  private createMarker(x: number, y: number): void {
    const marker = document.createElement('div');
    marker.className = 'guide-marker';
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    this.labelsContainer.appendChild(marker);
  }

  private drawDistanceLabels(rect: DOMRect, matches: AlignmentMatch[]): void {
    // Group matches by type to avoid overlapping labels
    const labelsByType = new Map<string, AlignmentMatch>();

    for (const match of matches) {
      // Only show distance for the closest match of each type
      const existing = labelsByType.get(match.type);
      if (!existing || match.distance < existing.distance) {
        labelsByType.set(match.type, match);
      }
    }

    // Draw labels for each type
    for (const [type, match] of labelsByType) {
      if (match.distance < 5) continue; // Skip very close elements
      
      const matchRect = match.element.getBoundingClientRect();
      let x = 0;
      let y = 0;
      const distance = Math.round(match.distance);

      switch (type) {
        case 'top':
        case 'bottom':
          // Show horizontal distance
          x = (rect.left + matchRect.left) / 2;
          y = match.coordinate - 15;
          break;
        case 'left':
        case 'right':
          // Show vertical distance
          x = match.coordinate + 8;
          y = (rect.top + matchRect.top) / 2;
          break;
        case 'centerX':
          x = match.coordinate + 8;
          y = (rect.top + matchRect.top) / 2;
          break;
        case 'centerY':
          x = (rect.left + matchRect.left) / 2;
          y = match.coordinate - 15;
          break;
      }

      this.createLabel(`${distance}px`, x, y);
    }
  }

  private createLabel(text: string, x: number, y: number): void {
    // Create label with unified styling from shared styles
    const label = document.createElement('div');
    label.className = 'guide-label';
    label.textContent = text;
    label.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      ${getTooltipCSS('small')}
    `;
    this.labelsContainer.appendChild(label);
  }
}
