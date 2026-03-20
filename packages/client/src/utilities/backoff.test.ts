import { describe, expect, it } from 'vitest'
import { getExponentialBackoffDelay } from './backoff'

describe('getExponentialBackoffDelay', () => {
	it('returns baseDelay for attempt 0', () => {
		expect(getExponentialBackoffDelay(0)).toBe(1000)
	})

	it('doubles delay for each attempt', () => {
		expect(getExponentialBackoffDelay(1)).toBe(2000)
		expect(getExponentialBackoffDelay(2)).toBe(4000)
		expect(getExponentialBackoffDelay(3)).toBe(8000)
	})

	it('caps at default maxDelay of 30000', () => {
		// 1000 * 2^5 = 32000, capped to 30000
		expect(getExponentialBackoffDelay(5)).toBe(30000)
		expect(getExponentialBackoffDelay(10)).toBe(30000)
	})

	it('uses custom baseDelay', () => {
		expect(getExponentialBackoffDelay(0, 500)).toBe(500)
		expect(getExponentialBackoffDelay(2, 500)).toBe(2000)
	})

	it('uses custom maxDelay', () => {
		expect(getExponentialBackoffDelay(10, 1000, 5000)).toBe(5000)
	})

	it('returns exact value when delay equals maxDelay', () => {
		// 1000 * 2^3 = 8000
		expect(getExponentialBackoffDelay(3, 1000, 8000)).toBe(8000)
	})
})
