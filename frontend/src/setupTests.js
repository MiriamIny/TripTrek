
import '@testing-library/jest-dom'

// Mock fetch globally for all tests
import { vi } from 'vitest'

globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  })
)

import '@testing-library/jest-dom';

