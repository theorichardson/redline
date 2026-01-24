import type { ReactComponentInfo } from '../shared/types';

/**
 * ReactDetector - Detect React components from DOM elements
 * Uses React DevTools fiber access when available
 */
export class ReactDetector {
  private hook: unknown;

  constructor() {
    // Access React DevTools hook if available
    this.hook = (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  }

  /**
   * Check if this is a React application
   */
  isReactApp(): boolean {
    if (!this.hook) return false;
    const hook = this.hook as Record<string, unknown>;
    const renderers = hook.renderers as Map<unknown, unknown> | undefined;
    return renderers ? renderers.size > 0 : false;
  }

  /**
   * Get React component info for an element
   */
  getComponentInfo(element: Element): ReactComponentInfo | null {
    if (!this.hook) return null;

    // Try to find React fiber on the element
    const fiberKey = Object.keys(element).find(
      (key) =>
        key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );

    if (!fiberKey) return null;

    const fiber = (element as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | undefined;
    if (!fiber) return null;

    // Traverse fiber tree to find the nearest component
    let current: Record<string, unknown> | null = fiber;
    while (current) {
      const type = current.type;

      // Check if this is a function component or class component
      if (typeof type === 'function') {
        const funcType = type as { displayName?: string; name?: string };
        const name =
          funcType.displayName || funcType.name || 'AnonymousComponent';

        // Get source location if available (dev mode only)
        const source = current._debugSource as
          | { fileName?: string; lineNumber?: number }
          | undefined;

        return {
          componentName: name,
          fileName: source?.fileName ?? null,
          lineNumber: source?.lineNumber ?? null,
        };
      }

      current = current.return as Record<string, unknown> | null;
    }

    return null;
  }

  /**
   * Get all React components in the ancestor chain
   */
  getComponentChain(element: Element): ReactComponentInfo[] {
    const components: ReactComponentInfo[] = [];

    if (!this.hook) return components;

    const fiberKey = Object.keys(element).find(
      (key) =>
        key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );

    if (!fiberKey) return components;

    const fiber = (element as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | undefined;
    if (!fiber) return components;

    let current: Record<string, unknown> | null = fiber;
    const seen = new Set<string>();

    while (current && components.length < 5) {
      const type = current.type;

      if (typeof type === 'function') {
        const funcType = type as { displayName?: string; name?: string };
        const name =
          funcType.displayName || funcType.name || 'AnonymousComponent';

        // Avoid duplicates
        if (!seen.has(name)) {
          seen.add(name);

          const source = current._debugSource as
            | { fileName?: string; lineNumber?: number }
            | undefined;

          components.push({
            componentName: name,
            fileName: source?.fileName ?? null,
            lineNumber: source?.lineNumber ?? null,
          });
        }
      }

      current = current.return as Record<string, unknown> | null;
    }

    return components;
  }
}
