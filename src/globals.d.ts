/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  const console: {
    warn: (...args: any[]) => void
    log: (...args: any[]) => void
    error: (...args: any[]) => void
  }
}

export {}
