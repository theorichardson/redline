import type { AlignmentContext } from '../shared/types';

/**
 * AlignmentAnalyzer - Analyzes element relationships and suggests alignment strategies
 * Helps LLM understand how to best achieve alignment given DOM structure
 */
export class AlignmentAnalyzer {
  /**
   * Analyze the relationship between multiple elements
   */
  analyzeRelationship(elements: Element[]): {
    shareParent: boolean;
    areSiblings: boolean;
    commonAncestor: Element | null;
    commonAncestorSelector: string | null;
  } {
    if (elements.length === 0) {
      return {
        shareParent: false,
        areSiblings: false,
        commonAncestor: null,
        commonAncestorSelector: null,
      };
    }

    if (elements.length === 1) {
      return {
        shareParent: true,
        areSiblings: false,
        commonAncestor: elements[0].parentElement,
        commonAncestorSelector: this.getSimpleSelector(elements[0].parentElement),
      };
    }

    // Check if all elements share the same parent
    const firstParent = elements[0].parentElement;
    const shareParent = elements.every((el) => el.parentElement === firstParent);

    if (shareParent) {
      return {
        shareParent: true,
        areSiblings: true,
        commonAncestor: firstParent,
        commonAncestorSelector: this.getSimpleSelector(firstParent),
      };
    }

    // Find the closest common ancestor
    const commonAncestor = this.findCommonAncestor(elements);

    return {
      shareParent: false,
      areSiblings: false,
      commonAncestor,
      commonAncestorSelector: this.getSimpleSelector(commonAncestor),
    };
  }

  /**
   * Suggest an alignment strategy based on element relationships and axis
   */
  suggestAlignmentStrategy(
    elements: Element[],
    axis: 'horizontal' | 'vertical'
  ): {
    method: string;
    explanation: string;
    codePattern: string;
  } {
    const relationship = this.analyzeRelationship(elements);

    // If they share a parent, check the parent's display type
    if (relationship.shareParent && relationship.commonAncestor) {
      const parentStyles = window.getComputedStyle(relationship.commonAncestor);
      const display = parentStyles.display;

      if (display.includes('flex')) {
        return this.suggestFlexAlignment(axis, parentStyles);
      } else if (display.includes('grid')) {
        return this.suggestGridAlignment(axis);
      }
    }

    // Elements don't share a parent or parent is block layout
    if (!relationship.shareParent) {
      return this.suggestUnrelatedAlignment(axis, relationship.commonAncestorSelector);
    }

    // Default to margin/padding approach
    return this.suggestMarginAlignment(axis);
  }

  /**
   * Detect how an element is currently positioned/aligned
   */
  getCurrentAlignmentMethod(element: Element): 'flex' | 'grid' | 'absolute' | 'margin' | 'unknown' {
    const styles = window.getComputedStyle(element);
    const position = styles.position;

    if (position === 'absolute' || position === 'fixed') {
      return 'absolute';
    }

    const parent = element.parentElement;
    if (parent) {
      const parentStyles = window.getComputedStyle(parent);
      const parentDisplay = parentStyles.display;

      if (parentDisplay.includes('flex')) {
        return 'flex';
      } else if (parentDisplay.includes('grid')) {
        return 'grid';
      }
    }

    // Check if it has explicit margins
    if (styles.marginTop !== '0px' || styles.marginLeft !== '0px') {
      return 'margin';
    }

    return 'unknown';
  }

  /**
   * Get alignment context for a single element
   */
  getAlignmentContext(element: Element, allElements: Element[]): AlignmentContext {
    const relationship = this.analyzeRelationship(allElements);
    const currentMethod = this.getCurrentAlignmentMethod(element);

    return {
      shareParent: relationship.shareParent,
      commonAncestor: relationship.commonAncestorSelector,
      currentMethod,
    };
  }

  // --- Private Helper Methods ---

