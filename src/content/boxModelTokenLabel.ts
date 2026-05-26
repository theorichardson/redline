type BoxSide = 'top' | 'right' | 'bottom' | 'left';
type BoxType = 'margin' | 'padding';

const SIDE_INDEX: Record<BoxSide, number> = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3,
};

const SIDE_PREFIXES: Record<string, BoxSide[]> = {
  '': ['top', 'right', 'bottom', 'left'],
  t: ['top'],
  r: ['right'],
  b: ['bottom'],
  l: ['left'],
  x: ['left', 'right'],
  y: ['top', 'bottom'],
  s: ['left'],
  e: ['right'],
};

/**
 * Extract a design token name from a CSS value.
 * Handles `var(--space-md)`, `var(--spacing-4)`, and Tailwind v4
 * `calc(var(--spacing) * 4)` patterns.
 */
export function extractDesignTokenName(value: string): string | null {
  const normalized = value.trim();

  const calcSpacingMatch = normalized.match(
    /calc\s*\(\s*(?:var\s*\(\s*--spacing\s*\)\s*\*\s*([\d.]+)|([\d.]+)\s*\*\s*var\s*\(\s*--spacing\s*\))\s*\)/i,
  );
  if (calcSpacingMatch) {
    const scale = calcSpacingMatch[1] || calcSpacingMatch[2];
    return `spacing-${stripTrailingZero(scale)}`;
  }

  const spacingFnMatch = normalized.match(/--spacing\s*\(\s*([^)]+)\s*\)/i);
  if (spacingFnMatch) {
    return formatRawToken(spacingFnMatch[1].trim());
  }

  const varMatch = normalized.match(/var\s*\(\s*(--[A-Za-z0-9_-]+)/);
  if (varMatch) {
    const name = varMatch[1].slice(2);
    if (name === 'spacing') return null;
    return name;
  }

  return null;
}

function stripTrailingZero(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

function formatRawToken(raw: string): string | null {
  if (raw.startsWith('--')) return raw.slice(2);

  if (raw.startsWith('(') && raw.endsWith(')')) {
    return formatRawToken(raw.slice(1, -1));
  }

  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1);
    const fromVar = extractDesignTokenName(inner);
    if (fromVar) return fromVar;
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return `spacing-${stripTrailingZero(raw)}`;
  }

  if (/^spacing-.+/.test(raw)) return raw;
  return raw;
}

function expandShorthandValue(shorthandValue: string, sideIndex: number): string {
  const parts = shorthandValue.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) {
    return sideIndex === 0 || sideIndex === 2 ? parts[0] : parts[1];
  }
  if (parts.length === 3) {
    if (sideIndex === 0) return parts[0];
    if (sideIndex === 1 || sideIndex === 3) return parts[1];
    return parts[2];
  }
  return parts[sideIndex];
}

function getInlineValue(element: HTMLElement, property: string): string {
  return element.style.getPropertyValue(property).trim();
}

function collectMatchingStyleRules(element: Element, rules: CSSRuleList, out: CSSStyleRule[]): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      try {
        if (element.matches(rule.selectorText)) {
          out.push(rule);
        }
      } catch {
        // Invalid selector for this document.
      }
      continue;
    }

    if (rule instanceof CSSMediaRule) {
      const mediaText = rule.media?.mediaText;
      if (!mediaText || window.matchMedia(mediaText).matches) {
        collectMatchingStyleRules(element, rule.cssRules, out);
      }
      continue;
    }

    if (rule instanceof CSSSupportsRule) {
      try {
        if (CSS.supports(rule.conditionText)) {
          collectMatchingStyleRules(element, rule.cssRules, out);
        }
      } catch {
        // Ignore unsupported @supports blocks.
      }
    }
  }
}

function getMatchingStyleRules(element: Element): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectMatchingStyleRules(element, sheet.cssRules, rules);
    } catch {
      // Cross-origin stylesheets cannot be read.
    }
  }
  return rules;
}

function getRuleValue(rule: CSSStyleRule, property: string): string {
  return rule.style.getPropertyValue(property).trim();
}

