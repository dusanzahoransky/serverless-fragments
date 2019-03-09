import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';

export type Token = {
    index: number;
    type: TokenType;
}

export enum TokenType {
    VarStartOpt = "VarStartOpt",
    VarStartSelf = "VarStartSelf",
    VarEnd = "VarEnd",
    TFileStart = "TFileStart",
    TFileEnd = "TFileEnd"
}

export type Variable ={
    fullName: string,
    paramName: string
}

/**
 * A stateless template processor.
 */
export class ReusableServerlessTemplate {

    private static readonly VAR_START_TOKENS = [TokenType.VarStartOpt, TokenType.VarStartSelf];
    private static readonly VAR_TOKENS = ReusableServerlessTemplate.VAR_START_TOKENS.concat(TokenType.VarEnd);

    static evaluate(dir: string, content: string, params: Map<string, string> = new Map()): string {

        content = ReusableServerlessTemplate.resolveTokensRecursive(content, params);

        //FIXME reuse resolveTokensRecursive method to resolve files as well
        content =  content.split('\n')
            .map(line => this.resolveFilesRecursively(line, dir))
            .join('\n');

        return content;
    };

    /**
     * Matches all file params ${tfile(a/b/c.yml)(foo=bar,stage=test)} with optional parameters
     * and replaces them with loaded content recursively.
     * It appends the indentation to every line of resolved file, based on the whitespaces before $file declaration
     *
     * file name can not contain characters '}', ':'
     * parameter names can not contain characters ',' or '='
     *
     * @param content content with params
     * @param dir current directory absolute path
     */
    static resolveFilesRecursively(content: string, dir: string): string {
        //yaml comment, do not process
        if (ReusableServerlessTemplate.isCommentedLine(content)) {
            return content;
        }

        const paramRegexpStr = '([\\t ]*)\\${tfile:([^:}]+)(:(.+))?}';
        const paramRegexp = new RegExp(paramRegexpStr);  //global to find all occurrences

        content = content.replace(paramRegexp, (match) => {
            const [, indentation, filePath, , params] = new RegExp(paramRegexpStr).exec(match);  //stateful RegExps, so need new instance
            return this.loadFile(join(dir, filePath), this.toMap(params), indentation);
        });
        return content;
    }

    /**
     * Locates and replace variables recursively if a matching parameter exists.
     * * supports multiple params on s single line e.g. ${opt:foo}-${opt:bar}
     * * supports nested variables ${opt:foo-${opt:bar}}
     * @param value a single line string
     * @param params
     * @param startToken matched start token
     */
    static resolveTokensRecursive(value: string, params: Map<string, string>, startToken?: Token): string {

        if (!startToken){   //first run

            //yaml comment, do not process
            if (this.isCommentedLine(value)) {
                return value;
            }

            startToken = this.nextToken(value, undefined, this.VAR_START_TOKENS);

            if (!startToken) { //nothing to resolve here
                return value;
            }
        }

        let nextToken;
        let currentToken = startToken;

        while( (nextToken = this.nextToken(value, currentToken))){

            if(nextToken.type == TokenType.TFileStart){
                //TODO resolve tfile here too
            }

            if(nextToken.type == TokenType.TFileEnd){
                //TODO resolve tfile here too
            }

            if (this.VAR_START_TOKENS.includes(nextToken.type)) {
                //nexted variable e.g. ${self:custom-${opt:stage}} - resolve the inner variable first
                //TODO return the index where the nested resolver finished, if the variable has not been matched with params the next token will be the end token of the nested variable
                value = this.resolveTokensRecursive(value, params, nextToken);
                continue;
            }
            if(nextToken.type == TokenType.VarEnd){
                //end token: simple var - start - end token sequence e.g. ${opt:stage} - replace it if matches with any parameter
                if(this.matchParameter(value, startToken.index, nextToken.index, params)){
                    value = this.replaceVariable(value, startToken.index, nextToken.index, params);
                    nextToken = this.nextToken(value, startToken);
                } else{
                    nextToken = this.nextToken(value, nextToken);
                }
                if(!nextToken || nextToken.type === TokenType.VarEnd){   //end of the variable - end the recursion, go back to the parent
                    return value;
                }
                startToken = nextToken;
            }

            currentToken = nextToken;
         }

        return value;
    }

