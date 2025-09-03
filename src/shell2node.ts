#!/usr/bin/env node

/**
 * shell2node MLP - capture mode (bash + zsh)
 *
 * Usage:
 *   shell2node capture            # enters capture mode (interactive shell)
 *   (inside capture shell)        # run commands normally
 *   shell2node save               # inside capture shell: save and exit -> generates script
 *   shell2node cancel             # inside capture shell: cancel capture and exit
 *
 * *Notes:
 *  - Supports bash via a temporary --rcfile and zsh via a temporary ZDOTDIR/.zshrc.
 *  - Captures the raw commands (timestamp + command). Does NOT capture output in this MLP.
 *  - The generated script simply replays commands via `sh -c "<command>"` to preserve semantics.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { printHelpMessage, usageAndExit } from './utils';
import { generateBashRcContent, generateZshRcContent } from './utils/rcContent';

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] !== 'capture') usageAndExit();

(async () => {
	// Setup temp workspace
	const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shell2node-'));
	const logFile = path.join(tmpRoot, 'commands.log');
	const markerFile = path.join(tmpRoot, '.save_marker');

	fs.writeFileSync(logFile, '', 'utf8');

	printHelpMessage(tmpRoot);

	// Build a temporary rc file for bash that:
	// - exports the log path
	// - uses a DEBUG trap to append each command
	// - defines shell2node() function for save/cancel
	// - slightly changes PS1 so user knows they're in capture mode
	const bashRcPath = path.join(tmpRoot, 'capture_rc.sh');
	const bashRcContent = generateBashRcContent(logFile, markerFile);

	const zshRcPath = path.join(tmpRoot, '.zshrc'); // we'll set ZDOTDIR to tmpRoot
	const zshRcContent = generateZshRcContent(logFile, markerFile);

	fs.writeFileSync(bashRcPath, bashRcContent, {
		encoding: 'utf8',
		mode: 0o600,
	});

	fs.writeFileSync(zshRcPath, zshRcContent, {
		encoding: 'utf8',
		mode: 0o600,
	});

	// Find user's shell
	const userShell = process.env.SHELL || '/bin/bash';
	const shellBase = path.basename(userShell).toLowerCase();

	let child: ChildProcess;
	// Choose spawn strategy
	if (shellBase.includes('zsh')) {
		// For zsh: set ZDOTDIR to tmpRoot so zsh will load tmpRoot/.zshrc as if it were ~/.zshrc
		const env = Object.assign({}, process.env, { ZDOTDIR: tmpRoot });
		console.log(
			'Detected zsh: launching an interactive zsh with temporary .zshrc.',
		);
		// spawn zsh interactive; it will source $ZDOTDIR/.zshrc
		child = spawn(userShell, ['-i'], { stdio: 'inherit', env });
	} else if (shellBase.includes('bash')) {
		// For bash: use --rcfile to load our temp rc
		console.log(
			'Detected bash: launching an interactive bash with temporary rcfile.',
		);
		child = spawn(userShell, ['--rcfile', bashRcPath, '-i'], {
			stdio: 'inherit',
		});
	} else {
		// Fallback: try bash by default but warn user
		console.warn(
			`Warning: detected shell '${shellBase}'. This MLP supports bash and zsh best. Trying to spawn ${userShell} but capture may not work.`,
		);
		// try to spawn the detected shell with a minimal attempt: for bash-like shells we can try --rcfile, else just -i
		if (userShell.includes('bash')) {
			child = spawn(userShell, ['--rcfile', bashRcPath, '-i'], {
				stdio: 'inherit',
			});
		} else {
			child = spawn(userShell, ['-i'], { stdio: 'inherit' });
		}
	}

	child.on('exit', (code: any, signal: any) => {
		console.log(`\nCapture shell exited (code=${code} signal=${signal}).`);
		const saved = fs.existsSync(markerFile);
		if (!saved) {
			console.log(
				'No save marker found. Nothing will be generated (capture canceled or exited without saving).',
			);
			// Optionally remove tmp files to avoid clutter
			console.log(
				`Temporary data available at ${tmpRoot} (commands.log may be useful for debugging).`,
			);
			process.exit(0);
		}

		// Read commands log
		const raw = fs
			.readFileSync(logFile, 'utf8')
			.trim()
			.split(/\r?\n/)
			.filter(Boolean);
		const entries = raw
			.map((line: string) => {
				// each line: "<ISO_TIMESTAMP> <command...>"
				const idx = line.indexOf(' ');
				if (idx === -1) return { ts: null, cmd: line };
				const ts = line.slice(0, idx);
				const cmd = line.slice(idx + 1);
				return { ts, cmd };
			})
			// Filter out internal marker-commands or the user calling 'shell2node save' / 'shell2node cancel'
			.filter((e: any) => e.cmd && !e.cmd.startsWith('shell2node')); // filter out the internal 'shell2node' calls

		if (entries.length === 0) {
			console.log('No recorded commands to generate script from.');
			console.log(`Commands log: ${logFile}`);
			process.exit(0);
		}

		// Create generated dir in cwd
		const outDir = path.resolve(process.cwd(), 'generated');
		if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const genFile = path.join(outDir, `${timestamp}-replay.js`);
		const meta = {
			originalCapturedAt: new Date().toISOString(),
			tmpWorkspace: tmpRoot,
			entries,
		};
		fs.writeFileSync(
			path.join(outDir, `${timestamp}-meta.json`),
			JSON.stringify(meta, null, 2),
			'utf8',
		);

		// Generate a simple Node script that replays the commands sequentially.
		// We choose spawnSync('sh', ['-c', cmd], { stdio: 'inherit' }) to preserve shell semantics and stream output.
		const lines: string[] = [];
		lines.push('// Generated by shell2node (MLP)');
		lines.push(`// Captured commands: ${entries.length}`);
		lines.push(`// Generated at: ${new Date().toISOString()}`);
		lines.push('');
		// lines.push("const { spawnSync } = require('child_process');");
		lines.push("import { spawnSync } from 'child_process' ");
		lines.push('');
		lines.push('function run(cmd) {');
		lines.push("  console.log('> ' + cmd);");
		lines.push(
			"  const r = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });",
		);
		lines.push('  if (r.error) {');
		lines.push("    console.error('Failed to run command:', r.error);");
		lines.push('    process.exit(r.status || 1);');
		lines.push('  }');
		lines.push('  if (r.status && r.status !== 0) {');
		lines.push("    console.error('Command exited with code', r.status);");
		lines.push('    process.exit(r.status);');
		lines.push('  }');
		lines.push('}');
		lines.push('');
		lines.push('(async () => {');

		for (const e of entries) {
			// Escape backticks inside template literal? We'll just JSON.stringify the command to be safe.
			lines.push(`  run(${JSON.stringify(e.cmd)});`);
		}

		lines.push('})();');
		fs.writeFileSync(genFile, lines.join('\n'), 'utf8');

		console.log(`Generated script: ${genFile}`);
		console.log(`Metadata: ${path.join(outDir, `${timestamp}-meta.json`)}`);
		console.log(
			`Temporary workspace retained at: ${tmpRoot} (contains commands.log)`,
		);
		console.log(
			'Tip: review the generated script before running it. It will execute the same shell commands again.',
		);
		process.exit(0);
	});

	child.on('error', (err: any) => {
		console.error('Failed to spawn capture shell:', err);
		process.exit(2);
	});
})();
