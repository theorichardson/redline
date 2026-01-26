/**
 * Shared styling constants for consistent UI across the extension
 */

export const TOOLTIP_STYLES = {
  background: '#000000',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: '500',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
};

export const TOOLTIP_STYLES_SMALL = {
  ...TOOLTIP_STYLES,
  padding: '3px 6px',
  fontSize: '11px',
  borderRadius: '3px',
};

export const TOOLTIP_STYLES_LARGE = {
  ...TOOLTIP_STYLES,
  padding: '8px 12px',
  fontSize: '13px',
};

/**
 * Generate CSS string for tooltip styles
 */
export function getTooltipCSS(size: 'small' | 'medium' | 'large' = 'medium'): string {
  const styles = size === 'small' ? TOOLTIP_STYLES_SMALL : 
                 size === 'large' ? TOOLTIP_STYLES_LARGE : 
                 TOOLTIP_STYLES;

  return `
    background: ${styles.background};
    color: ${styles.color};
    padding: ${styles.padding};
    border-radius: ${styles.borderRadius};
    font-family: ${styles.fontFamily};
    font-size: ${styles.fontSize};
    font-weight: ${styles.fontWeight};
    white-space: nowrap;
    pointer-events: none;
    box-shadow: ${styles.boxShadow};
  `;
}

export const BUTTON_STYLES = {
  background: '#2a2a2a',
  backgroundHover: '#333',
  backgroundPrimary: '#e63946',
  backgroundPrimaryHover: '#d62839',
  color: '#ccc',
  colorActive: '#fff',
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: '500',
};

export const PANEL_STYLES = {
  background: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
  color: '#e0e0e0',
  fontSize: '12px',
};

export const INPUT_STYLES = {
  background: '#2a2a2a',
  border: '1px solid transparent',
  borderFocus: '1px solid #e63946',
  borderRadius: '8px',
  padding: '10px 12px',
  color: '#fff',
  fontSize: '12px',
};

export const COLORS = {
  primary: '#e63946',
  primaryHover: '#d62839',
  background: '#1a1a2e',
  backgroundLight: '#2a2a2a',
  backgroundLighter: '#333',
  text: '#fff',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textTertiary: 'rgba(255, 255, 255, 0.5)',
  border: '#333',
  shadow: 'rgba(0, 0, 0, 0.3)',
};
