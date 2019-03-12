import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { Placeholder } from "../dist/src/ReusableServerlessTemplate";

export type Token = {
    index: number;
    type: TokenType;
    indentation?: string;   //only for tfile start token
}

export enum TokenType {
    VAR_OPT_START = "VAR_OPT_START",
    VAR_SELF_START = "VAR_SELF_START",
    VAR_END = "VAR_END",
    T_FILE_START = "T_FILE_START",
    T_FILE_END = "T_FILE_END"
}

export type Placeholder = {
    placeholder: string
}
export type Variable = Placeholder & {
    paramName: string
}
export type TFile = Placeholder & {
    filePath: string,
    params: Map<string, string>
}

/**
 * A stateless template processor.
 */
export class ReusableServerlessTemplate {

    private static readonly VAR_START_TOKENS = [TokenType.VAR_OPT_START, TokenType.VAR_SELF_START];
    private static readonly START_TOKENS = ReusableServerlessTemplate.VAR_START_TOKENS.concat(TokenType.T_FILE_START);


    static lastTokenType(lastStartTokens: Array<Token>): TokenType | undefined {
        const lastToken = lastStartTokens[lastStartTokens.length - 1];
        return lastToken ? lastToken.type : undefined;
    }

    /**
     * Locates and replace variables recursively if a matching parameter exists.
     * * supports multiple params on s single line e.g. ${opt:foo}-${opt:bar}
     * * supports nested variables ${opt:foo-${opt:bar}}
     */
    static resolveTokensRecursive(dir: string, value: string, params: Map<string, string> = new Map(), lastStartTokens: Array<Token> = []): string {

        let currentToken = lastStartTokens[lastStartTokens.length - 1];

        while ((currentToken = this.nextToken(value, currentToken, lastStartTokens))) {

            switch (currentToken.type) {
                case TokenType.T_FILE_START:
                    lastStartTokens.push(currentToken);
                    break;
                case TokenType.T_FILE_END:
                    if (this.lastTokenType(lastStartTokens) === TokenType.T_FILE_START) {
                        const lastTFileStartToken = lastStartTokens.pop();
                        value = this.replaceTFile(dir, value, lastTFileStartToken.index, currentToken.index, lastTFileStartToken.indentation);
                        currentToken = lastTFileStartToken;
                    }
                    break;
                case TokenType.VAR_OPT_START:
                case TokenType.VAR_SELF_START:
                    if (this.VAR_START_TOKENS.includes(this.lastTokenType(lastStartTokens))) {
                        lastStartTokens.push(currentToken);
                        value = this.resolveTokensRecursive(dir, value, params, lastStartTokens);
                    } else {
                        lastStartTokens.push(currentToken);
                    }
                    break;
                case TokenType.VAR_END:
                    if (this.VAR_START_TOKENS.includes(this.lastTokenType(lastStartTokens))) {
                        const lastVarStartToken = lastStartTokens.pop();
                        if (this.matchParameter(value, lastVarStartToken.index, currentToken.index, params)) {
                            value = this.replaceVariable(value, lastVarStartToken.index, currentToken.index, params);
                            currentToken = lastVarStartToken;  //reset the index to the start of the variable
                        }
                    }
                    break;
            }
        }

        return value;
    }

    /**
     * Matches all file params ${tfile(a/b/c.yml)(foo=bar,stage=test)} with optional parameters
     * and replaces them with loaded content recursively.
     * It appends the indentation to every line of resolved file, based on the whitespaces before $file declaration
     *
     * file name can not contain characters '}', ':'
     * parameter names can not contain characters ',' or '='
     */
    static replaceTFile(dir: string, value: string, startIndex: number, endIndex: number, indentation: string): string {
        const tFile = this.extractTFile(value, startIndex, endIndex);

        const absoluteFilePath = join(dir, tFile.filePath);
        console.log(`Loading ${basename(absoluteFilePath)}(${this.mapToString(tFile.params)}), indented ${indentation.length}x' ', `);

        let fileContent = readFileSync(absoluteFilePath, 'utf8');

        //convert json files content to yaml which allows us to e.g. keep configuration as JSON to be easily readable from js code as well
        if (tFile.filePath.endsWith('.json')) {
            fileContent = yamlDump(JSON.parse(fileContent));
        }

        fileContent = fileContent.split('\n')
            .map((value, index) => index != 0 ? indentation + value : value)
            .join('\n');

        return value.replace(tFile.placeholder, this.resolveTokensRecursive(dir, fileContent, tFile.params));
    }