function getDeclaredSideValue(
  element: Element,
  boxType: BoxType,
  side: BoxSide,
): string | null {
  const htmlEl = element as HTMLElement;
  const sideIndex = SIDE_INDEX[side];
  const longhand = `${boxType}-${side}`;

  const inlineLonghand = getInlineValue(htmlEl, longhand);
  if (inlineLonghand) return inlineLonghand;

  const shorthand = boxType;
  const inlineShorthand = getInlineValue(htmlEl, shorthand);
  if (inlineShorthand) {
    return expandShorthandValue(inlineShorthand, sideIndex);
  }

  const blockShorthand = `${boxType}-block`;
  const inlineBlock = getInlineValue(htmlEl, blockShorthand);
  if (inlineBlock && (side === 'top' || side === 'bottom')) {
    return expandShorthandValue(inlineBlock, side === 'top' ? 0 : 1);
  }

  const inlineShorthandProp = `${boxType}-inline`;
  const inlineInline = getInlineValue(htmlEl, inlineShorthandProp);
  if (inlineInline && (side === 'left' || side === 'right')) {
    return expandShorthandValue(inlineInline, side === 'left' ? 0 : 1);
  }

  const matchingRules = getMatchingStyleRules(element);
  for (let i = matchingRules.length - 1; i >= 0; i--) {
    const rule = matchingRules[i];

    const ruleLonghand = getRuleValue(rule, longhand);
    if (ruleLonghand) return ruleLonghand;

    const ruleShorthand = getRuleValue(rule, shorthand);
    if (ruleShorthand) {
      return expandShorthandValue(ruleShorthand, sideIndex);
    }

    const ruleBlock = getRuleValue(rule, blockShorthand);
    if (ruleBlock && (side === 'top' || side === 'bottom')) {
      return expandShorthandValue(ruleBlock, side === 'top' ? 0 : 1);
    }

    const ruleInline = getRuleValue(rule, inlineShorthandProp);
    if (ruleInline && (side === 'left' || side === 'right')) {
      return expandShorthandValue(ruleInline, side === 'left' ? 0 : 1);
    }
  }

  return null;
}

interface ParsedTailwindSpacingClass {
  boxType: BoxType;
  sides: BoxSide[];
  token: string;
}

function parseTailwindSpacingClass(className: string): ParsedTailwindSpacingClass | null {
  const negativeMatch = className.match(/^-(m(?:[trblxy]|s|e)?)-(.+)$/);
  if (negativeMatch) {
    const axis = negativeMatch[1].slice(1);
    const token = formatRawToken(negativeMatch[2]);
    if (!token) return null;
    return {
      boxType: 'margin',
      sides: SIDE_PREFIXES[axis] ?? SIDE_PREFIXES[''],
      token,
    };
  }

  const match = className.match(/^(p|m)([trblxyse]|)?-(.+)$/);
  if (!match) return null;

  const token = formatRawToken(match[3]);
  if (!token) return null;

  return {
    boxType: match[1] === 'p' ? 'padding' : 'margin',
    sides: SIDE_PREFIXES[match[2] ?? ''] ?? SIDE_PREFIXES[''],
    token,
  };
}

function getTailwindClassToken(
  element: Element,
  boxType: BoxType,
  side: BoxSide,
): string | null {
  let winner: { token: string; index: number } | null = null;

  for (let i = 0; i < element.classList.length; i++) {
    const className = element.classList[i];
    const parsed = parseTailwindSpacingClass(className);
    if (!parsed || parsed.boxType !== boxType || !parsed.sides.includes(side)) {
      continue;
    }
    winner = { token: parsed.token, index: i };
  }

  return winner?.token ?? null;
}

function parseLengthToPx(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = trimmed;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();

  if (!px || !isFinite(px)) {
    if (trimmed.endsWith('px')) return parseFloat(trimmed);
    if (trimmed.endsWith('rem')) {
      const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return parseFloat(trimmed) * rootSize;
    }
  }

  return px || null;
}

/**
 * Infer Tailwind spacing scale from the resolved pixel value and the
 * `--spacing` theme multiplier (common in Tailwind v4 + shadcn).
 */
function inferTailwindSpacingScale(pxValue: number): string | null {
  const rounded = Math.round(pxValue);
  if (rounded <= 0) return null;

  const rootStyle = getComputedStyle(document.documentElement);
  const spacingBase = rootStyle.getPropertyValue('--spacing').trim();
  if (!spacingBase) return null;

  const basePx = parseLengthToPx(spacingBase);
  if (!basePx || basePx <= 0) return null;

  const scale = rounded / basePx;
  const nearest = Math.round(scale);
  if (Math.abs(scale - nearest) > 0.05) return null;

  return `spacing-${nearest}`;
}

function resolveBoxModelTokenName(
  element: Element,
  boxType: BoxType,
  side: BoxSide,
  pxValue: number,
): string | null {
  const declared = getDeclaredSideValue(element, boxType, side);
  if (declared) {
    const fromCss = extractDesignTokenName(declared);
    if (fromCss) return fromCss;
  }

  const fromClass = getTailwindClassToken(element, boxType, side);
  if (fromClass) return fromClass;

  return inferTailwindSpacingScale(pxValue);
}

/**
 * Format a box-model overlay label. When the side resolves to a design token,
 * show `token-name (20px)` instead of a bare pixel number.
 */
export function formatBoxModelLabel(
  element: Element,
  boxType: BoxType,
  side: BoxSide,
  pxValue: number,
): string {
  const rounded = Math.round(pxValue);
  if (rounded <= 0) return `${rounded}`;

  const tokenName = resolveBoxModelTokenName(element, boxType, side, pxValue);
  if (tokenName) {
    return `${tokenName} (${rounded}px)`;
  }

  return `${rounded}`;
}
