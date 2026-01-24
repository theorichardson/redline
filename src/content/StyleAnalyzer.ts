import type { LayoutStyles, HeightChainNode, ParentContainerInfo } from '../shared/types';

/**
 * StyleAnalyzer - Extract layout-relevant computed styles from elements
 * Includes height chain analysis for debugging fill-height issues
 */
export class StyleAnalyzer {
  // Layout properties to extract
  private static readonly LAYOUT_PROPERTIES = [
    'display',
    'position',
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    'boxSizing',
    'margin',
    'padding',
    'overflow',
    'overflowX',
    'overflowY',
    // Flexbox
    'flexDirection',
    'flexWrap',
    'justifyContent',
    'alignItems',
    'alignSelf',
    'flexGrow',
    'flexShrink',
    'flexBasis',
    // Grid
    'gridTemplateColumns',
    'gridTemplateRows',
    'gridColumn',
    'gridRow',
    'gap',
  ] as const;

  /**
   * Extract layout-relevant styles from an element
   */
  extractLayoutStyles(element: Element): LayoutStyles {
    const computed = window.getComputedStyle(element);
    const styles: Partial<LayoutStyles> = {};

    for (const prop of StyleAnalyzer.LAYOUT_PROPERTIES) {
      // Convert camelCase to kebab-case for getPropertyValue
      const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      const value = computed.getPropertyValue(kebabProp);

      // Only include meaningful values
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
        (styles as Record<string, string>)[prop] = value;
      } else if (['display', 'position', 'overflow', 'width', 'height'].includes(prop)) {
        // Always include these core properties
        (styles as Record<string, string>)[prop] = value || 'auto';
      }
    }

    return styles as LayoutStyles;
  }

  /**
   * Analyze the height chain - trace explicit heights up the DOM tree
   * This helps identify why an element isn't filling available space
   */
  analyzeHeightChain(element: Element): HeightChainNode[] {
    const chain: HeightChainNode[] = [];
    let current: Element | null = element;

    while (current && current !== document.documentElement) {
      const computed = window.getComputedStyle(current);
      const height = computed.height;
      const hasExplicitHeight = this.hasExplicitHeight(current, computed);

      chain.push({
        tagName: current.tagName.toLowerCase(),
        selector: this.getSimpleSelector(current),
        height: height,
        hasExplicitHeight,
        overflow: computed.overflow,
        isFlexChild: this.isFlexChild(current),
        isGridChild: this.isGridChild(current),
      });

      current = current.parentElement;
    }

    return chain;
  }

  /**
   * Check if an element has an explicit height set
   * (not auto, not 0px from having no content)
   */
  private hasExplicitHeight(element: Element, computed: CSSStyleDeclaration): boolean {
    const height = computed.height;

    // Check for viewport units or percentage
    if (height.includes('vh') || height.includes('%')) {
      return true;
    }

    // Check for pixel values that aren't just from content
    if (height.endsWith('px')) {
      const px = parseFloat(height);
      // If element has inline style or CSS class setting height, it's explicit
      const inlineHeight = (element as HTMLElement).style?.height;
      if (inlineHeight && inlineHeight !== 'auto') {
        return true;
      }

      // Check if min-height or max-height is constraining
      const minHeight = computed.minHeight;
      const maxHeight = computed.maxHeight;
      if (minHeight !== '0px' && minHeight !== 'auto') {
        return true;
      }
      if (maxHeight !== 'none' && maxHeight !== 'auto') {
        return true;
      }

      // If it's a flex child with flex-grow, it might be filling space
      if (this.isFlexChild(element)) {
        const flexGrow = computed.flexGrow;
        if (flexGrow && parseFloat(flexGrow) > 0) {
          return true;
        }
      }

      // Large fixed heights are likely explicit
      if (px >= 100) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if element is a flex child (parent is flex container)
   */
  private isFlexChild(element: Element): boolean {
    const parent = element.parentElement;
    if (!parent) return false;
    const parentDisplay = window.getComputedStyle(parent).display;
    return parentDisplay === 'flex' || parentDisplay === 'inline-flex';
  }

  /**
   * Check if element is a grid child (parent is grid container)
   */
  private isGridChild(element: Element): boolean {
    const parent = element.parentElement;
    if (!parent) return false;
    const parentDisplay = window.getComputedStyle(parent).display;
    return parentDisplay === 'grid' || parentDisplay === 'inline-grid';
  }

  /**
   * Get parent container info (for flex/grid context)
   */
  getParentContainerInfo(element: Element): ParentContainerInfo | null {
    const parent = element.parentElement;
    if (!parent || parent === document.body) return null;

    const computed = window.getComputedStyle(parent);
    const display = computed.display;

    // Only return info if parent is a layout container
    if (!['flex', 'inline-flex', 'grid', 'inline-grid'].includes(display)) {
      return null;
    }

    const info: ParentContainerInfo = {
      selector: this.getSimpleSelector(parent),
      tagName: parent.tagName.toLowerCase(),
      display,
      overflow: computed.overflow,
      hasExplicitHeight: this.hasExplicitHeight(parent, computed),
    };

    // Add flex-specific properties
    if (display.includes('flex')) {
      info.flexDirection = computed.flexDirection;
      info.alignItems = computed.alignItems;
      info.justifyContent = computed.justifyContent;
    }

    // Add grid-specific properties
    if (display.includes('grid')) {
      info.gridTemplateColumns = computed.gridTemplateColumns;
      info.gridTemplateRows = computed.gridTemplateRows;
    }

    return info;
  }

  /**
   * Identify potential layout issues
   */
  identifyIssues(
    element: Element,
    styles: LayoutStyles,
    heightChain: HeightChainNode[]
  ): string[] {
    const issues: string[] = [];

    // Check for overflow hidden that might clip content
    if (styles.overflow === 'hidden' || styles.overflowY === 'hidden') {
      issues.push('overflow: hidden may clip content');
    }

    // Check for height: auto when parent chain lacks explicit heights
    if (styles.height === 'auto') {
      const hasAncestorWithHeight = heightChain.some((node) => node.hasExplicitHeight);
      if (!hasAncestorWithHeight) {
        issues.push('No ancestor with explicit height - element cannot fill available space');
      }
    }

    // Check for flex child without flex-grow
    if (this.isFlexChild(element)) {
      const computed = window.getComputedStyle(element);
      if (computed.flexGrow === '0') {
        issues.push('Flex child with flex-grow: 0 - will not expand to fill space');
      }
    }

    return issues;
  }

  /**
   * Generate simple selector for display
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
}
