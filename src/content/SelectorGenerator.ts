/**
 * SelectorGenerator - Generate unique, greppable CSS selectors
 * Produces selectors that can be used to find elements in code
 */
export class SelectorGenerator {
  // Utility class patterns to filter out (Tailwind, Bootstrap, etc.)
  private static readonly UTILITY_PATTERNS = [
    /^p[xytblr]?-/, // padding
    /^m[xytblr]?-/, // margin
    /^w-/, // width
    /^h-/, // height
    /^min-/, // min-width/height
    /^max-/, // max-width/height
    /^flex-?/, // flex utilities
    /^grid-?/, // grid utilities
    /^text-/, // text utilities
    /^bg-/, // background
    /^border-?/, // border
    /^rounded-?/, // border-radius
    /^shadow-?/, // box-shadow
    /^opacity-/, // opacity
    /^z-/, // z-index
    /^gap-/, // gap
    /^space-/, // space
    /^items-/, // align-items
    /^justify-/, // justify-content
    /^self-/, // align-self
    /^col-/, // Bootstrap columns
    /^row-?/, // Bootstrap rows
    /^d-/, // Bootstrap display
    /^overflow-/, // overflow
    /^cursor-/, // cursor
    /^transition-?/, // transitions
    /^duration-/, // animation duration
    /^ease-/, // easing
    /^animate-/, // animations
    /^sr-only/, // screen reader only
    /^hidden$/, // hidden
    /^block$/, // display block
    /^inline/, // inline display
    /^relative$/, // position
    /^absolute$/, // position
    /^fixed$/, // position
    /^sticky$/, // position
  ];

  /**
   * Generate a unique CSS selector for an element
   */
  generate(element: Element): string {
    // Priority 1: ID (if unique on page)
    if (element.id) {
      const escapedId = CSS.escape(element.id);
      const byId = document.querySelectorAll(`#${escapedId}`);
      if (byId.length === 1) {
        return `#${escapedId}`;
      }
    }

    // Priority 2: Build path with significant classes
    return this.buildPath(element);
  }

  /**
   * Build a selector path from element to a unique ancestor
   */
  private buildPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;
    let iterations = 0;
    const maxIterations = 10;

    while (current && current !== document.documentElement && iterations < maxIterations) {
      const segment = this.getSegment(current);
      path.unshift(segment);

      // Check if current path is unique
      const selector = path.join(' > ');
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch {
        // Invalid selector, continue building
      }

      current = current.parentElement;
      iterations++;
    }

    // If we couldn't find a unique path, add nth-of-type
    return this.addNthOfType(element, path);
  }

  /**
   * Get a selector segment for a single element
   */
  private getSegment(element: Element): string {
    const tag = element.tagName.toLowerCase();

    // Try with ID first
    if (element.id) {
      return `${tag}#${CSS.escape(element.id)}`;
    }

    // Get significant classes (non-utility)
    const significantClasses = this.getSignificantClasses(element);

    if (significantClasses.length > 0) {
      // Use up to 2 classes
      const classSelector = significantClasses.slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      return `${tag}${classSelector}`;
    }

    // Check for data attributes that might be useful
    const dataTestId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
    if (dataTestId) {
      return `${tag}[data-testid="${CSS.escape(dataTestId)}"]`;
    }

    // Just tag name
    return tag;
  }

  /**
   * Filter out utility classes, return semantic/component classes
   */
  private getSignificantClasses(element: Element): string[] {
    return Array.from(element.classList).filter((className) => {
      // Skip empty or very short classes
      if (!className || className.length < 2) return false;

      // Skip utility class patterns
      return !SelectorGenerator.UTILITY_PATTERNS.some((pattern) => pattern.test(className));
    });
  }

  /**
   * Add nth-of-type to make selector unique
   */
  private addNthOfType(element: Element, path: string[]): string {
    // Work backwards from the element, adding nth-of-type as needed
    const newPath: string[] = [];
    let current: Element | null = element;

    for (let i = path.length - 1; i >= 0 && current; i--) {
      let segment = path[i];

      // Check siblings of same type
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const sameType = siblings.filter((s) => s.tagName === current!.tagName);

        if (sameType.length > 1) {
          const index = sameType.indexOf(current) + 1;
          // Only add if not already unique by class
          const testSelector = [...newPath, segment].reverse().join(' > ');
          try {
            if (document.querySelectorAll(testSelector).length > 1) {
              segment += `:nth-of-type(${index})`;
            }
          } catch {
            segment += `:nth-of-type(${index})`;
          }
        }
      }

      newPath.unshift(segment);
      current = current.parentElement;
    }

    return newPath.join(' > ');
  }

  /**
   * Generate a grep-friendly search pattern
   * Returns patterns that can be used to find the element in source code
   */
  generateGrepPatterns(element: Element): string[] {
    const patterns: string[] = [];

    // ID
    if (element.id) {
      patterns.push(`id="${element.id}"`);
      patterns.push(`#${element.id}`);
    }

    // Significant classes
    const classes = this.getSignificantClasses(element);
    for (const cls of classes.slice(0, 3)) {
      patterns.push(`class="[^"]*${cls}[^"]*"`);
      patterns.push(`.${cls}`);
    }

    // data-testid
    const testId = element.getAttribute('data-testid');
    if (testId) {
      patterns.push(`data-testid="${testId}"`);
    }

    // Component-like class names (PascalCase or kebab-case with component-like patterns)
    const componentClasses = classes.filter(
      (c) => /^[A-Z]/.test(c) || /-(component|container|wrapper|section|card|item|list)$/.test(c)
    );
    for (const cls of componentClasses) {
      patterns.push(cls);
    }

    return patterns;
  }
}
