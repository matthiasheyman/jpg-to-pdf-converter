#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';
import meow from 'meow';
import {execa} from 'execa';
import pThrottle from 'p-throttle';
import {orderBy} from 'natural-orderby';

const cli = meow(`
  Usage
    $ converter -i input directory -n name
  `,
{
	importMeta: import.meta,
	flags: {
		inputDirectory: {
			type: 'string',
			shortFlag: 'i',
		},
		name: {
			type: 'string',
			shortFlag: 'n',
		},
	},
});

const {name, inputDirectory} = cli.flags;

if (!name || !inputDirectory) {
	process.exit(1);
}

const subItems = (await fs.readdir(inputDirectory, {withFileTypes: true}));
const subDirectories = orderBy(subItems.filter(i => i.isDirectory()).map(i => i.name));

const throttle = pThrottle({
	limit: 2,
	interval: 500,
});

const input = path.resolve(inputDirectory);
const result = path.join(input, 'result');

await fs.mkdir(result);

const getPdfName = (subDir: string) => `${name}_${subDir}.pdf`;

const throttled = throttle(async (subDir: string) => {
	const cwd = path.join(input, subDir);
	const contents = await fs.readdir(cwd, {withFileTypes: true});
	const jpgs = orderBy(contents.filter(i => i.isFile() && (i.name.endsWith('jpg') || i.name.endsWith('jpeg'))).map(i => i.name));

	const pdfName = getPdfName(subDir);
	console.log('start', cwd, pdfName);

	await execa('img2pdf', [...jpgs, '-o', pdfName], {
		cwd,
	});

	await fs.rename(path.join(cwd, pdfName), path.join(path.resolve(inputDirectory), 'result', pdfName));
	console.log('end', cwd, pdfName);
},
);

await Promise.all(subDirectories.map(async sub => {
	await throttled(sub);
},
));

const resultFiles = orderBy(subDirectories.map(sub => path.join(input, 'result', getPdfName(sub))));

console.log('JOINING ALL PDF\'s');
await execa('pdfunite', [...resultFiles, path.join(input, 'result', `${name}.pdf`)]);
