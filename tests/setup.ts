import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Her testten sonra DOM'u temizle.
afterEach(() => {
  cleanup()
})
