/**
 * `termux_bash` — a shell tool for DeepSeek Harness on Android/Termux.
 *
 * The shipped bash executor runs through `@deepseek-ai/dsh-sandbox-local`,
 * whose runner chain (bwrap, Landlock) has no usable backend on Android, so
 * every command fails closed with `SANDBOX_UNAVAILABLE`. This plugin registers
 * an additional tool that spawns `bash -c` through `ctx.subprocess` with
 * Termux's environment and no file isolation. It coexists with the shipped
 * `bash` tool, which stays mounted and keeps failing on this platform.
 *
 * @module dsh-termux-shell
 */
import z from '@deepseek-ai/schemastery';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { TOOL_ABORTED, defineTool } from '@deepseek-ai/dsh-tools';
import { isAbsolute, resolve } from 'node:path';
import { TERMUX_BASH_DESCRIPTION, TERMUX_BASH_SECTION, buildTermuxEnv, renderTermuxResult, resolveShellPath } from './termux.js';

export const name = 'tool-termux-bash';
export const inject = ['tools', 'subprocess', 'systemPrompt'];

/**
 * Runtime configuration for the `termux_bash` tool.
 *
 * Every field is `volatile`, which is what lets the Web Plugins page expose a
 * per-row settings form: the Host projects only volatile fields into that form,
 * writes land in the profile's own layer, and the tool re-reads them on every
 * call, so a saved value applies to the next command without a restart.
 */
export const Config = z.object({
	/** Required opt-in: the command runs with the harness process's own authority. */
	acknowledgeUnconfined: z.boolean().default(false).volatile(),
	/** Shell executable; defaults to `$PREFIX/bin/bash` when present. */
	shellPath: z.string().volatile(),
	/** Default working directory when the caller passes none. */
	cwd: z.string().volatile(),
	timeoutMs: z.number().default(120000).volatile(),
	maxTimeoutMs: z.number().default(600000).volatile(),
	maxOutputBytes: z.number().default(64000).volatile(),
	maxSpillBytes: z.number().default(67108864).volatile(),
	graceMs: z.number().default(3000).volatile()
});

/** Read a config value whether cordis hands over a plain value or a reactive cell. */
function setting(value, fallback) {
	if (value === undefined || value === null) return fallback;
	if (typeof value.get === 'function') {
		const current = value.get();
		return current === undefined ? fallback : current;
	}
	return value;
}

function aborted() {
	const error = new HarnessError('tool call aborted', TOOL_ABORTED);
	error.name = 'AbortError';
	return error;
}

function positive(value, fallback, field) {
	if (!Number.isFinite(value) || value <= 0) throw new Error(`termux_bash: ${field} must be a positive finite number`);
	return value;
}

const DESCRIPTION = TERMUX_BASH_DESCRIPTION;

