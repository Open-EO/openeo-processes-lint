const fs = require('fs');
const path = require('path');
const ajv = require('ajv');
const $RefParser = require("@apidevtools/json-schema-ref-parser");
const markdownlint = require('markdownlint');
const spellcheck = require('markdown-spellcheck').default;
const fetch = require('node-fetch');

const config = getConfig();

const ajvOptions = {
	schemaId: 'auto',
	format: 'full'
};

const spellcheckOptions = {
	ignoreAcronyms: true,
	ignoreNumbers: true,
	suggestions: false,
	relativeSpellingFiles: true,
	dictionary: {
		language: "en-us"
	}
};

// Read custom dictionary for spell check
if (typeof config.ignoredWords === 'string' && config.ignoredWords.length > 0 && fs.existsSync(config.ignoredWords)) {
	config.ignoredWords = fs.readFileSync(config.ignoredWords).toString().split(/\r\n|\n|\r/);
}
if (Array.isArray(config.ignoredWords)) {
	addWordsToSpellcheck(config.ignoredWords);
}

function getConfig() {
	return JSON.parse(process.env.OPENEO_PROCESSES_LINT);
}

function addWordsToSpellcheck(words) {
	for(let word of words) {
		if (typeof word === 'string' && word.length > 0) {
			spellcheck.spellcheck.addWord(word);
		}
	}
}

async function getSubtypeSchemas(asText = false) {
	if (typeof config.subtypeSchemas !== 'string' || config.subtypeSchemas.length == 0) {
		config.subtypeSchemas = 'https://processes.openeo.org/meta/subtype-schemas.json';
	}
	if (config.subtypeSchemas.includes('://')) {
		let response = await fetch(config.subtypeSchemas);
		return await (asText ? response.text() : response.json());
	}
	else {
		let absPath = path.resolve(config.subtypeSchemas);
		let str = fs.readFileSync(absPath).toString();
		if (asText) {
			return str;
		}
		return JSON.parse(str);
	}
}

async function getAjv() {
	let schemas = await getSubtypeSchemas();
	let subtypes = await $RefParser.dereference(
		schemas,
		{
			dereference: { circular: "ignore" }
		}
	);

	let jsv = new ajv(ajvOptions);
	jsv.addKeyword("parameters", {
		dependencies: [
			"type",
			"subtype"
		],
		metaSchema: {
			type: "array",
			items: {
				type: "object",
				required: [
					"name",
					"description",
					"schema"
				],
				properties: {
					name: {
						type: "string",
						pattern: "^[A-Za-z0-9_]+$"
					},
					description: {
						type: "string"
					},
					optional: {
						type: "boolean"
					},
					deprecated: {
						type: "boolean"
					},
					experimental: {
						type: "boolean"
					},
					default: {
						// Any type
					},
					schema: {
						oneOf: [
							{
								type: "object",
								// ToDo: Check Schema
							},
							{
								type: "array",
								items: {
									type: "object"
									// ToDo: Check Schema
								}
							}
						]
					}
				}
			}
		},
		valid: true
	});
	jsv.addKeyword("subtype", {
		dependencies: [
			"type"
		],
		metaSchema: {
			type: "string",
			enum: Object.keys(subtypes.definitions)
		},
		compile: function (subtype, schema) {
			if (schema.type != subtypes.definitions[subtype].type) {
				throw "Subtype '"+subtype+"' not allowed for type '"+schema.type+"'.";
			}
			if (config.forbidDeprecatedTypes && subtypes.definitions[subtype].deprecated) {
				throw "Deprecated subtypes not allowed.";
			}
			return () => true;
		},
		errors: false
	});
	jsv.addKeyword("dimensions", {
		dependencies: [
			"type",
			"subtype"
		],
		metaSchema: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				required: ["type"],
				oneOf: [
					{
						properties: {
							type: {
								type: "string",
								const: "spatial"
							},
							axis: {
								type: "array",
								minItems: 1,
								items: {
									type: "string",
									enum: ["x", "y", "z"]
								}
							}
						}
					},
					{
						properties: {
							type: {
								type: "string",
								const: "geometry"
							},
							geometry_type: {
								type: "array",
								minItems: 1,
								items: {
									type: "string",
									enum: ["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"]
								}
							}
						}
					},
					{
						properties: {
							type: {
								type: "string",
								enum: ["bands", "temporal", "other"]
							}
						}
					}
				]
			}
		},
		compile: function (_, schema) {
			if (schema.subtype != 'datacube') {
				throw "Dimensions only allowed for subtype 'datacube'."
			}
			return () => true;
		},
		errors: false
	});

	return jsv;
}

