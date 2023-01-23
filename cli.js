#!/usr/bin/env node

const { runCLI } = require('@jest/core');
const fs = require('fs');
const path = require('path');

let [configFile] = process.argv.slice(2);
if (typeof configFile !== 'string' || configFile.length === 0 || !configFile.endsWith('.json')) {
	console.error("Please provide a path to a .json config file");
	process.exit(2);
}
configFile = path.resolve(configFile);
console.log("Reading config: " + configFile);
if (!fs.existsSync(configFile)) {
	console.error("Config file does not exist");
	process.exit(2);
}

const configStr = fs.readFileSync(configFile);
const config = JSON.parse(configStr);
process.env.OPENEO_PROCESSES_LINT = configStr;

if (config.verbose) {
	console.log("config:", config);
}

const jestConfig = {
	rootDir: __dirname,
	testMatch: [
		config.checkSubtypeSchemas ? '<rootDir>/*.test.js' : '<rootDir>/processes.test.js'
	],
	testPathIgnorePatterns: [],
	verbose: config.verbose || false
};

if (config.verbose) {
	console.log("jest config:", jestConfig);
}

runCLI(jestConfig, [ __dirname ])
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  });