import { styleText } from 'node:util';

export const printHelpMessage = (tmpRoot: string) => {
	console.log(
		styleText(
			'blueBright',
			`Entering capture mode ${styleText('cyan', '(bash)')}.`,
		),
	);
	console.log('All commands you run will be recorded (not their output).');
	console.log(
		`Inside the capture shell run:  ${styleText(
			['bold', 'green'],
			'shell2node save',
		)}   (to save and exit)`,
	);
	console.log(
		`                       or:  ${styleText(
			['bold', 'green'],
			'shell2node cancel',
		)} (to cancel and exit)\n`,
	);
	console.log(
		`${styleText(['bold', 'white'], 'Temp workspace:')} ${tmpRoot}`,
	);
	console.log(
		`Press ${styleText(['bold', 'yellow'], 'Ctrl+D')}  or type ${styleText(
			['bold', 'yellow'],
			'exit',
		)} if you want to quit without saving (use shell2node save to save).`,
	);
	console.log('');
};
