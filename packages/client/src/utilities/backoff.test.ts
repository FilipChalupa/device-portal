import { describe, expect, test } from 'vitest'
import { getExponentialBackoffDelay } from './backoff'

describe('getExponentialBackoffDelay', () => {
	test('returns baseDelay for attempt 0', () => {
		expect(getExponentialBackoffDelay(0)).toBe(1000)
	})

	test('doubles delay per attempt', () => {
		expect(getExponentialBackoffDelay(1)).toBe(2000)
		expect(getExponentialBackoffDelay(2)).toBe(4000)
		expect(getExponentialBackoffDelay(3)).toBe(8000)
	})

	test('caps at maxDelay', () => {
		expect(getExponentialBackoffDelay(10)).toBe(30000)
		expect(getExponentialBackoffDelay(100)).toBe(30000)
	})

	test('respects custom baseDelay and maxDelay', () => {
		expect(getExponentialBackoffDelay(0, 500, 5000)).toBe(500)
		expect(getExponentialBackoffDelay(3, 500, 5000)).toBe(4000)
		expect(getExponentialBackoffDelay(4, 500, 5000)).toBe(5000)
	})
})
