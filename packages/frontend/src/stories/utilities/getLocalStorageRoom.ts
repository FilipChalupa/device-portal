const defaultRoom = 'storybook'

export const getLocalStorageRoom = () => {
	const room =
		localStorage.getItem('room') ||
		prompt('Enter room name', localStorage.getItem('room') || defaultRoom) ||
		defaultRoom
	localStorage.setItem('room', room)
	return room
}
