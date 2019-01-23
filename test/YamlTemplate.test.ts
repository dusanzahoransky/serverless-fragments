import {YamlTemplate} from "../src";
import {dirname, join} from 'path'
import {readFileSync} from "fs";

describe("Template resolving", () => {

    let template: YamlTemplate;

    beforeAll(() => template = new YamlTemplate());


    it("load the file", () => {
        let resolved = template.loadFile(join(__dirname, 'serverless/simple.core.yml'));
        expect(resolved).toBeDefined();
    });

    it("should replace parametrized file with content", async () => {

        const filePath = join(__dirname, 'serverless/simple.core.yml');
        let resolved = template.replaceFiles(readFileSync(filePath, 'utf8'), dirname(filePath));
        expect(resolved).toBe(
`service: webhookService
  provider:
    name: \${custom:name}
    stage: \${opt:stage}
    env: \${opt:stage}
  environment:
    ENV: test`);

        console.log(resolved);
    });

    it("should replace custom and opt", async () => {

        let resolved = template.replaceVars(
            `service: webhookService
                provider:
                  name: \${custom:name}
                  stage: \${opt:stage}
                  env: \${opt:stage}`,
            new Map([['name', 'foo'], ['stage', 'test']]));

        expect(resolved).toBe(
            `service: webhookService
                provider:
                  name: foo
                  stage: test
                  env: test`);
    });

    it("should replace file and custom and opt variables", async () => {

        const filePath = join(__dirname, 'serverless/simple.core.yml');
        let resolved = template.loadFile(filePath,
            new Map([['name', 'foo'], ['stage', 'test']]));

        expect(resolved).toBe(
            `service: webhookService
  provider:
    name: foo
    stage: test
    env: test
  environment:
    ENV: test`);
    });
});


