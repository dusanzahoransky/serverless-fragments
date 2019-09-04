import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";

export type Token = {
    index: number;
    type: TokenType;
    indentation?: string;   // only for tfile start token
};

export enum TokenType {
    VAR_OPT_START = "VAR_OPT_START",
    VAR_SELF_START = "VAR_SELF_START",
    VAR_END = "VAR_END",
    T_FILE_START = "T_FILE_START",
    T_FILE_END = "T_FILE_END"
}

export type Placeholder = {
    placeholder: string
};
export type Variable = Placeholder & {
    paramName: string
    defaultValue: string
};
export type TFile = Placeholder & {
    filePath: string,
    params: Map<string, string>
};
export type ReplaceResult = {
    value: string
    nextIndex: number
};

/**
 * A stateless template processor.
 */
export class FragmentsProcessor {

    private static readonly VAR_START_TOKENS = [TokenType.VAR_OPT_START, TokenType.VAR_SELF_START];
    private static readonly START_TOKENS = FragmentsProcessor.VAR_START_TOKENS.concat(TokenType.T_FILE_START);


    static lastTokenType(lastStartTokens: Array<Token>): TokenType | undefined {
        const lastToken = lastStartTokens[lastStartTokens.length - 1];
        return lastToken ? lastToken.type : undefined;
    }

    /**
     * Locates and replace variables recursively if a matching parameter exists.
     * * supports multiple params on s single line e.g. ${opt:foo}-${opt:bar}
     * * supports nested variables ${opt:foo-${opt:bar}}
     */
    static resolveTokensRecursive(dir: string, value: string, params: Map<string, string> = new Map(), tokensStack: Array<Token> = [], level: number = 0): ReplaceResult {

        // console.log( `${level}:${FragmentsProcessor.printStack(tokensStack)}`);

        let currentToken = tokensStack[tokensStack.length - 1];
        let previousToken = currentToken;

        while ((currentToken = this.nextToken(value, currentToken, tokensStack))) {

            switch (currentToken.type) {
                case TokenType.T_FILE_START:
                    tokensStack.push(currentToken);
                    break;
                case TokenType.T_FILE_END:
                    if (this.lastTokenType(tokensStack) === TokenType.T_FILE_START) {
                        const lastTFileStartToken = tokensStack.pop();
                        const res = this.replaceTFile(dir, value, lastTFileStartToken.index, currentToken.index, lastTFileStartToken.indentation, params, level);
                        value = res.value;
                        currentToken.index = res.nextIndex;
                    }
                    break;
                case TokenType.VAR_OPT_START:
                case TokenType.VAR_SELF_START:
                    if (this.VAR_START_TOKENS.includes(this.lastTokenType(tokensStack))) {
                        tokensStack.push(currentToken);
                        const res =  this.resolveTokensRecursive(dir, value, params, tokensStack, ++level);
                        value = res.value;
                        currentToken.index = res.nextIndex;
                        --level;
                    } else {
                        tokensStack.push(currentToken);
                    }
                    break;
                case TokenType.VAR_END:
                    if (this.VAR_START_TOKENS.includes(this.lastTokenType(tokensStack))) {
                        const lastVarStartToken = tokensStack.pop();
                        const res = this.replaceVariable(value, lastVarStartToken.index, currentToken.index, params);
                        value = res.value;
                        currentToken.index = res.nextIndex;
                    }
                    break;
            }
            previousToken = currentToken;
        }

        return {value, nextIndex: previousToken ? previousToken.index: 0};
    }

    private static printStack(tokensStack: Array<Token>): string {
        return tokensStack.map(t => `${t.type}:${t.index}`).join(', ');
    }

    /**
     * Matches all file params ${tfile(a/b/c.yml)(foo=bar,stage=test)} with optional parameters
     * and replaces them with loaded content recursively.
     * It appends the indentation to every line of resolved file, based on the whitespaces before $file declaration
     *
     * file name can not contain characters '}', ':'
     * parameter names can not contain characters ',' or '='
     */
    static replaceTFile(dir: string, value: string, startIndex: number, endIndex: number, indentation: string, params: Map<string, string>, level: number = 0): ReplaceResult {
        const tFile = this.extractTFile(value, startIndex, endIndex);

        const absoluteFilePath = join(dir, tFile.filePath);
        const mergedParams = new Map([...params, ...tFile.params]);
        console.log(`Loading ${basename(dirname(absoluteFilePath))}/${basename(absoluteFilePath)}(${this.mapToString(mergedParams)}), indented ${indentation.length}x' ', `);

        let fileContent = readFileSync(absoluteFilePath, "utf8");

        // convert json files content to yaml which allows us to e.g. keep configuration as JSON to be easily readable from js code as well
        if (tFile.filePath.endsWith(".json")) {
            fileContent = yamlDump(JSON.parse(fileContent));
        }

        fileContent = fileContent.split("\n")
            .map((value, index) => index != 0 ? indentation + value : value)
            .join("\n");

        const res = this.resolveTokensRecursive(dir, fileContent, mergedParams, [], 0);
        value = value.replace(tFile.placeholder, res.value);

        return { value, nextIndex: startIndex + res.value.length};
    }

