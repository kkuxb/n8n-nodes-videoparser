'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough, Readable } = require('node:stream');
const axios = require('axios');
const {
	consumeMediaStream,
	downloadCandidates,
} = require('../dist/nodes/VideoParser/mediaTransfer');
async function drain(stream) {
	let size = 0;
	for await (const chunk of stream) size += chunk.length;
	return size;
}
const context = {
	helpers: {
		prepareBinaryData: async (stream) => ({
			data: String(await drain(stream)),
			mimeType: 'video/mp4',
		}),
	},
};
function response(data, headers = {}, status = 200) {
	return { status, headers: { 'content-type': 'video/mp4', ...headers }, data };
}
test('source errors propagate without hanging', async () => {
	const source = new PassThrough();
	const pending = consumeMediaStream(source, drain, {
		maxBytes: 100,
		signal: AbortSignal.timeout(500),
	});
	source.write('a');
	source.destroy(new Error('disconnected'));
	await assert.rejects(pending, /disconnected/);
	assert.ok(source.destroyed);
});
test('rejects oversize, empty and truncated streams', async () => {
	for (const [chunks, options, message] of [
		[['abc'], { maxBytes: 2 }, /下载上限/],
		[[], { maxBytes: 2 }, /空文件/],
		[['a'], { maxBytes: 2, expectedBytes: 2 }, /不完整/],
	]) {
		await assert.rejects(
			consumeMediaStream(Readable.from(chunks), drain, {
				...options,
				signal: AbortSignal.timeout(500),
			}),
			message,
		);
	}
});
test('consumer failure closes source and limiter', async () => {
	const source = new PassThrough();
	let input;
	await assert.rejects(
		consumeMediaStream(
			source,
			async (s) => {
				input = s;
				throw Error('storage failed');
			},
			{ maxBytes: 100, signal: AbortSignal.timeout(500) },
		),
		/storage failed/,
	);
	assert.ok(source.destroyed);
	assert.ok(input.destroyed);
});
test('silent stream and continuously slow stream have a total deadline', async () => {
	for (const slow of [false, true]) {
		const source = new PassThrough();
		const interval = slow ? setInterval(() => source.write('a'), 5) : undefined;
		const start = Date.now();
		await assert.rejects(
			consumeMediaStream(source, drain, { maxBytes: 1000, signal: AbortSignal.timeout(60) }),
			/总时限|abort/i,
		);
		clearInterval(interval);
		assert.ok(Date.now() - start < 400);
		assert.ok(source.destroyed);
	}
});
test('candidate fallback, invalid MIME, length precheck and HTTP errors clean up', async (t) => {
	let calls = [];
	const first = Readable.from(['html']);
	t.mock.method(axios, 'get', async (url) => {
		calls.push(url);
		return calls.length === 1
			? response(first, { 'content-type': 'text/html' })
			: response(Readable.from(['good']), { 'content-length': '4' });
	});
	const result = await downloadCandidates(context, [
		{ url: 'https://cdn.example/first', source: 'xiaohongshu-domestic' },
		{ url: 'https://cdn.example/second', source: 'original' },
	]);
	assert.equal(result.usedUrl, 'https://cdn.example/second');
	assert.equal(result.binary.data, '4');
	assert.equal(calls.length, 2);
	assert.ok(first.destroyed);
});
test('all candidates share total budget and release their source', async (t) => {
	let calls = 0;
	const sources = [];
	t.mock.method(axios, 'get', async () => {
		calls++;
		await new Promise((r) => setTimeout(r, 30));
		const s = new PassThrough();
		sources.push(s);
		if (calls === 1) setTimeout(() => s.destroy(Error('reset')), 10);
		return response(s);
	});
	const start = Date.now();
	await assert.rejects(
		downloadCandidates(
			context,
			[
				{ url: 'https://cdn.example/1', source: 'original' },
				{ url: 'https://cdn.example/2', source: 'original' },
			],
			undefined,
			{ totalMs: 100 },
		),
		/总时限|abort/i,
	);
	assert.equal(calls, 2);
	assert.ok(Date.now() - start < 250);
	assert.ok(sources.every((s) => s.destroyed));
});
test('official 403 stops candidate attempts and rejects unsafe redirect', async (t) => {
	let calls = 0;
	t.mock.method(axios, 'get', async () => {
		calls++;
		return response(Readable.from([]), {}, 403);
	});
	await assert.rejects(
		downloadCandidates(context, [
			{ url: 'https://cdn.example/1', source: 'official' },
			{ url: 'https://cdn.example/2', source: 'official' },
		]),
		/403/,
	);
	assert.equal(calls, 1);
	axios.get.mock.mockImplementation(async () =>
		response(Readable.from([]), { location: 'http://127.0.0.1/private' }, 302),
	);
	await assert.rejects(
		downloadCandidates(context, [{ url: 'https://cdn.example/1', source: 'original' }]),
		/私有网络/,
	);
});
test('real HTTP idle timeout, truncation, slow flow and connection fallback terminate', async (t) => {
	const http = require('node:http');
	const utils = require('../dist/nodes/VideoParser/videoParserUtils');
	const requests = [];
	const server = http.createServer((req, res) => {
		requests.push(req.url);
		if (req.url === '/no-headers') return;
		res.writeHead(200, {
			'content-type': 'video/mp4',
			...(req.url === '/truncated' ? { 'content-length': '100' } : {}),
		});
		if (req.url === '/headers-only') {
			res.flushHeaders();
			return;
		}
		res.write('v');
		if (req.url === '/truncated') {
			setTimeout(() => res.destroy(), 10);
			return;
		}
		if (req.url === '/good') {
			res.end('ideo');
			return;
		}
		if (req.url === '/slow') {
			const timer = setInterval(() => res.write('v'), 10);
			res.on('close', () => clearInterval(timer));
		}
		if (req.url === '/flow') {
			let chunks = 0;
			const timer = setInterval(() => {
				res.write('v');
				if (++chunks === 8) res.end();
			}, 30);
			res.on('close', () => clearInterval(timer));
		}
	});
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	t.mock.method(utils, 'assertSafeMediaUrl', (url) => {
		assert.equal(new URL(url).hostname, '127.0.0.1');
	});
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		for (const path of ['/idle', '/truncated', '/slow']) {
			const start = Date.now();
			await assert.rejects(
				downloadCandidates(context, [{ url: base + path, source: 'original' }], undefined, {
					totalMs: 130,
					idleMs: 50,
					connectMs: 50,
				}),
			);
			assert.ok(Date.now() - start < 500);
		}
		const result = await downloadCandidates(
			context,
			[
				{ url: base + '/no-headers', source: 'xiaohongshu-domestic' },
				{ url: base + '/good', source: 'original' },
			],
			undefined,
			{ totalMs: 250, idleMs: 100, connectMs: 35 },
		);
		assert.equal(result.binary.data, '5');
		assert.equal(result.usedUrl, base + '/good');
		for (const path of ['/headers-only', '/idle']) {
			requests.length = 0;
			const fallback = await downloadCandidates(
				context,
				[
					{ url: base + path, source: 'xiaohongshu-domestic' },
					{ url: base + '/good', source: 'original' },
				],
				undefined,
				{ totalMs: 1000, idleMs: 60, connectMs: 200 },
			);
			assert.deepEqual(requests, [path, '/good']);
			assert.equal(fallback.binary.data, '5');
			assert.equal(fallback.usedUrl, base + '/good');
		}
		const flowing = await downloadCandidates(
			context,
			[{ url: base + '/flow', source: 'original' }],
			undefined,
			{ totalMs: 1500, idleMs: 150, connectMs: 200 },
		);
		assert.equal(flowing.binary.data, '9');
	} finally {
		server.closeAllConnections();
		await new Promise((r) => server.close(r));
	}
});

