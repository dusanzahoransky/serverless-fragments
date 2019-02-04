import {load, YamlTemplate} from "../src";
import {dirname, join} from 'path'
import {readFileSync} from "fs";

describe("Yaml Template resolveVars tests", () => {

    it("should replace custom and opt serverless variables with specified parameters", async () => {

        const resolved = new YamlTemplate().resolveVars(
            `service: webhookService
                provider:
                  name: \${self:custom.name}
                  stage: \${opt:stage}
                  env: \${opt:stage}`,
            new Map([['custom.name', 'foo'], ['stage', 'test']]));

        expect(resolved).toBe(
            `service: webhookService
                provider:
                  name: foo
                  stage: test
                  env: test`);
    });


    it("should replace multiple variables on a single line", async () => {

        const resolved = new YamlTemplate().resolveVars(
            `name: \${opt:custom.name}-\${self:custom.name}`,
            new Map([['custom.name', 'foo']]));
        expect(resolved).toBe(`name: foo-foo`);
    });

    it("should replace nested variables", async () => {

        const resolved = new YamlTemplate().resolveVars(
            `name: \${self:custom.tableName\${opt:env}}`,
            new Map([['env', 'Test'], ['custom.tableNameTest', 'testDynamoDbTable']]));
        expect(resolved).toBe(`name: testDynamoDbTable`);
    });

});


describe("Yaml Template file resolveFiles tests", () => {

    it("should load tfile (no parameters specified, no variables will be resolved)", async () => {
        const filePath = join(__dirname, 'serverless/simple.core.yml');
        const resolved = new YamlTemplate().resolveFiles(readFileSync(filePath, 'utf8'), dirname(filePath));
        expect(resolved).toBe(
            `service: webhookService
provider:
  name: \${opt:nonExistingParam}-\${self:custom.name}
  stage: \${opt:stage}
  env: \${opt:stage}
  environment:
    ENV: test
  foo: bar`);

        console.log(resolved);
    });

});


describe("Yaml Template file loading tests", () => {
    it("should load a file with absolute path", () => {
        const resolved = load(join(__dirname, 'serverless/simple.core.yml'));
        expect(resolved).toBeDefined();
    });

    it("should replace tfile and resolve serverless self and opt variables with tfile parameters", async () => {

        const filePath = join(__dirname, 'serverless/simple.core.yml');
        const resolved = new YamlTemplate().loadFile(filePath,
            new Map([['custom.name', 'foo'], ['stage', 'test']]));

        expect(resolved).toBe(
            `service: webhookService
provider:
  name: \${opt:nonExistingParam}-foo
  stage: test
  env: test
  environment:
    ENV: test
  foo: bar`);
    });

});


