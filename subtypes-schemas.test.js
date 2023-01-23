const $RefParser = require("@apidevtools/json-schema-ref-parser");
const { checkDescription, checkSpelling, isObject, getSubtypeSchemas } = require('./testHelpers');

test("Check subtype schemas", async () => {
	const subtypeSchemas = await getSubtypeSchemas();
	const subtypes = await $RefParser.dereference(subtypeSchemas, { dereference: { circular: "ignore" } });

	// I'd like to run the tests for each subtype individually instead of in a loop,
	// but jest doesn't support that, so you need to figure out yourself what is broken.
	// The console.log in afterAll ensures we have a hint of which process was checked last
	let lastTest = null;
	let testsCompleted = 0; 

	// Each schema must contain at least a type, subtype, title and description
	for(let name in subtypes.definitions) {
		let schema = subtypes.definitions[name];
		lastTest = name;

		// Schema is object
		expect(isObject(schema)).toBeTruthy();

		// Type is array with an element or a stirng
		expect((Array.isArray(schema.type) && schema.type.length > 0) || typeof schema.type === 'string').toBeTruthy();

		// Subtype is a string
		expect(typeof schema.subtype === 'string').toBeTruthy();

		// Check title
		expect(typeof schema.title === 'string').toBeTruthy();
		// lint: Summary should be short
		expect(schema.title.length).toBeLessThan(60);
		// lint: Summary should not end with a dot
		expect(/[^\.]$/.test(schema.title)).toBeTruthy();
		checkSpelling(schema.title, schema);

		// Check description
		expect(typeof schema.description).toBe('string');
		// lint: Description should be longer than a summary
		expect(schema.description.length).toBeGreaterThan(60);
		checkDescription(schema.description, schema);

		testsCompleted++;
	}

	if (testsCompleted != Object.keys(subtypes.definitions).length) {
		console.log('The schema test has likely failed for: ' + lastTest);
	}
});