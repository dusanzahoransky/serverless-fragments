import { FragmentsProcessor, TokenType } from "../src";
import { dirname, join } from 'path';
import { readFileSync } from "fs";


function serverlessDir() {
    return join(__dirname, 'serverless');
}

describe("FragmentsProcessor replaceVariable", () => {

    it("self variable", async () => {
        const content = `\${self:service.name}`;
        const params = new Map([['service.name', 'webhookService']]);

        const resolved = FragmentsProcessor.replaceVariable(content, 0, content.length, params);

        const expectedContent = `webhookService`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("opt variable", async () => {
        const content = `\${opt:stage}`;
        const params = new Map([['stage', 'test']]);

        const resolved = FragmentsProcessor.replaceVariable(content, 0, content.length, params);

        const expectedContent = `test`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("numeric variable", async () => {
        const content = `\${opt:stage}`;
        const params = new Map([['stage', 'test']]);

        const resolved = FragmentsProcessor.replaceVariable(content, 0, content.length, params);

        const expectedContent = `test`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("missing variable value with default", async () => {
        const content = `\${opt:stage, 'test'}`;
        const params = new Map();

        const resolved = FragmentsProcessor.replaceVariable(content, 0, content.length, params);

        const expectedContent = `'test'`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("missing numeric default", async () => {
        const content = `\${opt:visibilityTimeout, 60}`;
        const params = new Map();

        const resolved = FragmentsProcessor.replaceVariable(content, 0, content.length, params);

        const expectedContent = `60`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("start end index", async () => {
        const content = `0123\${opt:visibilityTimeout}5432`;
        const params = new Map([['visibilityTimeout', '-value-']]);

        const resolved = FragmentsProcessor.replaceVariable(content, 4, content.length - 5, params);

        const expectedContent = `0123-value-5432`;
        expect(resolved.value).toBe(expectedContent);
    });

});

describe("FragmentsProcessor resolveTokensRecursive", () => {

    it("1 variable on a single line", async () => {

        const content = `service: \${self:service.name}`;
        const params = new Map([['service.name', 'webhookService']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("2 variables on a single line", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService-test`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("N variables on a single line", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}-\${opt:version}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test'], ['version', '2']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService-test-2`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("N variables on a single line, some variables are missing", async () => {

        const content = `service: \${self:service.name}-\${opt:stage}-\${opt:version}`;
        const params = new Map([['service.name', 'webhookService'], ['version', '2']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService-\${opt:stage}-2`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("multiline variable with default", async () => {

        const content = `stage: \${opt:stage, 
        test}`;
        const params = new Map();

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `stage: test`;
        expect(resolved.value).toBe(expectedContent);
    });


    it("nested variables", async () => {

        const content = `name: \${self:\${opt:env}.tableName}`;
        const params = new Map([['env', 'prod'], ['prod.tableName', 'prod-webhook']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `name: prod-webhook`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("nested variables and multiple variables", async () => {

        const content = `name: \${self:\${opt:env}.tableName}-\${opt:stage}-\${opt:version}`;
        const params = new Map([['env', 'prod'], ['prod.tableName', 'prod-webhook'], ['stage', 'test'], ['version', '2']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `name: prod-webhook-test-2`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("variables combined with tfile", async () => {

        const content = `service: \${self:service.name}\${tfile:empty.yml}-\${opt:version}`;
        const params = new Map([['service.name', 'webhookService'], ['version', '2']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content, params);

        const expectedContent = `service: webhookService-2`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("skip commented lines", async () => {

        const content = `service:
            #\${self:service.name}
            \${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `service:
            #\${self:service.name}
            test`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("custom and opt serverless variables with specified parameters", async () => {

        const content = `service: \${self:service.name}
              env: \${opt:stage}`;
        const params = new Map([['service.name', 'webhookService'], ['stage', 'test']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `service: webhookService
              env: test`;
        expect(resolved.value).toBe(expectedContent);
    });


    it("variable with default", async () => {

        const content = `stage: \${opt:stage, 'test'}`;
        const params = new Map([['stage', 'prod']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `stage: prod`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("variable with empty default", async () => {

        const content = `stage: \${opt:stage, }`;

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content);

        const expectedContent = `stage: `;
        expect(resolved.value).toBe(expectedContent);
    });

    it("variable without default", async () => {

        const content = `stage: \${opt:stage}`;

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content);

        const expectedContent = `stage: \${opt:stage}`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("variable with default followed by variable", async () => {

        const content = `\${opt:serviceName, }\${opt:tableName}`;
        const params = new Map([['tableName', 'webhook']]);
        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `webhook`;
        expect(resolved.value).toBe(expectedContent);
    });

    it("missing variable value with default", async () => {

        const content = `stage: \${opt:stage, 'test'}`;
        const params = new Map();

        const resolved = FragmentsProcessor.resolveTokensRecursive('', content, params);

        const expectedContent = `stage: 'test'`;
        expect(resolved.value).toBe(expectedContent);
    });
});


describe("FragmentsProcessor tfile resolveTokensRecursive", () => {


    it("no parameters specified", async () => {

        const filePath = join(serverlessDir(), 'resources/provider.yml');
        const content = readFileSync(filePath, 'utf8');

        const resolved = FragmentsProcessor.resolveTokensRecursive(dirname(filePath), content);

        const expectedContent =
            `region: \${opt:region}
runtime: \${opt:runtime}`;
        expect(resolved.value).toBe(expectedContent);

        console.log(resolved.value);
    });

    it("skip commented lines", async () => {

        const content = '   #  ${tfile:resources/sns.yml}';

        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content);

        expect(resolved.value).toBe(content);

        console.log(resolved.value);
    });

    it("parameters with variable as a value", async () => {

        const content = `\${tfile:resources/provider.yml:region=\${opt:serverless-defined-region-variable}}`;

        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content);

        const expectedContent =
            `region: \${opt:serverless-defined-region-variable}
runtime: \${opt:runtime}`;
        expect(resolved.value).toBe(expectedContent);

        console.log(resolved.value);
    });


    it("multiline tfile", async () => {

        const content =
            `\${tfile:resources/provider.yml:
    region=ap-southeast-2
}`;

        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content);

        const expectedContent =
            `region: ap-southeast-2
runtime: \${opt:runtime}`;

        expect(resolved.value).toBe(expectedContent);

        console.log(resolved.value);
    });


});

describe("FragmentsProcessor fragments resolving", () => {

    it("load a file without parameters", () => {
        const content = readFileSync(join(serverlessDir(), 'resources/provider.yml'), 'utf8');
        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content);
        expect(resolved.value).toBeDefined();
    });

    it("load a file with parameters", async () => {

        const content = readFileSync(join(serverlessDir(), 'serverless.core.yml'), 'utf8');
        const params = new Map([['name', 'webhook'], ['profile', 'test']]);

        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content, params);

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
        expect(resolved.value).toBe(expectedContent);
    });


    it("load a file recursive", async () => {

        const content = readFileSync(join(serverlessDir(), 'resources.yml'), 'utf8');

        const resolved = FragmentsProcessor.resolveTokensRecursive(serverlessDir(), content);

        const expectedContent =
            `resources:
  Resources:
    #SQS Ota1OrderStatusUpdated
    ApiOta1OrderStatusUpdated:
      Type: "AWS::SQS::Queue"
      Properties:
        QueueName: \${self:provider.stage}-ApiOta1OrderStatusUpdated
        DelaySeconds: 0
        VisibilityTimeout: 30
        RedrivePolicy:
          deadLetterTargetArn:
            Fn::GetAtt: [ DeadApiOta1OrderStatusUpdated, "Arn" ]
          maxReceiveCount: 1`;
        expect(resolved.value).toBe(expectedContent);
    });

});

describe("FragmentsProcessor string tokenizing", () => {

    it("match the start tokens", () => {
        let token = FragmentsProcessor.nextToken('0123${opt:foo', undefined);
        expect(token).toEqual({ index: 4, type: TokenType.VAR_OPT_START });

        token = FragmentsProcessor.nextToken('0123${self:foo', undefined);
        expect(token).toEqual({ index: 4, type: TokenType.VAR_SELF_START });
    });

    it("match the end token", () => {
        const lastToken = { index: 0, type: TokenType.VAR_OPT_START };
        let token = FragmentsProcessor.nextToken('0123}', lastToken, [lastToken]);
        expect(token).toEqual({ index: 4, type: TokenType.VAR_END });
    });

    it("do not match a token", () => {
        let token = FragmentsProcessor.nextToken('0123${op', undefined);
        expect(token).toBeUndefined();

        token = FragmentsProcessor.nextToken('0123', undefined);
        expect(token).toBeUndefined();
    });


    it("match start tokens after index", () => {
        let token = FragmentsProcessor.nextToken('0123${opt:foo', { index: 4, type: TokenType.VAR_END });
        expect(token).toBeUndefined();

        token = FragmentsProcessor.nextToken('0123${opt:foo', { index: 3, type: TokenType.VAR_END });
        expect(token).toEqual({ index: 4, type: TokenType.VAR_OPT_START });


        token = FragmentsProcessor.nextToken('0123${opt:foo${self', { index: 4, type: TokenType.VAR_END });
        expect(token).toEqual({ index: 13, type: TokenType.VAR_SELF_START });
    });

    it("match indentation in front of tfile start", () => {
        let token = FragmentsProcessor.nextToken('  ${tfile', undefined);
        expect(token).toEqual({ index: 2, type: TokenType.T_FILE_START, indentation: '  ' });

        token = FragmentsProcessor.nextToken('${tfile', undefined);
        expect(token).toEqual({ index: 0, type: TokenType.T_FILE_START, indentation: '' });

        const content =
            `
  \${tfile`;
        token = FragmentsProcessor.nextToken(content, undefined);
        expect(token).toEqual({ index: 3, type: TokenType.T_FILE_START, indentation: '  ' });
    });

});