    static extractTFile(value: string, startIndex: number, endIndex: number): TFile {
        const tFilePlaceholder = value.substr(startIndex, endIndex - startIndex + 1);
        const [placeholder, filePath, , params] = /\${tfile:([^:}]+)\s*(:[\s]*(.+)[\s]*)?}:?/gm.exec(tFilePlaceholder);
        return { placeholder, filePath, params: this.toMap(params) };
    }

    static replaceVariable(value: string, startIndex: number, endIndex: number, params: Map<string, string>): ReplaceResult {
        const variable = this.extractVariable(value, startIndex, endIndex);

        if (!variable) {
            return {value, nextIndex: endIndex};
        }

        const paramValue = params.get(variable.paramName);

        let replacement;
        if (paramValue) {
            replacement = paramValue;
        } else if (variable.defaultValue != undefined) {
            replacement = variable.defaultValue;
        } else{
            return {value, nextIndex: endIndex};
        }

        console.log(`\t ${variable.placeholder} => ${replacement}`);
        value = value.replace(variable.placeholder, replacement);
        return {value, nextIndex: startIndex + replacement.length -1};
    }

    static extractVariable(value: string, startIndex: number, endIndex: number): Variable | undefined {
        const placeholderValue = value.substr(startIndex, endIndex - startIndex + 1);
        // match a placeholder e.g. ${opt:stage, test}
        const [placeholder, , paramName, , defaultValue] = /\${(opt|self):([^,]+)(\s*,\s*(\S*)\s*)?}/gm.exec(placeholderValue);
        return placeholder ? { placeholder, paramName, defaultValue } : undefined;
    }

    static nextToken(value: string, currentToken: Token, lastStartTokens: Array<Token> = [], filterTypes?: Array<TokenType>): Token | undefined {

        const startIndex = currentToken ? currentToken.index + 1 : 0;
        let insideOfComment = false;

        for (let index = startIndex; index < value.length; index++) {
            switch (value.charAt(index)) {
                case "\n":
                    insideOfComment = false;
                    break;
                case "#":
                    insideOfComment = true;
                    break;
                case "}":
                    if (insideOfComment) {
                        break;
                    }
                    if (!this.START_TOKENS.includes(this.lastTokenType(lastStartTokens))) {
                        break;
                    }
                    const type = this.lastTokenType(lastStartTokens) === TokenType.T_FILE_START ? TokenType.T_FILE_END : TokenType.VAR_END;
                    if (!filterTypes || filterTypes.includes(type)) {
                        if (type === TokenType.T_FILE_END && value.charAt(index + 1) === ":") {
                            return { index: index + 1, type };
                        }
                        return { index, type };
                    }
                    break;
                case "$":
                    if (insideOfComment) {
                        break;
                    }
                    const lookahead = value.substring(index);
                    if (lookahead.startsWith("${opt")) {
                        if (!filterTypes || filterTypes.includes(TokenType.VAR_OPT_START)) {
                            return { index, type: TokenType.VAR_OPT_START };
                        }
                    }
                    if (lookahead.startsWith("${self")) {
                        if (!filterTypes || filterTypes.includes(TokenType.VAR_SELF_START)) {
                            return { index, type: TokenType.VAR_SELF_START };
                        }
                    }
                    if (lookahead.startsWith("${tfile")) {
                        if (!filterTypes || filterTypes.includes(TokenType.T_FILE_START)) {
                            const lastNewLineIndex = value.substring(0, index).lastIndexOf('\n');
                            const currentLine = value.substring(lastNewLineIndex + 1, index);
                            const indentation = currentLine.match(/[\t ]*/)[0];
                            return { index, type: TokenType.T_FILE_START, indentation: (indentation ? indentation : "") };
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
    static toMap(params: string = ""): Map<string, string> {
        const paramMap = new Map();

        params.split(",").forEach(nameValuePair => {
            const [name, value] = nameValuePair.split("=").map(s => s.trim());
            if (name && value) {
                paramMap.set(name, value);
            }
        });

        return paramMap;
    }

    static mapToString(params: Map<string, string>): string {
        return Array.from(params.entries()).map(value => value.join("=")).join(",");
    }

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
export const load = function (filePath: string, params: Map<string, string> = new Map(), debug: boolean = false): string {

    let paramName;
    for (const arg of process.argv) {
        if (arg.startsWith("--")) {
            paramName = arg.substring(2);
        } else if (paramName) {
            params.set(paramName, arg);
            paramName = undefined;
        }
    }

    console.log(`Processing ${filePath}, params (${FragmentsProcessor.mapToString(params)})`);
    const resolvedTemplate = FragmentsProcessor.resolveTokensRecursive(dirname(filePath), readFileSync(filePath, "utf8"), params);

    if (debug) {
        const spaceCount = (lines: Array<string>) => lines.length.toString().length + 1;
        console.log(resolvedTemplate.value
            .split("\n")
            .map((line, index, lines) => `${(index + 1).toString().padStart(spaceCount(lines))}:${line}`) // add line numbers so we can easily find a serverless exception source
            .join("\n"));
    }

    writeFileSync(`${dirname(filePath)}/serverless.yml`,
        `# Generated by https://www.npmjs.com/package/serverless-fragments.
# Do not edit this file directly but serverless.js.

${resolvedTemplate.value}
`);

    return yamlLoad(resolvedTemplate.value);
};

/**
 * Dump yaml object
 * @param yaml
 * @return string representation of the yaml object
 */
export const dump = function (yaml): string {
    return yamlDump(yaml);
};