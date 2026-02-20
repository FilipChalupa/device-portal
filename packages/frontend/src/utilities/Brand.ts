// @TODO: Move this utility so it can be shared with server too.

const brandKey = '__brand' as const

export type Brand<Value, BrandName extends string> = Value & {
	[brandKey]: BrandName
}
