/**
 * Calculates the delay for exponential backoff.
 *
 * @param attempt - The current attempt number (0-indexed).
 * @param baseDelay - The initial delay in milliseconds.
 * @param maxDelay - The maximum delay in milliseconds.
 * @returns The calculated delay in milliseconds.
 */
export const getExponentialBackoffDelay = (
	attempt: number,
	baseDelay: number = 1000,
	maxDelay: number = 30000,
): number => {
	const delay = baseDelay * Math.pow(2, attempt)
	return Math.min(delay, maxDelay)
}
