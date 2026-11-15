/**
 * Pure Termux helpers for the `termux_bash` tool: no cordis or harness
 * imports, so they can be unit-tested on their own.
 */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Termux's `$PREFIX`, where the package-managed toolchain lives. */
export const TERMUX_PREFIX = process.env.PREFIX ?? '/data/data/com.termux/files/usr';

/**
 * Absolute shells tried in order before falling back to a PATH lookup. Termux
 * installs bash at `$PREFIX/bin/bash`; `sh` is the same binary there.
 */
export function shellCandidates(prefix = TERMUX_PREFIX) {
	return [join(prefix, 'bin', 'bash'), join(prefix, 'bin', 'sh'), 'bash', 'sh'];
}

/** First existing absolute candidate, else the first PATH-relative one. */
export function resolveShellPath(candidates = shellCandidates()) {
	for (const candidate of candidates) {
		if (!candidate.startsWith('/') || candidate.includes('\0')) continue;
		if (existsSync(candidate)) return candidate;
	}
	return candidates.find((candidate) => !candidate.startsWith('/')) ?? candidates[0];
}

/**
 * Environment overrides that make a Termux child usable from the harness:
 * `$PREFIX/bin` first on PATH, Termux's own tmp dir, a UTF-8 locale, and the
 * pager/color settings dsh's own bash executor disables.
 */
export function buildTermuxEnv({ ambient = process.env, prefix = ambient.PREFIX ?? TERMUX_PREFIX, shellPath } = {}) {
	const inherited = (ambient.PATH ?? '').split(delimiter).filter((entry) => entry.length > 0);
	const path = [...new Set([join(prefix, 'bin'), ...inherited])].join(delimiter);
	const lang = ambient.LANG?.length ? ambient.LANG : 'C.UTF-8';
	return {
		PATH: path,
		TMPDIR: ambient.TMPDIR?.length ? ambient.TMPDIR : join(prefix, 'tmp'),
		SHELL: shellPath ?? join(prefix, 'bin', 'bash'),
		LANG: lang,
		// Only forward an explicit LC_ALL. Promoting LANG into LC_ALL makes bash
		// warn on Termux, where the named locale data is usually absent.
		...(ambient.LC_ALL?.length ? { LC_ALL: ambient.LC_ALL } : {}),
		HOME: ambient.HOME,
		TERM: 'dumb',
		NO_COLOR: '1',
		PAGER: 'cat',
		GIT_PAGER: 'cat'
	};
}

/**
 * Model-facing tool description for `termux_bash`. Kept here with the other
 * model-facing text so the wording stays unit-tested: only sandboxed presets
 * lose the built-in `bash`, because `danger-full-access` never enters the
 * sandbox runner chain.
 */
export const TERMUX_BASH_DESCRIPTION =
	'Execute a bash command on Android/Termux and return its stdout/stderr. ' +
	'Use this instead of `bash` when the session runs under a sandboxed mode (read-only or workspace-write): there the built-in bash tool fails with SANDBOX_UNAVAILABLE because no sandbox backend exists. ' +
	'Each call runs a fresh `bash -c` in `workdir` (pass it instead of `cd`); commands run WITHOUT a file sandbox, ' +
	'with full authority of the harness process, even under a sandboxed mode. Long output is truncated to its tail. ' +
	'Provide `description` before `command` in the arguments. Before any delete or move, verify the resolved absolute target path yourself.';

/**
 * System-prompt section that steers the model to `termux_bash` where the
 * built-in bash cannot run. It must stay accurate for both kinds of preset:
 * a blanket "bash fails on Termux" claim is wrong under `danger-full-access`.
 */
export const TERMUX_BASH_SECTION =
	'This host is Android/Termux. Under a sandboxed permission preset (read-only or workspace-write) the built-in `bash` tool fails with SANDBOX_UNAVAILABLE because no sandbox backend exists; use `termux_bash` for shell commands there. Under danger-full-access the built-in `bash` works as well, and `termux_bash` stays available; it always runs unconfined, so verify destructive paths yourself.';

/**
 * Model-facing text for a settled run, mirroring the built-in bash tool's
 * shape: stdout, then `[stderr]`, then the exit markers.
 */
export function renderTermuxResult(result) {
	let body = result.stdout.text;
	const err = result.stderr.text;
	if (err.length > 0) {
		if (body.length > 0 && !body.endsWith('\n')) body += '\n';
		body += `[stderr]\n${err}`;
	}
	if (body.length === 0) body = '(no output)';
	const markers = [];
	if (result.timedOut) markers.push(`[timed out after ${result.timeoutMs}ms]`);
	if (result.signal !== null) markers.push(`[killed by signal: ${result.signal}]`);
	else if (result.exitCode !== null && result.exitCode !== 0) markers.push(`[exit code: ${result.exitCode}]`);
	if (markers.length === 0) return body;
	if (!body.endsWith('\n')) body += '\n';
	return body + markers.join('\n');
}
