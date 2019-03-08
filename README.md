# Reusable serverless template

A node.js template processor for creating reusable [serverless](https://serverless.com/) resources 
or configuration fragments.

The engine loads a specified top-level yaml file recursively and resolves template placeholders. 
_tfile_ loads nested template files. Parameters passed to tfile are matched against serverless 
variables-style placeholders _${custom:var-name}_ and _${opt:var-name}_ in the nested file.

A top level file as well as nested files do not need to be valid yaml objects, 
only the final structure, after the processing is done, has to be. This allows a flexibility to define partial 
yaml arrays or objects which can be merged into a parent file. 

The final yaml object is loaded using [js-yaml](https://www.npmjs.com/package/js-yaml) 

Loaded yaml object can be thus exported and processed by serverless framework:
 
```
const template = require('reusable-serverless-template');
const serverlessYaml = template.load(path.join(__dirname, 'serverless/serverless.core.yml', new Map[['foo':'bar']]));
module.exports = serverlessYaml;
 ```

A scope of the parameters passed to template#load function, as well as _tfile_ parameters, is the parent file only. 
There are not propagated to nested templates to avoid bugs related to missing nested template parameters, which are 
wrongly resolved by parent parameters. 

## Placeholders

## tfile

Loads the specified file recursively and apply parameters to matched variables names specified using opt, and custom 
placeholders.

Avoid using the following reserved characters for:
 * file names ``}`` ``:``   
 * parameters names and values ``,`` ``=``  

**Syntax:** ``` tfile:[file path]:[parameters]```, where 
* _file_ a relative path to nested template file (relative to the directory of the loaded top level file) 
* _parameters_ comma separated name-value pairs of parameters to replace opt and custom placeholders in the nested 
template file

**Usage:**
 
 * nested file without parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml}``
 * with parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml:tableName=entity}``
 
## opt and custom

Variables names specified using these placeholders are replaced with parameters passed from template#load function in top level file
or tfile in nested templates  

**Syntax:** ```opt:[variable name]``` or ```custom:[variable name]```, where 
* _variable name_ is matched against parameter names

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

const serverlessYaml = template.load(path.join(__dirname, 'serverless/serverless.core.yml', new Map([['version', '1.0.0']])));

module.exports = serverlessYaml;
```

**serverless.core.yml**
```
service: entityService

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
* _1.0.5_ supports comments - # at the beginning of a line (with optional lead white spaces) will skip the line
from processing
* _1.0.1_ added support to match and resolve nested variables like
``${self:custom.tableName${opt:env}}`` 
* _1.1.0_ tfile supports referencing json files, which are automatically converted to yaml if their extension is. json
This might be useful to keep you configuration file as json, which can be easily reused with your code.
```
config
├── local.json
└── dev.json
└── test.json
└── stage.json
└── prod.json
```
```
custom:
  ${tfile:config/${opt:profile}.json}
```