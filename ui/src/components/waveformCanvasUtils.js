/**
 * Resolve CSS custom properties / color strings for canvas 2D fillStyle.
 * Canvas does not reliably accept `var(--token)` values directly.
 */
export function resolveCanvasColor(color, root = null) {
  if (!color || typeof color !== 'string') {
    return color;
  }

  if (!color.startsWith('var(')) {
    return color;
  }

  const varName = color.slice(4, -1).trim();
  const scope =
    root ||
    (typeof document !== 'undefined' ? document.documentElement : null);

  if (!scope || typeof getComputedStyle !== 'function') {
    return color;
  }

  const resolved = getComputedStyle(scope).getPropertyValue(varName).trim();
  return resolved || color;
}
