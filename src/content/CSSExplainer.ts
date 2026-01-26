/**
 * CSSExplainer - Generates human-readable explanations for CSS properties
 */
export class CSSExplainer {
  /**
   * Generate explanations for CSS properties
   */
  static generateExplanations(styles: Record<string, string | undefined>): Array<{
    property: string;
    value: string;
    description: string;
  }> {
    const explanations: Array<{ property: string; value: string; description: string }> = [];

    // Define property explainers
    const explainers = {
      display: CSSExplainer.explainDisplay,
      position: CSSExplainer.explainPosition,
      flexDirection: CSSExplainer.explainFlexDirection,
      justifyContent: CSSExplainer.explainJustifyContent,
      alignItems: CSSExplainer.explainAlignItems,
      flexGrow: CSSExplainer.explainFlexGrow,
      flexShrink: CSSExplainer.explainFlexShrink,
      overflow: CSSExplainer.explainOverflow,
      gap: CSSExplainer.explainGap,
      width: CSSExplainer.explainWidth,
      height: CSSExplainer.explainHeight,
      boxSizing: CSSExplainer.explainBoxSizing,
    };

    // Generate explanations for visible properties
    const propertiesToExplain: Array<keyof typeof explainers> = [
      'display',
      'position',
      'flexDirection',
      'justifyContent',
      'alignItems',
      'flexGrow',
      'flexShrink',
      'gap',
      'width',
      'height',
      'overflow',
      'boxSizing',
    ];

    for (const prop of propertiesToExplain) {
      if (styles[prop] && explainers[prop]) {
        const value = styles[prop];
        // Skip auto/none values for some properties unless they're meaningful
        if (prop === 'width' || prop === 'height' || prop === 'overflow' || value !== 'auto') {
          explanations.push({
            property: prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
            value,
            description: explainers[prop](value),
          });
        }
      }
    }

    return explanations;
  }

  private static explainDisplay(val: string): string {
    const descriptions: Record<string, string> = {
      block: 'Takes full width, stacks vertically. Each element starts on a new line.',
      'inline-block': 'Flows with text but respects width/height. Useful for side-by-side elements.',
      flex: 'Enables flexible box layout. Direct children become flex items that can grow/shrink.',
      'inline-flex': 'Like flex but flows inline with surrounding content.',
      grid: 'Enables 2D grid layout. Creates rows and columns for positioning children.',
      inline: 'Flows with text. Ignores width/height properties.',
      none: 'Element is completely removed from layout. Not visible and takes no space.',
    };
    return descriptions[val] || 'Display mode: ' + val;
  }

  private static explainPosition(val: string): string {
    const descriptions: Record<string, string> = {
      static: 'Default positioning. Element flows normally in the document.',
      relative: 'Positioned relative to its normal position. Can use top/left/right/bottom offsets.',
      absolute: 'Removed from normal flow. Positioned relative to nearest positioned ancestor.',
      fixed: 'Positioned relative to viewport. Stays in place when scrolling.',
      sticky: 'Hybrid of relative and fixed. Sticks when scrolling past a threshold.',
    };
    return descriptions[val] || 'Positioning: ' + val;
  }

  private static explainFlexDirection(val: string): string {
    const descriptions: Record<string, string> = {
      row: 'Children flow left to right. This is the default flex direction.',
      column: 'Children stack top to bottom. Vertical layout.',
      'row-reverse': 'Children flow right to left. Reversed horizontal.',
      'column-reverse': 'Children stack bottom to top. Reversed vertical.',
    };
    return descriptions[val] || 'Flex direction: ' + val;
  }

  private static explainJustifyContent(val: string): string {
    const descriptions: Record<string, string> = {
      'flex-start': 'Items align to start of container (left for row, top for column).',
      'flex-end': 'Items align to end of container (right for row, bottom for column).',
      center: 'Items are centered along the main axis.',
      'space-between': 'Items spread out with equal space between them. No space at edges.',
      'space-around': 'Items have equal space around them. Half space at edges.',
      'space-evenly': 'Items have exactly equal space between and around them.',
    };
    return descriptions[val] || 'Main axis alignment: ' + val;
  }

  private static explainAlignItems(val: string): string {
    const descriptions: Record<string, string> = {
      'flex-start': 'Items align to start of cross axis (top for row, left for column).',
      'flex-end': 'Items align to end of cross axis (bottom for row, right for column).',
      center: 'Items are centered along the cross axis.',
      stretch: 'Items stretch to fill the container cross axis. Default behavior.',
      baseline: 'Items align along their text baseline.',
    };
    return descriptions[val] || 'Cross axis alignment: ' + val;
  }

  private static explainFlexGrow(val: string): string {
    if (val === '0') {
      return 'Element will NOT grow to fill available space. It stays at its base size.';
    } else if (val === '1') {
      return 'Element will grow to fill available space equally with other flex-grow: 1 siblings.';
    } else {
      return 'Element grows ' + val + 'x faster than flex-grow: 1 siblings when space is available.';
    }
  }

  private static explainFlexShrink(val: string): string {
    if (val === '0') {
      return 'Element will NOT shrink when space is limited. It maintains its size.';
    } else if (val === '1') {
      return 'Element will shrink proportionally when container is too small. Default behavior.';
    } else {
      return 'Element shrinks ' + val + 'x faster than flex-shrink: 1 siblings when space is tight.';
    }
  }

  private static explainOverflow(val: string): string {
    const descriptions: Record<string, string> = {
      visible: 'Content is not clipped. Can overflow the container boundaries.',
      hidden: 'Overflowing content is clipped and invisible. No scrollbars.',
      scroll: 'Content is clipped but scrollbars are always shown.',
      auto: 'Scrollbars appear only when content overflows.',
    };
    return descriptions[val] || 'Overflow behavior: ' + val;
  }

  private static explainGap(val: string): string {
    return 'Spacing between flex/grid children. Applies to both rows and columns: ' + val;
  }

  private static explainWidth(val: string): string {
    if (val.includes('%')) {
      return 'Width is ' + val + ' of parent container. Responsive to parent size changes.';
    } else if (val.includes('vw')) {
      return 'Width is ' + val + ' of viewport width. Responsive to window size.';
    } else if (val === 'auto') {
      return 'Width determined by content and layout context. Shrinks or grows as needed.';
    } else {
      return 'Fixed width of ' + val + '. Does not change unless explicitly modified.';
    }
  }

  private static explainHeight(val: string): string {
    if (val.includes('%')) {
      return 'Height is ' + val + ' of parent container. Parent needs explicit height to work.';
    } else if (val.includes('vh')) {
      return 'Height is ' + val + ' of viewport height. Responsive to window size.';
    } else if (val === 'auto') {
      return 'Height determined by content. Grows to fit children or text.';
    } else {
      return 'Fixed height of ' + val + '. Does not change unless explicitly modified.';
    }
  }

  private static explainBoxSizing(val: string): string {
    const descriptions: Record<string, string> = {
      'content-box': 'Width/height only includes content. Padding and border add to total size.',
      'border-box': 'Width/height includes content, padding, and border. Easier to size elements.',
    };
    return descriptions[val] || 'Box sizing model: ' + val;
  }
}
