# Reusable yaml template

A node template engine which allows creating reusable [serverless](https://serverless.com/) templates.

It loads a specified yaml file recursively and resolves passed params. 
It resolves serverless variables including ${custom:var-name}, ${opt:var-name} 
if the var-name is matched with params.

A top level file as well as nested files do not need to be valid yaml objects,
only the final structure, after the processing is done, has to be.
The final yaml object is loaded using [js-yaml](https://www.npmjs.com/package/js-yaml) 
 
A scope of passed params to the load function is only the top level file, 
nested files have to be loaded with own params specified using ``tfile`` template variable.

## Supported variables

 * serverless opt variables ``${opt:foo}``
 * serverless custom variables ``${custom:foo.bar}``
 * multiple parameters on s single line ``${opt:foo}-${opt:bar}``
 * nested variables ``${opt:foo-${opt:bar}}``

## Nested files

Using template variable ``tfile``
 * without parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml}``
 * with parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml:tableName=webhook}``
     
## Example

```
├── serverless.js
├── serverless
│   ├── serverless.core.yml
│   ├── provider
│   │   └── nodejs.yml
│   ├── resources
│   │   └── sqsQueue.yml
```

**serverless.js**
```
const path = require('path');
const template = require('resusable-serverless-template');

let serverlessYaml = template.load(path.join(__dirname, 'serverless/serverless.core.yml', new Map([['version', '1.0.0']])));

console.log(template.dump(serverlessYaml));

module.exports = serverlessYaml;
```

**serverless.core.yml**
```
service: webhookService

provider:
  ${tfile:provider/nodejs.yml}
  environment:
    ENV: ${self:provider.stage}
    VERSION: ${opt:version}

functions:
  createEntity:
    handler: dist/src/entityRestHandler.create
    events:
    - http:
        path: /entity
        method: post

resources:
  Resources:
    ${tfile:resources/sqsQueue.yml:queueName=entity}
```

**provider/nodejs.yml**
```
name: aws
runtime: nodejs8.10
stage: ${opt:stage, 'dev'}
region: ${opt:region, 'ap-southeast-2'}
memorySize: 512
```

**resources/sqsQueue.yml**
```
${opt:queueName}Queue:
  Type: "AWS::SQS::Queue"
  Properties:
    QueueName: ${opt:queueName}Queue
```

Use standard serverless command to use the serverless.js file e.g. 

```sls package --stage dev --region ap-southeast-2 -v```

## Changelog
1.0.1 added support to match and resolve nested variables for example
```
${custom:dynamoDb-${opt:tableName}-table}
``` 