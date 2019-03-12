import { load, ReusableServerlessTemplate, TokenType } from "../src";
import { dirname, join } from 'path';
import { readFileSync } from "fs";


function serverlessDir() {
    return join(__dirname, 'serverless');
}

describe("ReusableServerlessTemplate resolveVars tests", () => {

    it("should replace 2 variables on a single line", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService-test`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace N variables on a single line", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}-\${opt:version}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test'], ['version', '2']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService-test-2`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace N variables on a single line, some variables are missing", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}-\${opt:version}`;
        const params = new Map([['service.name', 'webhookService'], ['version', '2']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService-\${opt:stage}-2`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace nested variables", async () => {

        const content = `name: \${self:\${opt:env}.tableName}`;
        const params = new Map([['env', 'prod'], ['prod.tableName', 'prod-webhook']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `name: prod-webhook`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace nested variables and multiple variables", async () => {

        const content = `name: \${self:\${opt:env}.tableName}-\${opt:stage}-\${opt:version}`;
        const params = new Map([['env', 'prod'], ['prod.tableName', 'prod-webhook'], ['stage', 'test'], ['version', '2']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `name: prod-webhook-test-2`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace variables combined with tfile", async () => {

        const content = `service: \${self:service.name}\${tfile:empty.yml}-\${opt:version}`;
        const params = new Map([['service.name', 'webhookService'], ['version', '2']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive(serverlessDir(), content, params);

        const expectedContent = `service: webhookService-2`;
        expect(resolved).toBe(expectedContent);
    });

    it("should skip commented lines", async () => {

        const content = `service:
            #\${self:service.name}
            \${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `service:
            #\${self:service.name}
            test`;
        expect(resolved).toBe(expectedContent);
    });

    it("should replace custom and opt serverless variables with specified parameters", async () => {

        const content = `service: \${self:service.name}
              env: \${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService
              env: test`;
        expect(resolved).toBe(expectedContent);
    });


    it("should replace variable with defaults", async () => {

        const content = `stage: \${opt:stage, test}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'prod']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive('', content, params);

        const expectedContent = `stage: prod`;
        expect(resolved).toBe(expectedContent);
    });
});


describe("ReusableServerlessTemplate resolveFiles tests", () => {


    it("should load tfile (no parameters specified, no variables will be resolved)", async () => {

        const filePath = join(serverlessDir(), 'resources/provider.yml');
        const content = readFileSync(filePath, 'utf8');

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive(dirname(filePath), content);

        const expectedContent =
            `region: \${opt:region}
runtime: \${opt:runtime}`;
        expect(resolved).toBe(expectedContent);

        console.log(resolved);
    });

    it("should skip commented lines", async () => {

        const content = '   #  ${tfile:resources/sns.yml}';

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive(serverlessDir(), content);

        expect(resolved).toBe(content);

        console.log(resolved);
    });

    it("should support parameters with variable placeholders", async () => {

        const content = `\${tfile:resources/provider.yml:region=\${opt:serverless-defined-region-variable}}`;

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive(serverlessDir(), content);

        const expectedContent =
            `region: \${opt:serverless-defined-region-variable}
runtime: \${opt:runtime}`;
        expect(resolved).toBe(expectedContent);

        console.log(resolved);
    });

});

describe("Reusable Serverless Template file loading tests", () => {

    it("should load a file with absolute path", () => {
        const content = readFileSync(join(serverlessDir(), 'resources/provider.yml'), 'utf8');
        const resolved = ReusableServerlessTemplate.resolveTokensRecursive(serverlessDir(), content);
        expect(resolved).toBeDefined();
    });

    it("should replace tfile and resolve serverless self and opt variables with tfile parameters", async () => {

        const content = readFileSync(join(serverlessDir(), 'serverless.core.yml'), 'utf8');
        const params = new Map([['name', 'webhook'], ['profile', 'test']]);

        const resolved = ReusableServerlessTemplate.resolveTokensRecursive(serverlessDir(), content, params);

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
    - \${self:subnetId}
custom:
  env: TEST
  `;
        expect(resolved).toBe(expectedContent);
    });

});

describe("Reusable Serverless Template string tokenizing", () => {

    it("should match the start tokens", () => {
        let token = ReusableServerlessTemplate.nextToken('0123${opt:foo', undefined);
        expect(token).toEqual({index: 4, type: TokenType.VAR_OPT_START});

        token = ReusableServerlessTemplate.nextToken('0123${self:foo', undefined);
        expect(token).toEqual({index: 4, type: TokenType.VAR_SELF_START});
    });

    it("should match the end token", () => {
        const lastToken = {index: 0, type: TokenType.VAR_OPT_START};
        let token = ReusableServerlessTemplate.nextToken('0123}', lastToken, [lastToken]);
        expect(token).toEqual({index: 4, type: TokenType.VAR_END});
    });

    it("should not match a token", () => {
        let token = ReusableServerlessTemplate.nextToken('0123${op', undefined);
        expect(token).toBeUndefined();

        token = ReusableServerlessTemplate.nextToken('0123', undefined);
        expect(token).toBeUndefined();
    });


    it("match the start tokens after index", () => {
        let token = ReusableServerlessTemplate.nextToken('0123${opt:foo', {index: 4, type: TokenType.VAR_END});
        expect(token).toBeUndefined();

        token = ReusableServerlessTemplate.nextToken('0123${opt:foo', {index: 3, type: TokenType.VAR_END});
        expect(token).toEqual({index: 4, type: TokenType.VAR_OPT_START});


        token = ReusableServerlessTemplate.nextToken('0123${opt:foo${self', {index: 4, type: TokenType.VAR_END});
        expect(token).toEqual({index: 13, type: TokenType.VAR_SELF_START});
    });

    it("match indentation in front of tfile start", () => {
        let token = ReusableServerlessTemplate.nextToken('  ${tfile', undefined);
        expect(token).toEqual({index: 2, type: TokenType.T_FILE_START, indentation: '  '});

        token = ReusableServerlessTemplate.nextToken('${tfile', undefined);
        expect(token).toEqual({index: 0, type: TokenType.T_FILE_START, indentation: ''});

        const content =
            `
  \${tfile`;
        token = ReusableServerlessTemplate.nextToken(content, undefined);
        expect(token).toEqual({index: 3, type: TokenType.T_FILE_START, indentation: '  '});
    });

});