    private static isCommentedLine(value: string) {
        return value.match(/\s*#/);
    }

    static replaceVariable(value: string, startIndex: number, endIndex: number, params: Map<string, string>): string {
        const variable = this.extractVariable(value, startIndex, endIndex);
        const paramValue = params.get(variable.paramName);

        if (paramValue) {
            console.log(`\t ${variable.fullName} => ${paramValue}`);
            value = value.replace(variable.fullName, paramValue);
        }

        return value;
    }

    static matchParameter(value: string, startIndex: number, endIndex: number, params: Map<string, string>): boolean {
        const variable = this.extractVariable(value, startIndex, endIndex);
        return params.has(variable.paramName);

    }

    static extractVariable(value: string, startIndex: number, endIndex: number): Variable {
        const fullName = value.substr(startIndex, endIndex - startIndex + 1);   //fullname ${opt:stage}
        const paramName = /\${(opt|self):(.+)}/.exec(fullName)[2];  //param name stage
        return {fullName, paramName};
    }

    static nextToken(value: string, currentToken: Token, filterTypes?: Array<TokenType>): Token | undefined {

        const startIndex = currentToken? currentToken.index + 1 : 0;

        for (let index = startIndex; index < value.length; index++) {
            // noinspection FallThroughInSwitchStatementJS
            switch (value.charAt(index)) {
                case '}':
                    if(currentToken && currentToken.type != TokenType.TFileEnd && currentToken.type != TokenType.VarEnd){
                        const type = currentToken.type == TokenType.TFileStart? TokenType.TFileEnd : TokenType.VarEnd;
                        if (!filterTypes || filterTypes.includes(type)) {
                            return {index, type};
                        }
                    }
                case '$':
                    const lookahead = value.substring(index);
                    if (lookahead.startsWith('${opt')) {
                        if (!filterTypes || filterTypes.includes(TokenType.VarStartOpt)) {
                            return {index, type: TokenType.VarStartOpt};
                        }
                    }
                    if (lookahead.startsWith('${self')) {
                        if (!filterTypes || filterTypes.includes(TokenType.VarStartSelf)) {
                            return {index, type: TokenType.VarStartSelf};
                        }
                    }
                    if (lookahead.startsWith('${tfile')) {
                        if (!filterTypes || filterTypes.includes(TokenType.TFileStart)) {
                            return {index, type: TokenType.TFileStart};
                        }
                    }
            }
        }
    }

    /**
     * Converts nameValue pairs of params from string to Map.
     * E.g. 'foo =bar,stage= test' will become a Map { '(foo' => 'bar', 'stage' => 'test)' }
     * @param params comma-separated params with name and value
     */
    static toMap(params: string = ''): Map<string, string> {
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
    static loadFile(filePath: string, params: Map<string, string> = new Map(), indentation: string = ''): string {

        console.log(`Loading ${basename(filePath)}(${ReusableServerlessTemplate.mapToString(params)}), indented ${indentation.length}x' ', `);

        let fileContent = readFileSync(filePath, 'utf8');

        //convert json files content to yaml which allows us to e.g. keep configuration as JSON to be easily readable from js code as well
        if (filePath.endsWith('.json')) {
            fileContent = yamlDump(JSON.parse(fileContent));
        }

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
 * @param debug print the resolved template before converting to Yaml object
 * @return yaml object
 */
export const load = function (filePath: string, params?: Map<string, string>, debug: boolean = true): string {
    const resolvedTemplate = ReusableServerlessTemplate.loadFile(filePath, params);
    if (debug) {
        const spaceCount = (lines: Array<string>) => lines.length.toString().length + 1;
        console.log(resolvedTemplate
            .split('\n')
            .map((line, index, lines) => `${(index + 1).toString().padStart(spaceCount(lines))}:${line}`) //add line numbers so we can easily find a serverless exception source
            .join('\n'));
        writeFileSync(`${dirname(filePath)}/serverless.yml`,
            `# Generated by https://www.npmjs.com/package/reusable-serverless-template.
# Do not edit this file directly but serverless.js.

${resolvedTemplate}
`
        );
    }
    return yamlLoad(resolvedTemplate);
};

/**
 * Dump yaml object
 * @param yaml
 * @return string representation of the yaml object
 */
export const dump = function (yaml): string {
    return yamlDump(yaml);
};