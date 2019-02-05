import {load, YamlTemplate} from "../src";
import {dirname, join} from 'path'
import {readFileSync} from "fs";

describe("Yaml Template resolveVars tests", () => {

    it("should replace custom and opt serverless variables with specified parameters", async () => {

        const content = `service: webhookService
            provider:
              name: \${self:custom.name}
              stage: \${opt:stage}
              env: \${opt:stage}`;
        const params = new Map([['custom.name', 'foo'], ['stage', 'test']]);

        const resolved = new YamlTemplate().resolveVars(content, params);

        const expectedContent = `service: webhookService
            provider:
              name: foo
              stage: test
              env: test`;
        expect(resolved).toBe(expectedContent);
    });


    it("should replace multiple variables on a single line", async () => {

        const content = `name: \${opt:custom.name}-\${self:custom.name}`;
        const params = new Map([['custom.name', 'foo']]);

        const resolved = new YamlTemplate().resolveVars(content, params);

        const expectedContent = `name: foo-foo`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace nested variables", async () => {

        const content = `name: \${self:custom.tableName\${opt:env}}`;
        const params = new Map([['env', 'Test'], ['custom.tableNameTest', 'testDynamoDbTable']]);

        const resolved = new YamlTemplate().resolveVars(content, params);

        const expectedContent = `name: testDynamoDbTable`;
        expect(resolved).toBe(expectedContent);
    });

});


describe("Yaml Template file resolveFiles tests", () => {

    it("should load tfile (no parameters specified, no variables will be resolved)", async () => {

        const filePath = join(__dirname, 'serverless/serverless.core.yml');
        const content = readFileSync(filePath, 'utf8');

        const resolved = new YamlTemplate().resolveFiles(content, dirname(filePath));

        const expectedContent =
`service: webhookService
provider:
  name: \${opt:nonExistingParam}-\${self:custom.name}
  stage: \${opt:stage}
  env: \${opt:stage}
  environment:
    ENV: test
  foo: bar`;
        expect(resolved).toBe(expectedContent);

        console.log(resolved);
    });

    it("should skip commented lines", async () => {

        const content = '   #  ${tfile:resources/simple.nested.yml}';

        const resolved = new YamlTemplate().resolveFiles(content, '');

        expect(resolved).toBe(content);

        console.log(resolved);
    });

    it("should support parameters with variable placeholders", async () => {

        const filePath = join(__dirname, 'serverless/tfile-with-dynamic-params.core.yml');
        const content = readFileSync(filePath, 'utf8');

        const resolved = new YamlTemplate().resolveFiles(content,  dirname(filePath));

        const expectedContent =
`environment:
  ENV: \${opt:serverless-processed-variable}
`;
        expect(resolved).toBe(expectedContent);

        console.log(resolved);
    });

});


describe("Yaml Template file loading tests", () => {

    it("should load a file with absolute path", () => {
        const resolved = load(join(__dirname, 'serverless/serverless.core.yml'));
        expect(resolved).toBeDefined();
    });

    it("should replace tfile and resolve serverless self and opt variables with tfile parameters", async () => {

        const filePath = join(__dirname, 'serverless/serverless.core.yml');
        const params = new Map([['custom.name', 'foo'], ['stage', 'test']]);

        const resolved = new YamlTemplate().loadFile(filePath, params);

        const expectedContent =
`service: webhookService
provider:
  name: \${opt:nonExistingParam}-foo
  stage: test
  env: test
  environment:
    ENV: test
  foo: bar`;
        expect(resolved).toBe(expectedContent);
    });

});