test('body idle timer pauses under consumer backpressure', async () => {
	const source = Readable.from(Array.from({ length: 4 }, () => Buffer.alloc(64 * 1024)));
	const size = await consumeMediaStream(
		source,
		async (stream) => {
			let received = 0;
			for await (const chunk of stream) {
				received += chunk.length;
				await new Promise((resolve) => setTimeout(resolve, 90));
			}
			return received;
		},
		{ maxBytes: 1024 * 1024, idleMs: 30, signal: AbortSignal.timeout(2000) },
	);
	assert.equal(size, 4 * 64 * 1024);
});

test('redirects recompute Cookie headers for each domain', async (t) => {
	const { createDouyinContext } = require('../dist/nodes/VideoParser/douyinOfficial');
	const session = createDouyinContext();
	await session.acceptSetCookie('https://www.iesdouyin.com/share/video/123/', [
		'ttwid=anonymous; Domain=.iesdouyin.com; Path=/; Secure',
	]);
	const requests = [];
	t.mock.method(axios, 'get', async (url, config) => {
		requests.push({ url, cookie: config.headers.Cookie });
		if (requests.length === 1)
			return response(Readable.from([]), { location: 'https://cdn.example/next' }, 302);
		if (requests.length === 2)
			return response(Readable.from([]), { location: 'https://www.iesdouyin.com/video.mp4' }, 302);
		return response(Readable.from(['video']), { 'content-length': '5' });
	});
	await downloadCandidates(
		context,
		[{ url: 'https://www.iesdouyin.com/start', source: 'official' }],
		session,
	);
	assert.deepEqual(
		requests.map((r) => r.cookie),
		['ttwid=anonymous', undefined, 'ttwid=anonymous'],
	);
});
