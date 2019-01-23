import {readFileSync} from 'fs'
import {dirname, join} from 'path'

export class YamlTemplate {

    public load = (dir: string, content: string, params: Map<string, string>): string => {

        //TODO shall we load files recursively first, or do params replacement first?
        //TODO if we load files first a top level file params will apply to nested files as well, if it a nice feature or a bad scoping practice?

        content = this.replaceVars(content, params);
        content = this.replaceFiles(content, dir);

        return content;
    };

    /**
     * Matches all cmd params ${opt:foo} or custom variables ${custom:bar}
     * and replaces them if there are matching params in the map (matching key e.g. foo or bar)
     * @param content content with params
     * @param params params key - value
     */
    public replaceVars(content: string, params: Map<string, string>) {
        const paramRegexpStr = '\\${(opt|custom):(.+)}';
        const paramRegexp = new RegExp(paramRegexpStr, 'g');  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const paramName = new RegExp(paramRegexpStr).exec(match)[2];  //stateful RegExps, so need new instance
            const paramValue = params.get(paramName);
            if (paramValue) {
                return paramValue;
            } else {
                return match;
            }
        });
        return content;
    }

    /**
     * Matches all file params ${file:a/b/c.yml}(foo=bar,stage=test) with parameters
     * and replaces them with loaded content recursively
     * @param content content with params
     * @param dir current directory absolute path
     */
    public replaceFiles(content: string, dir: string) {
        const paramRegexpStr = '\\${file:(.+)}\\((.+)\\)';
        const paramRegexp = new RegExp(paramRegexpStr, 'g');  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const matchParts = new RegExp(paramRegexpStr).exec(match);  //stateful RegExps, so need new instance

            const filePath = matchParts[1];
            const params = matchParts[2];

            const paramMap = this.toMap(params);

            return this.loadFile(join(dir, filePath), paramMap)
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

        params.split(",").forEach( nameValuePair => {
            const nameValue = nameValuePair.split("=");
            if (nameValue.length == 2) {
                paramMap.set(nameValue[0].trim(), nameValue[1].trim());
            }
        });

        return paramMap;
    }

    public loadFile (filePath, params = new Map()): string {
        return this.load(dirname(filePath), readFileSync(filePath, 'utf8'), params);
    }
}