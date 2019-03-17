# Serverless fragments

A node.js template processor for creating reusable [serverless](https://serverless.com/) fragments.

The engine loads a specified top-level yaml file recursively and resolves template placeholders. 

A top level file as well as nested files do not need to be valid yaml objects, 
only the final structure, after the processing is done, has to be. This allows a flexibility to define partial 
yaml arrays or objects which can be merged into a parent file. 

The final yaml object is loaded using [js-yaml](https://www.npmjs.com/package/js-yaml) 

Loaded yaml object can be thus exported and processed by serverless framework:
 
```
module.exports = slsFragments.load(path.join(__dirname, 'serverless/serverless.core.yml', new Map[['version':'1.0.1']]));
 ```

A scope of the parameters passed to template#load function, as well as _tfile_ parameters, is the parent file only. 
There are not propagated to nested templates to avoid bugs related to missing nested template parameters, which are 
wrongly resolved by parent parameters. 

## Placeholders

### tfile

Loads the specified file recursively and apply parameters to matched variables names specified using opt, and custom 
placeholders.

Avoid using the following reserved characters for:
 * file names ``}`` ``:``   
 * parameters names and values ``,`` ``=``  
 
tfile supports referencing json files, which are automatically converted to yaml if their extension is ``.json``
This might be useful to keep configuration files as json and easily reuse them with the code, 
as many languages support JSON natively, unlike yaml.
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
   ${tfile:config/${opt:stage}.json}
```

**Syntax:** `` tfile:[file path]:[parameters]``, where 
* _file_ a relative path to nested template file (relative to the directory of the loaded top level file) 
* _parameters_ comma separated name-value pairs of parameters to replace opt and custom placeholders in the nested 
template file

**Usage:**
 
 * nested file without parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml}``
 * with parameters ``${tfile:iamRoleStatements/dynamoDbFull.yml:tableName=entity}``
 * multiline declaration 
  ```
 ${tfile:resources/sqsQueue.yml:
    visibilityTimeout=60,
    delaySeconds=10
 }
 ```
 
### opt and custom

Variables names specified using these placeholders are replaced with parameters passed from template#load function in top level file
or tfile in nested templates  

**Syntax:** ```opt:[variable name], [default value]``` or ```custom:[variable name], [default value]```, where 
* _variable name_ is matched against parameter names
* _default value_ and the comma before it is optional. If provided the value will be used if there is no matching 
parameter. Compare to serverless defaults, also numeric values are supported

**Usage:**
 * a serverless command line opt parameter ``${opt:stage}``
 * a serverless custom variables ``${self:service.name}``
 * multiple variables on a single line ``${self:service.name}-${opt:stage}``
 * nested variables ``${self:${opt:env}.tableName}``
 * a variables with a default ```` 
 
### Comments

Use # for line comments, anything between the # and end of line will be skipped from processing

**Usage:**
 * comment out fragments ``# ${tfile:iamRoleStatements/dynamoDbFull.yml:tableName=entity}``
 * add comments to the fragments``# full entity table and all it's indexes access for the lambda``
     
## Examples

```
├── package.json
├── serverless.js
├── serverless
│   ├── serverless.core.yml
│   ├── provider
│   │   └── nodejs.yml
│   ├── resources
│   │   └── sqsQueue.yml
```

**package.json**

```    
  "devDependencies": {
    "serverless-fragments": "^2.0.0"
   }
```

**serverless.js**
```
const path = require('path');
const slsFragments = require('serverless-fragments');

module.exports = slsFragments.load(path.join(__dirname, 'serverless/serverless.core.yml', new Map([['version', '1.0.0']])));
```

**serverless.core.yml**
```
# entityService AWS serices definition 
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
* _1.2.1_ opt and custom now match variable names with defaults e.g. ``${opt:stage, 'dev'}``
* _2.0.0_ rename to Serverless Fragments
    * process default variable values
    * support multiline tfile declaration