function toolFor(ctx, config) {
	const set = (key, fallback) => setting(config[key], fallback);
	const readSettings = () => ({
		acknowledgeUnconfined: set('acknowledgeUnconfined', false),
		shellPath: set('shellPath', undefined),
		cwd: set('cwd', undefined),
		timeoutMs: positive(set('timeoutMs', 120000), 120000, 'timeoutMs'),
		maxTimeoutMs: positive(set('maxTimeoutMs', 600000), 600000, 'maxTimeoutMs'),
		maxOutputBytes: positive(set('maxOutputBytes', 64000), 64000, 'maxOutputBytes'),
		maxSpillBytes: positive(set('maxSpillBytes', 67108864), 67108864, 'maxSpillBytes'),
		graceMs: positive(set('graceMs', 3000), 3000, 'graceMs')
	});

	return defineTool({
		name: 'termux_bash',
		description: DESCRIPTION,
		parameters: {
			description: {
				type: 'string',
				required: true,
				description: 'Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI).'
			},
			command: {
				type: 'string',
				required: true,
				description: 'The bash command to execute.'
			},
			workdir: {
				type: 'string',
				description: 'Working directory; relative paths resolve against the session workspace.'
			},
			timeoutMs: {
				type: 'number',
				description: 'Kill the command after this many milliseconds (capped by the plugin maxTimeoutMs).'
			}
		},
		output: {
			schema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					cwd: { type: 'string', required: true },
					exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
					signal: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
					timedOut: { type: 'boolean', required: true },
					aborted: { type: 'boolean', required: true },
					timeoutMs: { type: 'number', required: true },
					stdout: {
						type: 'object',
						additionalProperties: false,
						required: true,
						properties: {
							text: { type: 'string', required: true },
							truncated: { type: 'boolean', required: true },
							spillPath: { type: 'string' }
						}
					},
					stderr: {
						type: 'object',
						additionalProperties: false,
						required: true,
						properties: {
							text: { type: 'string', required: true },
							truncated: { type: 'boolean', required: true },
							spillPath: { type: 'string' }
						}
					}
				}
			},
			render: (_args, value) => [{ type: 'text', text: renderTermuxResult(value) }],
			presentationMeta: (_args, value) => ({ cwd: value.cwd })
		},
		async execute(args, exec) {
			const settings = readSettings();
			if (!settings.acknowledgeUnconfined) {
				throw new Error(
					'termux_bash: unconfined execution is not acknowledged. Set `acknowledgeUnconfined: true` in this plugin\'s profile config ' +
					'to allow commands to run with the harness process authority (Android has no usable file sandbox).'
				);
			}
			if (exec.signal.aborted) throw aborted();

			const timeoutMs = Math.min(args.timeoutMs ?? settings.timeoutMs, settings.maxTimeoutMs);
			if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`termux_bash: invalid timeoutMs ${String(args.timeoutMs)}`);

			const workingDirectory = ctx.get('workingDirectory');
			const sessionCwd = exec.agent !== undefined && workingDirectory !== undefined
				? await workingDirectory.ensure(exec.agent, exec.signal)
				: undefined;
			const base = sessionCwd ?? settings.cwd ?? process.cwd();
			const workdir = args.workdir === undefined
				? base
				: isAbsolute(args.workdir) ? args.workdir : resolve(base, args.workdir);

			const shellPath = settings.shellPath ?? resolveShellPath();
			let executable = shellPath;
			if (typeof ctx.subprocess.resolveExecutable === 'function') {
				executable = await ctx.subprocess.resolveExecutable(shellPath);
			}

			const shellEnv = ctx.get('shellEnv');
			const env = {
				...buildTermuxEnv({ shellPath }),
				...(shellEnv !== undefined ? shellEnv.collect(exec) : {})
			};

			const controller = new AbortController();
			const onAbort = () => controller.abort(exec.signal.reason);
			exec.signal.addEventListener('abort', onAbort, { once: true });

			let handle;
			try {
				handle = ctx.subprocess.spawn({
					argv: [executable, '-c', args.command],
					cwd: workdir,
					stdio: {
						stdin: 'ignore',
						stdout: { maxBytes: settings.maxOutputBytes, spill: { maxBytes: settings.maxSpillBytes } },
						stderr: { maxBytes: settings.maxOutputBytes, spill: { maxBytes: settings.maxSpillBytes } }
					},
					graceMs: settings.graceMs,
					signal: controller.signal,
					env
				});
			} catch (error) {
				exec.signal.removeEventListener('abort', onAbort);
				throw error;
			}

			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				handle.terminate();
			}, timeoutMs);

			let outcome;
			try {
				outcome = await handle.done;
			} finally {
				clearTimeout(timer);
				exec.signal.removeEventListener('abort', onAbort);
			}
			if (exec.signal.aborted) throw aborted();

			const stream = (reader) => {
				const read = reader?.readFrom(0);
				return {
					text: read?.text ?? '',
					truncated: read?.lossy ?? false,
					...read?.spillPath !== undefined ? { spillPath: read.spillPath } : {}
				};
			};
			return {
				cwd: workdir,
				exitCode: outcome.exitCode,
				signal: outcome.signal,
				timedOut,
				aborted: false,
				timeoutMs,
				stdout: stream(handle.collected?.stdout),
				stderr: stream(handle.collected?.stderr)
			};
		}
	});
}

export function apply(ctx, config = {}) {
	ctx.systemPrompt.section({
		name: 'tool:termux-bash',
		order: (ctx.systemPrompt.getSectionOrder('TOOL_BASH') ?? 0) + 1,
		text: TERMUX_BASH_SECTION
	});
	ctx.effect(() => ctx.tools.register(toolFor(ctx, config)));
}

export default { name, inject, Config, apply };
