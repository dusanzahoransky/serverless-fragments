import {readFileSync} from 'fs'
import {basename, dirname, join} from 'path'
import {dump as yamlDump, load as yamlLoad} from 'js-yaml';

/**
 * A stateless template processor.
 */
export class YamlTemplate {

    public evaluate(dir: string, content: string, params: Map<string, string> = new Map()): string {

        content = this.resolveVars(content, params);
        content = this.resolveFiles(content, dir);

        return content;
    };

    /**
     * Matches all serverless variables including cmd parameters ${opt:foo} or custom variables ${self:custom.bar}
     * and replace them if there are matching parameters in the params map (matching key is found e.g. foo or custom.bar)
     *
     * @param content content with serverless variables
     * @param params parameters map: extracted variable name -> parameter value
     */
    public resolveVars(content: string, params: Map<string, string> = new Map()) {
        return content.split('\n')
            .map(line => this.resolveVariablesRecursively(line, params))
            .join('\n');
    }

    /**
     * Locates and replace variables recursively if a matching parameter exists.
     * * supports multiple params on s single line e.g. ${opt:foo}-${opt:bar}
     * * supports nested variables ${opt:foo-${opt:bar}}
     * @param value a single line string
     * @param params
     * @param afterIndex start matching after the specified index
     */
    public resolveVariablesRecursively(value: string, params: Map<string, string>, afterIndex: number = -1): string {
        let startToken = this.nextStartToken(value, afterIndex);

        //nothing to resolve here
        if (startToken == -1) {
            return value;
        }

        //check if the closest token is another start index (nested variables) or end index
        //TODO optimize by scanning and pushing the next token  to a lifo queue instead of doing multiple times lookahead for start and end token
        let nextStartToken = this.nextStartToken(value, startToken);
        let endToken = this.nextEndToken(value, startToken);

        //no variable found, end token is missing e.g. ${opt:bar
        if (endToken == -1) {
            return value;
        }

        //single variables only
        if (nextStartToken == -1) {
            return this.replaceVariable(value, startToken, endToken, params);
        }

        //multiple variables e.g. ${opt:foo}-${opt:bar}, process the string from the end to not mess up the first matched variable indexes with replaced string
        if (nextStartToken > endToken) {
            value = this.resolveVariablesRecursively(value, params, endToken);
            return this.replaceVariable(value, startToken, endToken, params);
        }

        //nested variables ${opt:foo-${opt:bar}}, process the nested one first
        value = this.resolveVariablesRecursively(value, params, startToken);
        endToken = this.nextEndToken(value, startToken);

        if (endToken == -1) { //no variable found, invalid syntax - end token is missing e.g. ${opt:bar
            return value;
        }

        return this.replaceVariable(value, startToken, endToken, params);
    }

    public replaceVariable(value: string, startIndex: number, endIndex: number, params: Map<string, string>): string {

        const variable = value.substr(startIndex, endIndex - startIndex + 1);

        const paramName = /\${(opt|self):(.+)}/.exec(variable)[2];  //extract the variable name
        const paramValue = params.get(paramName);
        if (paramValue) {
            console.log(`Resolving ${variable} => ${paramValue}`);
            value = value.replace(variable, paramValue);
        }

        return value;
    }


    public nextStartToken(value: string, afterIndex: number = -1): number {
        const optStartIndex = value.indexOf('${opt:', afterIndex + 1);
        const selfStartIndex = value.indexOf('${self:', afterIndex + 1);

        //gets the closest token, there can be both on a same line e.g. ${opt:foo} - ${self:bar}
        if (optStartIndex == -1) {
            return selfStartIndex;
        }
        if (selfStartIndex == -1) {
            return optStartIndex;
        }
        return optStartIndex < selfStartIndex ? optStartIndex : selfStartIndex;
    }

    public nextEndToken(value: string, afterIndex: number = -1): number {
        return value.indexOf('}', afterIndex + 1);
    }

    /**
     * Matches all file params ${tfile(a/b/c.yml)(foo=bar,stage=test)} with optional parameters
     * and replaces them with loaded content recursively.
     * It appends the indentation to every line of resolved file, based on the whitespaces before $file declaration
     *
     * file name, parameter names and values can not contain characters '{', ':', ',' or '='
     *
     * @param content content with params
     * @param dir current directory absolute path
     */
    public resolveFiles(content: string, dir: string): string {
        const paramRegexpStr = '([\\t ]*)\\${tfile:([^:}]+)(:([^}]))?}';
        const paramRegexp = new RegExp(paramRegexpStr, 'g');  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const [, indentation, filePath, , params] = new RegExp(paramRegexpStr).exec(match);  //stateful RegExps, so need new instance
            return this.loadFile(join(dir, filePath), this.toMap(params), indentation)
        });
        return content;
    }

    /**
     * Converts nameValue pairs of params from string to Map.
     * E.g. 'foo =bar,stage= test' will become a Map { '(foo' => 'bar', 'stage' => 'test)' }
     * @param params comma-separated params with name and value
     */
    public toMap(params: string = ''): Map<string, string> {
        const paramMap = new Map();

        params.split(",").forEach(nameValuePair => {
            const [name, value] = nameValuePair.split("=").map(s => s.trim());
            if (name && value) {
                paramMap.set(name, value);
            }
        });

        return paramMap;
    }

    /**
     * @see load
     */
    public loadFile(filePath, params: Map<string, string> = new Map(), indentation: string = ''): string {

        console.log(`Loading ${basename(filePath)}, indentation '${indentation}', params ${YamlTemplate.mapToString(params)}`);

        let fileContent = readFileSync(filePath, 'utf8');
        fileContent = fileContent.split('\n')
            .map(value => indentation + value)
            .join('\n');

        return this.evaluate(dirname(filePath), fileContent, params);
    }

    private static mapToString(params: Map<string, string>): string {
        return Array.from(params.entries()).map(value => value.join("=")).join(",");
    };

}

/**
 * Loads the specified yaml file recursively and resolves the template placeholders.
 *
 * @see resolveVars
 * @see resolveFiles
 *
 * @param filePath file absolute path
 * @param params sls variable name -> value map. E.g. Map { '(foo' => 'bar', 'stage' => 'test)' }
 * @return yaml object
 */
export const load = function (filePath: string, params?: Map<string, string>): string {
    return yamlLoad(new YamlTemplate().loadFile(filePath, params));
};

/**
 * Dump yaml object
 * @param yaml
 * @return string representation of the yaml object
 */
export const dump = function (yaml): string {
    return yamlDump(yaml);
};