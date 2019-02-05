# Reusable serverless template

A node.js template processor for creating reusable [serverless](https://serverless.com/) templates.

It loads a specified yaml file with supported template placeholders recursively and resolves them with passed params. 
It resolves serverless variables including ${custom:var-name}, ${opt:var-name} if the var-name is matched with params.

A top level file as well as nested files do not need to be valid yaml objects, 
only the final structure, after the processing is done, has to be.
The final yaml object is loaded using [js-yaml](https://www.npmjs.com/package/js-yaml) 

Loaded yaml object can be thus exported and processed by serverless framework:
 
```
const template = require('reusable-serverless-template');
const serverlessYaml = template.load(path.join(__dirname, 'serverless/serverless.core.yml', new Map[['foo':'bar']]));
module.exports = serverlessYaml;
 ```
 
A scope of the parameters passed to template#load is the top level file, 
nested files have to be loaded with own parameters using ``tfile`` placeholder.

## Supported placeholders

## tfile

Loads the specified file recursively and apply parameters to matched variables names specified using opt, and custom 
placeholders.

Avoid using the following reserved characters for file names``}`` ``:``   
Avoid using the following reserved characters for parameter names and values ``,`` ``=``  

**Syntax:** ``` tfile:[file path]:[parameters]```, where 
* _file_ a relative path to nested template file (relative to the directory of the top level file) 
* _paramters_ comma separated name-value pairs of parameters to replace opt and custom placeholders in the nested 
template file

**Usage:**
 
 * without parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml}``
 * with parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml:tableName=webhook}``
 
## opt and custom

Variables names specified using these placeholders are replaced with parameters passed from template#load function or 
tfile  

**Syntax:** ```opt:[variable name]``` or ```custom:[variable name]```, where 
* _variable name_ is matched with parameter names

**Usage:**
 * serverless command line opt parameters ``${opt:foo}``
 * serverless custom variables ``${custom:foo.bar}``
 * multiple parameters on s single line ``${opt:foo}-${opt:bar}``
 * nested variables ``${self:custom.tableName${opt:env}}``
     
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
const template = require('reusable-serverless-template');

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
${self:custom.tableName${opt:env}}
``` 