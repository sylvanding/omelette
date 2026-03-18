/**
 * Omelette Design Tokens
 *
 * Extracted from Figma `omelette-ui` design spec.
 * These are reference values — the actual theme is driven by CSS variables in index.css.
 * Use these constants for JavaScript-side color logic (e.g. D3 graphs, canvas rendering).
 */

export const colors = {
  violet: {
    50:  'oklch(0.969 0.016 293)',
    100: 'oklch(0.943 0.029 293)',
    200: 'oklch(0.894 0.057 293)',
    300: 'oklch(0.811 0.111 293)',
    400: 'oklch(0.702 0.183 293)',
    500: 'oklch(0.585 0.233 293)',
    600: 'oklch(0.541 0.260 293)',
    700: 'oklch(0.491 0.240 293)',
    800: 'oklch(0.432 0.210 293)',
    900: 'oklch(0.380 0.175 293)',
    950: 'oklch(0.283 0.130 293)',
  },
  gradients: {
    pink:   { from: 'oklch(0.90 0.08 340)', to: 'oklch(0.85 0.12 320)' },
    yellow: { from: 'oklch(0.93 0.08 90)',  to: 'oklch(0.88 0.12 80)' },
    blue:   { from: 'oklch(0.88 0.08 250)', to: 'oklch(0.83 0.12 230)' },
    green:  { from: 'oklch(0.90 0.08 160)', to: 'oklch(0.85 0.12 150)' },
  },
} as const;

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.625rem',
  xl: '1rem',
  '2xl': '1.5rem',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 oklch(0 0 0 / 0.05)',
  md: '0 4px 6px -1px oklch(0 0 0 / 0.07), 0 2px 4px -2px oklch(0 0 0 / 0.07)',
  lg: '0 10px 15px -3px oklch(0 0 0 / 0.08), 0 4px 6px -4px oklch(0 0 0 / 0.08)',
} as const;

export const typography = {
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

/**
 * Read a CSS custom property from the document root.
 * Useful for D3.js and Canvas rendering that needs theme-aware colors.
 */
export function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
