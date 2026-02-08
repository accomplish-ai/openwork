/**
 * Vitest setup file for web renderer tests
 */

import '@testing-library/jest-dom/vitest';

// Mock scrollIntoView for jsdom (not implemented in jsdom)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

export {};
