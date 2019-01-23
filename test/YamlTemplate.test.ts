import {load, YamlTemplate} from "../src";
import {dirname, join} from 'path'
import {readFileSync} from "fs";

describe("Template resolving", () => {


    it("load the file", () => {
        let resolved = load(join(__dirname, 'serverless/simple.core.yml'));
        expect(resolved).toBeDefined();
    });

    it("should replace multiple vars at the same line", async () => {

        let resolved = new YamlTemplate().replaceVars(
            `name: \${opt:nonExistingParam}-\${self:custom.name}`,
            new Map([['custom.name', 'foo']]));

        expect(resolved).toBe(`name: \${opt:nonExistingParam}-foo`);
    });

    it("should replace parametrized file with content", async () => {

        const filePath = join(__dirname, 'serverless/simple.core.yml');
        let resolved = new YamlTemplate().replaceFiles(readFileSync(filePath, 'utf8'), dirname(filePath));
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

    it("should replace custom and opt", async () => {

        let resolved = new YamlTemplate().replaceVars(
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

    it("should replace file and self and opt variables", async () => {

        const filePath = join(__dirname, 'serverless/simple.core.yml');
        let resolved = new YamlTemplate().loadFile(filePath,
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