  private findCommonAncestor(elements: Element[]): Element | null {
    if (elements.length === 0) return null;
    if (elements.length === 1) return elements[0].parentElement;

    // Get all ancestors for the first element
    const firstAncestors = this.getAncestors(elements[0]);

    // Find the first ancestor that contains all other elements
    for (const ancestor of firstAncestors) {
      if (elements.every((el) => ancestor.contains(el))) {
        return ancestor;
      }
    }

    return document.body;
  }

  private getAncestors(element: Element): Element[] {
    const ancestors: Element[] = [];
    let current = element.parentElement;

    while (current && current !== document.documentElement) {
      ancestors.push(current);
      current = current.parentElement;
    }

    return ancestors;
  }

  private getSimpleSelector(element: Element | null): string | null {
    if (!element) return null;

    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${element.id}`;

    const classes = Array.from(element.classList).slice(0, 2);
    if (classes.length > 0) return `${tag}.${classes.join('.')}`;

    return tag;
  }

  private suggestFlexAlignment(
    axis: 'horizontal' | 'vertical',
    parentStyles: CSSStyleDeclaration
  ): {
    method: string;
    explanation: string;
    codePattern: string;
  } {
    const flexDirection = parentStyles.flexDirection;
    const isMainAxis =
      (axis === 'horizontal' && flexDirection === 'row') ||
      (axis === 'vertical' && flexDirection === 'column');

    if (isMainAxis) {
      return {
        method: 'Flexbox justify-content',
        explanation: `Elements are in a flex container with flex-direction: ${flexDirection}. Use justify-content to align along the main axis.`,
        codePattern: `.parent {\n  display: flex;\n  justify-content: flex-start; /* or center, flex-end, space-between */\n}`,
      };
    } else {
      return {
        method: 'Flexbox align-items',
        explanation: `Elements are in a flex container with flex-direction: ${flexDirection}. Use align-items to align along the cross axis.`,
        codePattern: `.parent {\n  display: flex;\n  align-items: flex-start; /* or center, flex-end, stretch */\n}`,
      };
    }
  }

  private suggestGridAlignment(axis: 'horizontal' | 'vertical'): {
    method: string;
    explanation: string;
    codePattern: string;
  } {
    if (axis === 'horizontal') {
      return {
        method: 'CSS Grid justify-items',
        explanation:
          'Elements are in a grid container. Use justify-items or align-items to control alignment within grid cells.',
        codePattern: `.parent {\n  display: grid;\n  justify-items: start; /* or center, end, stretch */\n}`,
      };
    } else {
      return {
        method: 'CSS Grid align-items',
        explanation:
          'Elements are in a grid container. Use align-items to control vertical alignment within grid cells.',
        codePattern: `.parent {\n  display: grid;\n  align-items: start; /* or center, end, stretch */\n}`,
      };
    }
  }

  private suggestUnrelatedAlignment(
    axis: 'horizontal' | 'vertical',
    commonAncestor: string | null
  ): {
    method: string;
    explanation: string;
    codePattern: string;
  } {
    const cssVar = axis === 'horizontal' ? '--align-x' : '--align-y';

    return {
      method: 'CSS Custom Properties',
      explanation: `Elements don't share a direct parent${commonAncestor ? ` (common ancestor: ${commonAncestor})` : ''}. Use CSS custom properties to maintain consistent alignment values across different containers.`,
      codePattern: `:root {\n  ${cssVar}: 24px; /* distance from reference point */\n}\n\n.element-1 { ${axis === 'horizontal' ? 'margin-left' : 'margin-top'}: var(${cssVar}); }\n.element-2 { ${axis === 'horizontal' ? 'margin-left' : 'margin-top'}: var(${cssVar}); }`,
    };
  }

  private suggestMarginAlignment(axis: 'horizontal' | 'vertical'): {
    method: string;
    explanation: string;
    codePattern: string;
  } {
    const prop = axis === 'horizontal' ? 'margin-left' : 'margin-top';

    return {
      method: 'Consistent margins',
      explanation: `Elements share a parent but it's not using flex or grid. Use consistent ${prop} values to align elements.`,
      codePattern: `.element-1,\n.element-2,\n.element-3 {\n  ${prop}: 16px; /* consistent spacing */\n}`,
    };
  }
}
