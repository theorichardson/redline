import type { Annotation, ElementInfo, AlignmentGroup, AlignedElementInfo } from '../shared/types';
import { AlignmentAnalyzer } from './AlignmentAnalyzer';

/**
 * LLMFormatter - Format annotations and element info for LLM consumption
 * Outputs structured markdown optimized for coding agents
 */
export class LLMFormatter {
  private alignmentAnalyzer: AlignmentAnalyzer;

  constructor() {
    this.alignmentAnalyzer = new AlignmentAnalyzer();
  }

  /**
   * Format alignment group for LLM consumption
   */
  formatAlignmentGroup(group: AlignmentGroup): string {
    const lines: string[] = [
      '# Alignment Task',
      '',
      `> Page: ${window.location.href}`,
      '',
    ];

    // User prompt
    if (group.prompt) {
      lines.push(`## Prompt: ${group.prompt}`);
      lines.push('');
    }

    // Axis and position info
    const axisLabel = group.axis === 'horizontal' ? 'Horizontal' : 'Vertical';
    const posLabel = group.axis === 'horizontal' ? 'Y' : 'X';
    const alignTypeLabel = this.formatAlignmentType(group.alignmentType);

    lines.push(`**Axis:** ${axisLabel} line at ${posLabel}=${Math.round(group.position)}px (${alignTypeLabel})`);
    lines.push(`**Elements to align:** ${group.elements.length} element${group.elements.length > 1 ? 's' : ''}`);
    lines.push('');

    // Individual elements
    group.elements.forEach((element, index) => {
      lines.push(...this.formatAlignedElement(element, index + 1, group.axis, group.position));
      lines.push('');
    });

    lines.push('---');
    lines.push('');

    // Analyze relationships and suggest strategy
    const elements = group.elements.map((e) => {
      try {
        return document.querySelector(e.selector);
      } catch {
        return null;
      }
    }).filter((e): e is Element => e !== null);

    if (elements.length > 0) {
      const relationship = this.alignmentAnalyzer.analyzeRelationship(elements);
      const strategy = this.alignmentAnalyzer.suggestAlignmentStrategy(
        elements,
        group.axis
      );

      lines.push('## Alignment Strategy');
      lines.push('');

      // Relationship info
      if (relationship.areSiblings) {
        lines.push(`**Relationship:** Elements are siblings in \`${relationship.commonAncestorSelector}\``);
      } else if (relationship.shareParent) {
        lines.push(`**Relationship:** Elements share parent \`${relationship.commonAncestorSelector}\``);
      } else {
        lines.push('**Relationship:** Elements do NOT share a common parent');
        if (relationship.commonAncestorSelector) {
          lines.push(`- Common ancestor: \`${relationship.commonAncestorSelector}\``);
        }
      }
      lines.push('');

      // Strategy recommendation
      lines.push(`**Recommended approach:** ${strategy.explanation}`);
      lines.push('');

      // Concrete suggestions
      lines.push('**Suggested implementation:**');
      lines.push('');
      lines.push('```css');
      lines.push(strategy.codePattern);
      lines.push('```');
      lines.push('');

      // Additional considerations
      lines.push('**Important considerations:**');
      if (relationship.areSiblings) {
        lines.push('- Elements share a parent, so container-level alignment properties will affect all siblings');
        lines.push('- Consider using flexbox or grid for robust, responsive alignment');
      } else {
        lines.push('- Elements are in different containers, requiring coordination across parent boundaries');
        lines.push('- Consider using CSS custom properties (variables) for maintainable alignment values');
        lines.push('- Test alignment at different viewport sizes if responsive design is important');
      }
      lines.push('');

      // Offset warnings
      const misalignedElements = group.elements.filter((e) => Math.abs(e.offsetFromLine) > 2);
      if (misalignedElements.length > 0) {
        lines.push('**Elements currently off alignment:**');
        misalignedElements.forEach((el) => {
          const offset = Math.abs(Math.round(el.offsetFromLine));
          const direction = el.offsetFromLine > 0 ? 'below' : 'above';
          lines.push(`- \`${el.selector}\`: ${offset}px ${direction} target line`);
        });
        lines.push('');
      }
    }

    // Best practices
    lines.push('## Best Practices for Clean Code');
    lines.push('');
    lines.push('1. **Avoid magic numbers:** Use variables or design tokens instead of hardcoded pixel values');
    lines.push('2. **Prefer modern layout:** Flexbox and Grid are more maintainable than absolute positioning');
    lines.push('3. **Consider responsiveness:** Alignment that works at one viewport may break at others');
    lines.push('4. **Use semantic structure:** Proper HTML hierarchy makes alignment easier to achieve and maintain');
    lines.push('5. **Test thoroughly:** Verify alignment with different content lengths and states');

    return lines.join('\n');
  }
  /**
   * Format a single element info (without annotation)
   */
  formatElementInfo(elementInfo: ElementInfo): string {
    const lines: string[] = [
      '# Element Information',
      '',
      `> Element inspected on ${window.location.href}`,
      '',
      `**Selector:** \`${elementInfo.selector}\``,
      '',
      `**Element:** \`${this.getTagPreview(elementInfo)}\``,
      '',
      '### Layout',
      '```css',
      this.formatLayoutStyles(elementInfo),
      '```',
      '',
    ];

    // Parent container (if relevant)
    if (elementInfo.parentContainer) {
      const pc = elementInfo.parentContainer;
      lines.push(`**Parent:** \`${pc.selector}\` (${pc.display})`);

      const parentStyles: string[] = [];
      if (pc.flexDirection) parentStyles.push(`flex-direction: ${pc.flexDirection}`);
      if (pc.alignItems) parentStyles.push(`align-items: ${pc.alignItems}`);
      if (pc.justifyContent) parentStyles.push(`justify-content: ${pc.justifyContent}`);
      if (pc.gridTemplateColumns) parentStyles.push(`grid-template-columns: ${pc.gridTemplateColumns}`);

      if (parentStyles.length > 0) {
        lines.push(`- ${parentStyles.join('; ')}`);
      }
      lines.push('');
    }

    // Height chain
    lines.push('### Height Chain');
    lines.push(this.formatHeightChain(elementInfo));
    lines.push('');

    // React component (if detected)
    if (elementInfo.reactComponent) {
      const rc = elementInfo.reactComponent;
      lines.push('### React Component');
      lines.push(`- **Component:** ${rc.componentName}`);
      if (rc.fileName) {
        const location = rc.lineNumber ? `${rc.fileName}:${rc.lineNumber}` : rc.fileName;
        lines.push(`- **File:** \`${location}\``);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format all annotations as markdown for LLM
   */
  formatAnnotations(annotations: Annotation[]): string {
    if (annotations.length === 0) {
      return '# No annotations\n\nNo elements have been annotated.';
    }

    const lines: string[] = [
      '# UI Feedback',
      '',
      `> ${annotations.length} element${annotations.length > 1 ? 's' : ''} annotated on ${window.location.href}`,
      '',
    ];

    annotations.forEach((annotation, index) => {
      lines.push(...this.formatSingleAnnotation(annotation, index + 1));
      lines.push('');
    });

    // Add suggested search patterns
    lines.push('---', '', '## Suggested Search Patterns', '');
    const patterns = this.collectSearchPatterns(annotations);
    patterns.forEach((pattern) => {
      lines.push(`- \`${pattern}\``);
    });

    return lines.join('\n');
  }

  /**
   * Format a single annotation with element context
   */
  private formatSingleAnnotation(annotation: Annotation, index: number): string[] {
    const { elementInfo, feedback } = annotation;
    const lines: string[] = [];

    // Header with feedback
    lines.push(`## ${index}. ${feedback}`);
    lines.push('');

    // Selector
    lines.push(`**Selector:** \`${elementInfo.selector}\``);

    // Element preview
    const tagPreview = this.getTagPreview(elementInfo);
    lines.push(`**Element:** \`${tagPreview}\``);
    lines.push('');

    // Layout context
    lines.push('### Layout');
    lines.push('```css');
    lines.push(this.formatLayoutStyles(elementInfo));
    lines.push('```');
    lines.push('');

    // Parent container (if relevant)
    if (elementInfo.parentContainer) {
      const pc = elementInfo.parentContainer;
      lines.push(`**Parent:** \`${pc.selector}\` (${pc.display})`);

      const parentStyles: string[] = [];
      if (pc.flexDirection) parentStyles.push(`flex-direction: ${pc.flexDirection}`);
      if (pc.alignItems) parentStyles.push(`align-items: ${pc.alignItems}`);
      if (pc.justifyContent) parentStyles.push(`justify-content: ${pc.justifyContent}`);
      if (pc.gridTemplateColumns) parentStyles.push(`grid-template-columns: ${pc.gridTemplateColumns}`);

      if (parentStyles.length > 0) {
        lines.push(`- ${parentStyles.join('; ')}`);
      }
      lines.push('');
    }

    // Height chain (for fill-height issues)
    if (this.isHeightRelatedFeedback(feedback) || !this.hasExplicitHeight(elementInfo)) {
      lines.push('### Height Chain');
      lines.push(this.formatHeightChain(elementInfo));
      lines.push('');
    }

    // React component (if detected)
    if (elementInfo.reactComponent) {
      const rc = elementInfo.reactComponent;
      lines.push('### React Component');
      lines.push(`- **Component:** ${rc.componentName}`);
      if (rc.fileName) {
        const location = rc.lineNumber ? `${rc.fileName}:${rc.lineNumber}` : rc.fileName;
        lines.push(`- **File:** \`${location}\``);
      }
      lines.push('');
    }

    return lines;
  }

  /**
   * Get a preview of the element's opening tag
   */
  private getTagPreview(elementInfo: ElementInfo): string {
    const tag = elementInfo.tagName;
    const attrs: string[] = [];

    if (elementInfo.id) {
      attrs.push(`id="${elementInfo.id}"`);
    }

    if (elementInfo.classList.length > 0) {
      const classes = elementInfo.classList.slice(0, 4).join(' ');
      attrs.push(`class="${classes}${elementInfo.classList.length > 4 ? ' ...' : ''}"`);
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    return `<${tag}${attrStr}>`;
  }

  /**
   * Format layout styles as CSS
   */
  private formatLayoutStyles(elementInfo: ElementInfo): string {
    const styles = elementInfo.computedStyles;
    const lines: string[] = [];

    // Core box model
    if (styles.display) lines.push(`display: ${styles.display};`);
    if (styles.position && styles.position !== 'static') {
      lines.push(`position: ${styles.position};`);
    }
    if (styles.width) lines.push(`width: ${styles.width};`);
    if (styles.height) lines.push(`height: ${styles.height};`);

    // Flex properties
    if (styles.flexDirection) lines.push(`flex-direction: ${styles.flexDirection};`);
    if (styles.flexGrow && styles.flexGrow !== '0') {
      lines.push(`flex-grow: ${styles.flexGrow};`);
    }
    if (styles.alignSelf) lines.push(`align-self: ${styles.alignSelf};`);

    // Overflow
    if (styles.overflow && styles.overflow !== 'visible') {
      lines.push(`overflow: ${styles.overflow};`);
    }

    return lines.join('\n');
  }

  /**
   * Format height chain for debugging fill-height issues
   */
  private formatHeightChain(elementInfo: ElementInfo): string {
    const chain = elementInfo.heightChain;
    if (chain.length === 0) return 'No height chain data';

    const lines: string[] = [];

    // Find first ancestor with explicit height
    const explicitIndex = chain.findIndex((n) => n.hasExplicitHeight);

    chain.slice(0, 6).forEach((node, i) => {
      const marker = node.hasExplicitHeight ? '✓' : '○';
      const indent = '  '.repeat(i);
      let info = `${indent}${marker} \`${node.selector}\` — ${node.height}`;

      if (node.isFlexChild) info += ' (flex child)';
      if (node.isGridChild) info += ' (grid child)';
      if (node.overflow !== 'visible') info += ` [overflow: ${node.overflow}]`;

      lines.push(info);
    });

    // Add diagnosis
    if (explicitIndex === -1) {
      lines.push('');
      lines.push('⚠️ **Issue:** No ancestor has an explicit height. Element cannot fill available space.');
    } else if (explicitIndex > 0) {
      lines.push('');
      lines.push(`💡 **Note:** Explicit height found at \`${chain[explicitIndex].selector}\`. Ensure all ancestors use \`height: 100%\` or flex/grid sizing.`);
    }

    return lines.join('\n');
  }

  /**
   * Check if feedback is related to height/fill issues
   */
  private isHeightRelatedFeedback(feedback: string): boolean {
    const heightKeywords = [
      'height',
      'fill',
      'expand',
      'stretch',
      'vertical',
      'full',
      'space',
      'grow',
      '100%',
      'vh',
    ];
    const lower = feedback.toLowerCase();
    return heightKeywords.some((kw) => lower.includes(kw));
  }

  /**
   * Check if element has explicit height
   */
  private hasExplicitHeight(elementInfo: ElementInfo): boolean {
    return elementInfo.heightChain[0]?.hasExplicitHeight ?? false;
  }

  /**
   * Collect search patterns from all annotations
   */
  private collectSearchPatterns(annotations: Annotation[]): string[] {
    const patterns = new Set<string>();

    for (const annotation of annotations) {
      const info = annotation.elementInfo;

      // Add class-based patterns
      info.classList.slice(0, 2).forEach((cls) => {
        if (cls.length > 2 && !this.isUtilityClass(cls)) {
          patterns.add(cls);
        }
      });

      // Add ID
      if (info.id) {
        patterns.add(info.id);
      }

      // Add React component name
      if (info.reactComponent) {
        patterns.add(info.reactComponent.componentName);
      }
    }

    return Array.from(patterns).slice(0, 10);
  }

  /**
   * Check if class is a utility class (Tailwind, etc.)
   */
  private isUtilityClass(className: string): boolean {
    const utilityPatterns = [
      /^p[xytblr]?-/,
      /^m[xytblr]?-/,
      /^w-/,
      /^h-/,
      /^flex/,
      /^grid/,
      /^text-/,
      /^bg-/,
      /^border/,
      /^rounded/,
    ];
    return utilityPatterns.some((p) => p.test(className));
  }

  /**
   * Format a single aligned element
   */
  private formatAlignedElement(
    element: AlignedElementInfo,
    index: number,
    axis: 'horizontal' | 'vertical',
    targetPosition: number
  ): string[] {
    const lines: string[] = [];
    const coordLabel = axis === 'horizontal' ? 'Y' : 'X';
    const currentPos = this.getCurrentPosition(element, axis);
    const offset = Math.round(element.offsetFromLine);
    const offStatus = Math.abs(offset) <= 1 ? 'aligned' : `${Math.abs(offset)}px off`;

    lines.push(`### Element ${index}: \`${this.getSimpleSelector(element)}\``);
    lines.push(`- **Current ${coordLabel}:** ${Math.round(currentPos)}px (${offStatus})`);
    lines.push(`- **Target ${coordLabel}:** ${Math.round(targetPosition)}px`);
    lines.push(`- **Selector:** \`${element.selector}\``);

    // Parent info
    if (element.parentContainer) {
      const pc = element.parentContainer;
      lines.push(`- **Parent:** \`${pc.selector}\` (${pc.display})`);
    }

    // Alignment context
    const ctx = element.alignmentContext;
    lines.push(`- **Current method:** ${ctx.currentMethod}`);

    // Layout properties
    const styles = element.computedStyles;
    const relevantProps: string[] = [];
    if (styles.margin !== '0px') relevantProps.push(`margin: ${styles.margin}`);
    if (styles.padding !== '0px') relevantProps.push(`padding: ${styles.padding}`);
    if (styles.position !== 'static') relevantProps.push(`position: ${styles.position}`);

    if (relevantProps.length > 0) {
      lines.push(`- **Current styles:** ${relevantProps.join(', ')}`);
    }

    return lines;
  }

  /**
   * Get current position of element along an axis
   */
  private getCurrentPosition(element: AlignedElementInfo, axis: 'horizontal' | 'vertical'): number {
    const rect = element.boundingRect;
    return axis === 'horizontal' ? rect.top : rect.left;
  }

  /**
   * Get simple selector for element
   */
  private getSimpleSelector(element: ElementInfo): string {
    if (element.id) {
      return `#${element.id}`;
    }
    const mainClass = element.classList.find((c) => !this.isUtilityClass(c));
    if (mainClass) {
      return `.${mainClass}`;
    }
    return element.tagName;
  }

  /**
   * Format alignment type as human-readable label
   */
  private formatAlignmentType(type: string): string {
    const labels: Record<string, string> = {
      top: 'top edges',
      bottom: 'bottom edges',
      left: 'left edges',
      right: 'right edges',
      centerX: 'horizontal centers',
      centerY: 'vertical centers',
    };
    return labels[type] || type;
  }

  /**
   * Format as JSON for alternative export
   */
  formatAsJSON(annotations: Annotation[]): string {
    const data = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      annotations: annotations.map((a) => ({
        feedback: a.feedback,
        selector: a.elementInfo.selector,
        tagName: a.elementInfo.tagName,
        classes: a.elementInfo.classList,
        id: a.elementInfo.id,
        layout: {
          display: a.elementInfo.computedStyles.display,
          width: a.elementInfo.computedStyles.width,
          height: a.elementInfo.computedStyles.height,
          overflow: a.elementInfo.computedStyles.overflow,
        },
        reactComponent: a.elementInfo.reactComponent,
      })),
    };

    return JSON.stringify(data, null, 2);
  }
}
