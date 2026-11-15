import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TERMUX_BASH_DESCRIPTION, TERMUX_BASH_SECTION, buildTermuxEnv, renderTermuxResult, resolveShellPath, shellCandidates } from '../lib/termux.js';

const PREFIX = '/data/data/com.termux/files/usr';

test('shellCandidates prefers the prefix bash, then PATH sh', () => {
	assert.deepEqual(shellCandidates(PREFIX), [`${PREFIX}/bin/bash`, `${PREFIX}/bin/sh`, 'bash', 'sh']);
});

test('resolveShellPath returns the first existing absolute candidate', () => {
	assert.equal(resolveShellPath(['/nonexistent/bash', '/bin/sh']), '/bin/sh');
});

test('resolveShellPath falls back to the first PATH-relative candidate', () => {
	assert.equal(resolveShellPath(['/nonexistent/bash', '/nonexistent/sh', 'bash', 'sh']), 'bash');
});

test('buildTermuxEnv puts $PREFIX/bin first and de-duplicates PATH', () => {
	const env = buildTermuxEnv({
		ambient: { PATH: `/usr/bin:${PREFIX}/bin:/usr/local/bin`, HOME: '/home/u' },
		prefix: PREFIX,
		shellPath: `${PREFIX}/bin/bash`
	});
	assert.equal(env.PATH, `${PREFIX}/bin:/usr/bin:/usr/local/bin`);
	assert.equal(env.HOME, '/home/u');
	assert.equal(env.SHELL, `${PREFIX}/bin/bash`);
});

test('buildTermuxEnv defaults TMPDIR and locale for Termux', () => {
	const env = buildTermuxEnv({ ambient: { PATH: '/usr/bin' }, prefix: PREFIX });
	assert.equal(env.TMPDIR, `${PREFIX}/tmp`);
	assert.equal(env.LANG, 'C.UTF-8');
	assert.equal('LC_ALL' in env, false);
});

test('buildTermuxEnv keeps an explicit locale and disables terminally noisy output', () => {
	const env = buildTermuxEnv({ ambient: { PATH: '/usr/bin', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }, prefix: PREFIX });
	assert.equal(env.LANG, 'en_US.UTF-8');
	assert.equal(env.LC_ALL, 'en_US.UTF-8');
	assert.equal(env.TERM, 'dumb');
	assert.equal(env.NO_COLOR, '1');
	assert.equal(env.PAGER, 'cat');
	assert.equal(env.GIT_PAGER, 'cat');
});

const settled = (overrides = {}) => ({
	cwd: '/home/u',
	exitCode: 0,
	signal: null,
	timedOut: false,
	aborted: false,
	timeoutMs: 1000,
	stdout: { text: 'hello\n', truncated: false },
	stderr: { text: '', truncated: false },
	...overrides
});

test('renderTermuxResult returns plain stdout for a clean run', () => {
	assert.equal(renderTermuxResult(settled()), 'hello\n');
});

test('renderTermuxResult appends stderr under a marker', () => {
	assert.equal(renderTermuxResult(settled({ stdout: { text: 'out', truncated: false }, stderr: { text: 'boom', truncated: false } })), 'out\n[stderr]\nboom');
});

test('renderTermuxResult reports the exit code', () => {
	assert.equal(renderTermuxResult(settled({ exitCode: 2 })), 'hello\n[exit code: 2]');
});

test('renderTermuxResult reports a kill signal and never both markers', () => {
	const text = renderTermuxResult(settled({ exitCode: null, signal: 'SIGKILL' }));
	assert.equal(text, 'hello\n[killed by signal: SIGKILL]');
});

test('renderTermuxResult reports a timeout', () => {
	assert.equal(renderTermuxResult(settled({ exitCode: null, timedOut: true, timeoutMs: 1500 })), 'hello\n[timed out after 1500ms]');
});

test('renderTermuxResult substitutes a placeholder for empty output', () => {
	assert.equal(renderTermuxResult(settled({ stdout: { text: '', truncated: false } })), '(no output)');
});

test('model-facing text is accurate for both permission modes', () => {
	assert.match(TERMUX_BASH_DESCRIPTION, /sandboxed mode \(read-only or workspace-write\)/);
	assert.match(TERMUX_BASH_DESCRIPTION, /SANDBOX_UNAVAILABLE/);
	assert.match(TERMUX_BASH_DESCRIPTION, /WITHOUT a file sandbox/);
	assert.match(TERMUX_BASH_SECTION, /danger-full-access/);
	assert.match(TERMUX_BASH_SECTION, /unconfined/);
	// The built-in bash works under danger-full-access, so no blanket claim.
	assert.doesNotMatch(TERMUX_BASH_SECTION, /for every shell command/);
});