    static extractTFile(value: string, startIndex: number, endIndex: number): TFile {
        const tfilePlaceholder = value.substr(startIndex, endIndex - startIndex + 1);
        const [placeholder, filePath, , params] = /\${tfile:([^:}]+)(:(.+))?}/.exec(tfilePlaceholder);
        return {placeholder, filePath, params: this.toMap(params)};
    }

    static replaceVariable(value: string, startIndex: number, endIndex: number, params: Map<string, string>): string {
        const variable = this.extractVariable(value, startIndex, endIndex);
        const paramValue = params.get(variable.paramName);

        if (paramValue) {
            console.log(`\t ${variable.placeholder} => ${paramValue}`);
            value = value.replace(variable.placeholder, paramValue);
        }

        return value;
    }

    static matchParameter(value: string, startIndex: number, endIndex: number, params: Map<string, string>): boolean {
        const variable = this.extractVariable(value, startIndex, endIndex);
        return params.has(variable.paramName);

    }

    static extractVariable(value: string, startIndex: number, endIndex: number): Variable {
        const placeholder = value.substr(startIndex, endIndex - startIndex + 1);   //fullname ${opt:stage,test}
        const paramName = /\${(opt|self):([^,]+)(,.+)?}/.exec(placeholder)[2];  //param name stage
        return {placeholder, paramName};
    }

    static nextToken(value: string, currentToken: Token, lastStartTokens: Array<Token> = [], filterTypes?: Array<TokenType>): Token | undefined {

        const startIndex = currentToken ? currentToken.index + 1 : 0;
        let lastNewLineIndex = -1;
        let insideOfComment = false;

        for (let index = startIndex; index < value.length; index++) {
            switch (value.charAt(index)) {
                case '\n':
                    lastNewLineIndex = index;
                    insideOfComment = false;
                    break;
                case '#':
                    insideOfComment = true;
                    break;
                case '}':
                    if (insideOfComment) {
                        break;
                    }
                    if (!this.START_TOKENS.includes(this.lastTokenType(lastStartTokens))) {
                        break;
                    }
                    const type = this.lastTokenType(lastStartTokens) === TokenType.T_FILE_START ? TokenType.T_FILE_END : TokenType.VAR_END;
                    if (!filterTypes || filterTypes.includes(type)) {
                        return {index, type};
                    }
                    break;
                case '$':
                    if (insideOfComment) {
                        break;
                    }
                    const lookahead = value.substring(index);
                    if (lookahead.startsWith('${opt')) {
                        if (!filterTypes || filterTypes.includes(TokenType.VAR_OPT_START)) {
                            return {index, type: TokenType.VAR_OPT_START};
                        }
                    }
                    if (lookahead.startsWith('${self')) {
                        if (!filterTypes || filterTypes.includes(TokenType.VAR_SELF_START)) {
                            return {index, type: TokenType.VAR_SELF_START};
                        }
                    }
                    if (lookahead.startsWith('${tfile')) {
                        if (!filterTypes || filterTypes.includes(TokenType.T_FILE_START)) {
                            const currentLine = value.substring(lastNewLineIndex + 1, index);
                            const indentation = currentLine.match(/[\t ]*/)[0];
                            return {index, type: TokenType.T_FILE_START, indentation: (indentation ? indentation : '')};
                        }
                    }
                    break;
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
    const resolvedTemplate = ReusableServerlessTemplate.resolveTokensRecursive(dirname(filePath), readFileSync(filePath, 'utf8'), params);

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