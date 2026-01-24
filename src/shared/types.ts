// Core layout styles extracted from computed styles
export interface LayoutStyles {
  // Box model
  display: string;
  position: string;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  boxSizing: string;
  margin: string;
  padding: string;

  // Flexbox
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  flexGrow?: string;
  flexShrink?: string;
  flexBasis?: string;

  // Grid
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridColumn?: string;
  gridRow?: string;
  gap?: string;

  // Overflow
  overflow: string;
  overflowX: string;
  overflowY: string;
}

// Height chain node for tracing explicit heights
export interface HeightChainNode {
  tagName: string;
  selector: string;
  height: string;
  hasExplicitHeight: boolean;
  overflow: string;
  isFlexChild: boolean;
  isGridChild: boolean;
}

// Parent container info
export interface ParentContainerInfo {
  selector: string;
  tagName: string;
  display: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  overflow: string;
  hasExplicitHeight: boolean;
}

// React component info (when detected)
export interface ReactComponentInfo {
  componentName: string;
  fileName: string | null;
  lineNumber: number | null;
}

// Ancestor node for breadcrumb
export interface AncestorNode {
  tagName: string;
  id: string | null;
  classes: string[];
  selector: string;
}

// Full element info
export interface ElementInfo {
  // Identification
  selector: string;
  tagName: string;
  id: string | null;
  classList: string[];
  outerHTML: string;

  // Layout
  computedStyles: LayoutStyles;
  boundingRect: DOMRect;

  // Hierarchy
  ancestorPath: AncestorNode[];
  heightChain: HeightChainNode[];
  parentContainer: ParentContainerInfo | null;

  // React (optional)
  reactComponent: ReactComponentInfo | null;

  // Context
  siblingCount: number;
  siblingIndex: number;
}

// User annotation on an element
export interface Annotation {
  id: string;
  selector: string;
  feedback: string;
  elementInfo: ElementInfo;
  timestamp: number;
}

// Messages between background and content script
export type Message =
  | { type: 'TOGGLE_INSPECTION' }
  | { type: 'GET_STATE' }
  | { type: 'STATE_RESPONSE'; isActive: boolean };

// Extension settings
export interface RedlineSettings {
  highlightColor: string;
  showBoxModel: boolean;
  includeReactInfo: boolean;
  exportFormat: 'markdown' | 'json';
}

export const DEFAULT_SETTINGS: RedlineSettings = {
  highlightColor: '#e63946',
  showBoxModel: true,
  includeReactInfo: true,
  exportFormat: 'markdown',
};
