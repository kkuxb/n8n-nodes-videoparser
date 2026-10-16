const { readFileSync } = require('node:fs');

module.exports = {
	hooks: {
		'before:init': ['npm test', 'npm run lint', 'npm run prepublishOnly', 'npm pack --dry-run'],
	},
	git: {
		commitMessage: 'chore: release v${version}',
		tagName: 'v${version}',
		tagAnnotation: 'Release v${version}',
		push: true,
	},
	npm: {
		publish: false,
	},
	github: {
		release: true,
		releaseName: 'v${version}',
		releaseNotes: ({ version }) => {
			const lines = readFileSync('README.md', 'utf8').split(/\r?\n/);
			const start = lines.findIndex((line) => line.startsWith(`### v${version} (`));
			if (start === -1) throw new Error(`README.md 缺少 v${version} 的更新日志`);
			const rest = lines.slice(start + 1);
			const end = rest.findIndex((line) => /^#{1,3} /.test(line));
			return rest.slice(0, end === -1 ? undefined : end).join('\n').trim();
		},
	},
};
