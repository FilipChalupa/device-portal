import { FunctionComponent } from 'react'

export type ShareLinkProps = {
	room: string
	title: string
	text: string
}

export const ShareLink: FunctionComponent<ShareLinkProps> = ({
	room,
	title,
	text,
}) => {
	const shareUrl = new URL(window.location.href.replace('-server', '-client'))
	shareUrl.hash = room

	return (
		<>
			Room: <input readOnly value={room} />{' '}
			{navigator.share ? (
				<button
					type="button"
					onClick={() => {
						navigator.share({
							title,
							text,
							url: shareUrl.toString(),
						})
					}}
				>
					Share Client Link
				</button>
			) : (
				<button
					type="button"
					onClick={() => {
						navigator.clipboard.writeText(shareUrl.toString())
						alert('Copied to clipboard!')
					}}
				>
					Copy Client Link
				</button>
			)}{' '}
			<button
				type="button"
				onClick={() => window.open(shareUrl.toString(), '_blank')}
			>
				Open Client
			</button>
		</>
	)
}
