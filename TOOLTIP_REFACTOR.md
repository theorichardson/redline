# Tooltip Unification Refactor

## Problem
The codebase had multiple different tooltip implementations with inconsistent styling across components:

1. **HighlightOverlay** - Element selector tooltip with `#1a1a2e` background
2. **AlignmentGuides** - Distance measurement labels with `#1a1a2e` background  
3. **FloatingButton** - Button hover tooltips with `#0a0a0a` background
4. **InfoPanel** - Copy button tooltip with `#0a0a0a` background
5. **RulerPrompt** - Background using `#1a1a1a`

This resulted in:
- Inconsistent visual appearance
- Duplicated CSS code
- Maintenance burden (changes needed in multiple places)
- Harder to achieve a cohesive design

## Solution

### 1. Created Shared Styles Module (`src/content/styles.ts`)
A centralized module that exports:
- **Tooltip style constants** - `TOOLTIP_STYLES`, `TOOLTIP_STYLES_SMALL`, `TOOLTIP_STYLES_LARGE`
- **Helper function** - `getTooltipCSS()` to generate consistent CSS strings
- **Other shared constants** - `BUTTON_STYLES`, `PANEL_STYLES`, `INPUT_STYLES`, `COLORS`

### 2. Created Unified Tooltip Component (`src/content/Tooltip.ts`)
A reusable tooltip component with:
- Shadow DOM for style isolation
- Multiple size variants (small, medium, large)
- Multiple color variants (dark, light, accent)
- Smart positioning (auto-avoids viewport edges)
- Helper function `createTooltipContent()` for formatted content

### 3. Refactored All Components

#### HighlightOverlay
- ✅ Removed custom tooltip styles
- ✅ Now uses unified `Tooltip` component
- ✅ Smart positioning with `showSmart()` method
- ✅ Formatted content with `createTooltipContent()`

#### AlignmentGuides
- ✅ Removed custom label styles
- ✅ Uses `getTooltipCSS('small')` for distance labels
- ✅ Consistent with other tooltips

#### FloatingButton
- ✅ Replaced hardcoded tooltip styles with `getTooltipCSS('small')`
- ✅ Now matches design system

#### InfoPanel
- ✅ Replaced hardcoded tooltip styles with `getTooltipCSS('small')`
- ✅ Consistent with other components

## Benefits

1. **Single Source of Truth** - All tooltip styling defined in one place
2. **Easy Updates** - Change once in `styles.ts`, affects all tooltips
3. **Consistency** - Same look and feel across the entire extension
4. **Maintainability** - Less code duplication, easier to understand
5. **Flexibility** - Easy to add new variants or adjust existing ones
6. **Professional** - Cohesive design language

## Design System

### Unified Tooltip Appearance
- Background: `#1a1a2e` (dark blue-gray)
- Text: `#fff` (white)
- Border radius: `6px` (medium), `3px` (small)
- Padding: `6px 10px` (medium), `3px 6px` (small)
- Font size: `12px` (medium), `11px` (small)
- Font weight: `500`
- Box shadow: `0 2px 8px rgba(0, 0, 0, 0.3)`

## Files Changed

### New Files
- `src/content/styles.ts` - Shared styling constants
- `src/content/Tooltip.ts` - Unified tooltip component

### Modified Files
- `src/content/HighlightOverlay.ts` - Uses unified Tooltip
- `src/content/AlignmentGuides.ts` - Uses shared styles
- `src/content/FloatingButton.ts` - Uses shared styles
- `src/content/InfoPanel.ts` - Uses shared styles

## Future Improvements

1. Could refactor button styles to use `BUTTON_STYLES` constants
2. Could refactor panel styles to use `PANEL_STYLES` constants
3. Could create additional shared components (buttons, inputs, panels)
4. Could extend the design system with more variables (spacing, typography scale, etc.)
