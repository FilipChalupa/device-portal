const fs = require('fs')

const filePath = process.argv[2]
if (!filePath) {
	console.error('Please provide a file path.')
	process.exit(1)
}

fs.readFile(filePath, 'utf8', (error, data) => {
	if (error) {
		console.error(`Error reading file: ${error}`)
		process.exit(1)
	}

	const shebang = '#!/usr/bin/env node'
	if (data.startsWith(shebang)) {
		console.log('Shebang already present.')
		return
	}

	const newData = `${shebang}
${data}`

	fs.writeFile(filePath, newData, 'utf8', (error) => {
		if (error) {
			console.error(`Error writing file: ${error}`)
			process.exit(1)
		}

		fs.chmod(filePath, 0o755, (error) => {
			if (error) {
				console.error(`Error setting file permissions: ${error}`)
				process.exit(1)
			}
			console.log(`Shebang added and file made executable: ${filePath}`)
		})
	})
})
