import {readFileSync} from 'fs'
import {basename, dirname, join} from 'path'
import {load as yamlLoad, dump as yamlDump} from 'js-yaml';

export class YamlTemplate {

    public evaluate(dir: string, content: string, params: Map<string, string> = new Map()): string {

        //TODO shall we load files recursively first, or do params replacement first?
        //TODO if we load files first a top level file params will apply to nested files as well, if it a nice feature or a bad scoping practice?

        content = this.replaceVars(content, params);
        content = this.replaceFiles(content, dir);

        return content;
    };

    /**
     * Matches all cmd params ${opt:foo} or variables ${self:custom.bar}
     * and replaces them if there are matching params in the map (matching key e.g. foo or bar)
     * @param content content with params
     * @param params params key - value
     */
    public replaceVars(content: string, params: Map<string, string> = new Map()) {
        //supports double params e.g. ${opt:foo}-${opt:bar}
        //does not support nested constructions ${opt:foo-${opt:bar}}   - will only match bar parameter
        const paramRegexpStr = '\\${(opt|self):([^}]+)}';

        const paramRegexp = new RegExp(paramRegexpStr, 'g');  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const paramName = new RegExp(paramRegexpStr).exec(match)[2];  //stateful RegExps, so need new instance
            const paramValue = params.get(paramName);
            if (paramValue) {
                console.log(`Resolving ${match} => ${paramValue}`);
                return paramValue;
            } else {
                return match;
            }
        });
        return content;
    }

    /**
     * Matches all file params ${tfile(a/b/c.yml)(foo=bar,stage=test)} with optional parameters
     * and replaces them with loaded content recursively.
     * It appends the indentation to every line of resolved file, based on the whitespaces before $file declaration
     * @param content content with params
     * @param dir current directory absolute path
     */
    public replaceFiles(content: string, dir: string) {
        const paramRegexpStr = '([\\t ]*)\\${tfile:([^:]+)(:(.*))?}';
        const paramRegexp = new RegExp(paramRegexpStr, 'g');  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const matchParts = new RegExp(paramRegexpStr).exec(match);  //stateful RegExps, so need new instance

            const indentation = matchParts[1];
            const filePath = matchParts[2];
            const params = matchParts[4] ? matchParts[4] : '';  //optional params, group 4 can be undefined

            const paramMap = this.toMap(params);

            return this.loadFile(join(dir, filePath), paramMap, indentation)
        });
        return content;
    }

    /**
     * Converts nameValue pairs of params from string to Map.
     * E.g. 'foo =bar,stage = test' will become a Map { '(foo' => 'bar', 'stage' => 'test)' }
     * @param params comma separated params with name and value
     */
    public toMap(params: string): Map<string, string> {
        const paramMap = new Map();

        params.split(",").forEach(nameValuePair => {
            const nameValue = nameValuePair.split("=");
            if (nameValue.length == 2) {
                paramMap.set(nameValue[0].trim(), nameValue[1].trim());
            }
        });

        return paramMap;
    }

    public loadFile(filePath, params: Map<string, string> = new Map(), indentation: string = ''): string {

        console.log(`Loading ${basename(filePath)}, indentation '${indentation}', params ${YamlTemplate.mapToString(params)}`);

        let fileContent = readFileSync(filePath, 'utf8');
        fileContent = fileContent.split('\n')
            .map(value => indentation+value)
            .join('\n');

        return this.evaluate(dirname(filePath), fileContent, params);
    }

    private static mapToString(params: Map<string, string>): string {
        return Array.from(params.entries()).map(value => value.join("=")).join(",");
    };
}

export const load = function (filePath: string, params?: Map<string, string>) {
    return yamlLoad(new YamlTemplate().loadFile(filePath, params));
};
export const dump = function (yaml) {
    return yamlDump(yaml);
};