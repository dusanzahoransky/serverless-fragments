import {readFileSync} from 'fs'
import {basename, dirname, join} from 'path'
import {dump as yamlDump, load as yamlLoad} from 'js-yaml';
import {VariablesMatcher} from "./VariablesMatcher";

export class YamlTemplate {

    public evaluate(dir: string, content: string, params: Map<string, string> = new Map()): string {

        content = this.resolveVars(content, params);
        content = this.resolveFiles(content, dir);

        return content;
    };

    /**
     * Matches all cmd params ${opt:foo} or variables ${self:custom.bar}
     * and replaces them if there are matching params in the map (matching key e.g. foo or bar)
     * @param content content with params
     * @param params params key - value
     */
    public resolveVars(content: string, params: Map<string, string> = new Map()) {
        return content.split('\n')
            .map(line => this.replaceVars(line, params))
            .join('\n');
    }


    /**
     * Locates and replace variables recursively if a matching parameter exists.
     * * supports multiple params on s single line e.g. ${opt:foo}-${opt:bar}
     * * supports nested variables ${opt:foo-${opt:bar}}
     * @param value a single line string
     * @param params
     */
    private replaceVars(value: string, params: Map<string, string>): string {
        const variablesMatcher = new VariablesMatcher(value);

        for (let variable of variablesMatcher) {
            const paramName = /\${(opt|self):(.+)}/.exec(variable)[2];  //extract the variable name
            const paramValue = params.get(paramName);
            if (paramValue) {
                console.log(`Resolving ${variable} => ${paramValue}`);
                value = value.replace(variable, paramValue);
            }
        }

        return value;
    }

    /**
     * Matches all file params ${tfile(a/b/c.yml)(foo=bar,stage=test)} with optional parameters
     * and replaces them with loaded content recursively.
     * It appends the indentation to every line of resolved file, based on the whitespaces before $file declaration
     * @param content content with params
     * @param dir current directory absolute path
     */
    public resolveFiles(content: string, dir: string) {
        const paramRegexpStr = '([\\t ]*)\\${tfile:([^:]+)(:(.*))?}';
        const paramRegexp = new RegExp(paramRegexpStr, 'g');  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const [, indentation, filePath, , params] = new RegExp(paramRegexpStr).exec(match);  //stateful RegExps, so need new instance
            return this.loadFile(join(dir, filePath), this.toMap(params), indentation)
        });
        return content;
    }

    /**
     * Converts nameValue pairs of params from string to Map.
     * E.g. 'foo =bar,stage = test' will become a Map { '(foo' => 'bar', 'stage' => 'test)' }
     * @param params comma separated params with name and value
     */
    public toMap(params: string = ''): Map<string, string> {
        const paramMap = new Map();

        params.split(",").forEach(nameValuePair => {
            const [name, value] = nameValuePair.split("=");
            if (name && value) {
                paramMap.set(name.trim(), value.trim());
            }
        });

        return paramMap;
    }

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
 * Loads the specified yaml file recursively and resolves the params. Resolves serverless variables matched with params.
 *
 * Top level files as well as nested files do not need to be valid yaml files,
 * only the final structure after the template files are recursively loaded has to be a valid yaml.
 *
 * A scope of the params is only the top level file, nested files have to be loaded with own params definition.
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
export const dump = function (yaml) : string {
    return yamlDump(yaml);
};