function isObject(obj) {
	return (typeof obj === 'object' && obj === Object(obj) && !Array.isArray(obj));
}

function normalizeString(str) {
	return str.replace(/\r\n|\r|\n/g, "\n").trim();
}

function checkDescription(text, p = null, processIds = [], commonmark = true) {
	if (!text) {
		return;
	}

	// Check markdown
	if (commonmark) {
		const options = {
			strings: {
			description: text
			},
			config: {
				"line-length": false, // Nobody cares in JSON files anyway
				"first-line-h1": false, // Usually no headings in descriptions
				"fenced-code-language": false, // Usually no languages available anyway
				"single-trailing-newline": false, // New lines at end of a JSON string doesn't make sense. We don't have files here.
			}
		};
		const result = markdownlint.sync(options);
		expect(result).toEqual({description: []});
	}

	// Check spelling
	checkSpelling(text, p);

	// Check whether process references are referencing valid processes
	if (config.checkProcessLinks && Array.isArray(processIds) && processIds.length > 0) {
		let matches = text.matchAll(/(?:^|[^\w`])``(\w+)\(\)``(?![\w`])/g);
		for(match of matches) {
			expect(processIds).toContain(match[1]);
		}
	}
}

function checkSpelling(text, p = null) {
	if (!text) {
		return;
	}

	const errors = spellcheck.spell(text, spellcheckOptions);
	if (errors.length > 0) {
		let pre = "Misspelled word";
		if (p && p.id) {
			pre += " in " + p.id;
		}
		throw (pre + ": " + JSON.stringify(errors));
	}
}

function prepareSchema(schema) {
	if (Array.isArray(schema)) {
		schema = {
			anyOf: schema
		};
	}
	if (typeof schema["$schema"] === 'undefined') {
		// Set applicable JSON SChema draft version if not already set
		schema["$schema"] = "http://json-schema.org/draft-07/schema#";
	}
	return schema;
}

function checkJsonSchema(jsv, schema, checkFormat = true) {
	if (Array.isArray(schema)) {
		// lint: For array schemas there should be more than one schema specified, otherwise use directly the schema object
		expect(schema.length).toBeGreaterThan(1);
	}

	let result = jsv.compile(prepareSchema(schema));
	expect(result.errors).toBeNull();

	checkSchemaRecursive(schema, checkFormat);
}

function checkSchemaRecursive(schema, checkFormat = true) {
	for(var i in schema) {
		var val = schema[i];
		if (typeof val === 'object' && val !== null) {
			checkSchemaRecursive(val, checkFormat);
		}

		switch(i) {
			case 'title':
			case 'description':
				checkSpelling(val);
				break;
			case 'format':
				if (checkFormat && schema.subtype !== val) {
					throw "format '"+val+"' has no corresponding subtype.";
				}
				break;
		}
	}
}

function join(path, pattern) {
	return path.replace(/\\/g, '/').replace(/\/$/, '') + '/' + pattern;
}

module.exports = {
	addWordsToSpellcheck,
	getAjv,
	getConfig,
	getSubtypeSchemas,
	join,
	normalizeString,
	checkDescription,
	checkSpelling,
	checkJsonSchema,
	checkSchemaRecursive,
	prepareSchema,
	isObject
};