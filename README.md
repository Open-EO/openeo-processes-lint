# Linter for openEO process specifications

NPM: [@openeo/processes-lint](https://www.npmjs.com/package/@openeo/processes-lint)

1. Install [node and npm](https://nodejs.org) - should run with any recent version
2. Place a config file into your working directory that looks like the [`testConfig.json`](./testConfig.json). The options work as follows:
   * `folder`: Path to a folder with non-experimental process specifications in .json files.
   * `proposalsFolder`: Path to a folder with experimantal process specifications in .json files (optional)
   * `anyOfRequired`: Processes where any of the parameters is required (deprecated)
   * `ignoedWords`: A list of words the spell checker should ignore. Can also be a path to a file with a word on each line.
   * `subtypeSchemas`: Path or URL to a file that includes the subtype schemas, defaults to `https://processes.openeo.org/meta/subtype-schemas.json`
   * `checkSubtypeSchemas`: Enable or disable running checks against the subtype schemas. Defaults to `false` (disabled).
   * `forbidDeprecatedTypes`: Set to `true` to disallow deprecated subtypes such as `raster-cube` and `vector-cube`. Defaults to `false` (disabled).
   * `verbose`: Verbose output for tests. Defaults to `false` (disabled).
2. Run `npx @openeo/processes-lint testConfig.json`
