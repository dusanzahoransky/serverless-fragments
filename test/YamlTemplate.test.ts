import { load, YamlTemplate } from "../src";
import { dirname, join } from 'path';
import { readFileSync } from "fs";

describe("YamlTemplate resolveVars tests", () => {

    it("should replace custom and opt serverless variables with specified parameters", async () => {

        const content = `service: \${self:service.name}
              env: \${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = new YamlTemplate().resolveVars(content, params);

        const expectedContent = `service: webhookService
              env: test`;
        expect(resolved).toBe(expectedContent);
    });


    it("should replace multiple variables on a single line", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = new YamlTemplate().resolveVars(content, params);

        const expectedContent = `service: webhookService-test`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace nested variables", async () => {

        const content = `name: \${self:\${opt:env}.tableName}`;
        const params = new Map([['env', 'prod'], ['prod.tableName', 'prod-webhook']]);

        const resolved = new YamlTemplate().resolveVars(content, params);

        const expectedContent = `name: prod-webhook`;
        expect(resolved).toBe(expectedContent);
    });

});


describe("YamlTemplate resolveFiles tests", () => {

    it("should load tfile (no parameters specified, no variables will be resolved)", async () => {

        const filePath = join(__dirname, 'serverless/serverless.core.yml');
        const content = readFileSync(filePath, 'utf8');

        const resolved = new YamlTemplate().resolveFiles(content, dirname(filePath));

        const expectedContent =
            `service: \${opt:name}

provider:
  memorySize: \${opt:notProvidedParam}
  profile: \${opt:profile}
  region: ap-southeast-2
  runtime: \${opt:runtime}
  vpc:
    securityGroupIds:
    - \${self:securityGroupId}
    subnetIds:
    - \${self:subnetId}`;
        expect(resolved).toBe(expectedContent);

        console.log(resolved);
    });

    it("should skip commented lines", async () => {

        const content = '   #  ${tfile:resources/sns.yml}';

        const resolved = new YamlTemplate().resolveFiles(content, join(__dirname, 'serverless'));

        expect(resolved).toBe(content);

        console.log(resolved);
    });

    it("should support parameters with variable placeholders", async () => {

        const content = `\${tfile:resources/provider.yml:region=\${opt:serverless-defined-region-variable}}`;

        const resolved = new YamlTemplate().resolveFiles(content, join(__dirname, 'serverless'));

        const expectedContent =
            `region: \${opt:serverless-defined-region-variable}
runtime: \${opt:runtime}`;
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
        const params = new Map([['name', 'webhook'], ['profile', 'test' ]]);

        const resolved = new YamlTemplate().loadFile(filePath, params);

        const expectedContent =
            `service: webhook

provider:
  memorySize: \${opt:notProvidedParam}
  profile: test
  region: ap-southeast-2
  runtime: \${opt:runtime}
  vpc:
    securityGroupIds:
    - \${self:securityGroupId}
    subnetIds:
    - \${self:subnetId}`;
        expect(resolved).toBe(expectedContent);
    });

});


