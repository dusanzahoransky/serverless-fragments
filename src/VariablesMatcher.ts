/**
 * Stateful matcher for serverless variables.
 * * supports multiple params on s single line e.g. ${opt:foo}-${opt:bar}
 * * supports nested variables ${opt:foo-${opt:bar}}
 */
export class VariablesMatcher implements IterableIterator<string> {
    private readonly value: string;
    private indexes;

    public constructor(value: string) {
        this.value = value;
    }

    [Symbol.iterator](): IterableIterator<string> {
        this.indexes = this.locateVarsRecursive(this.value);
        return this;
    }

    public next(): IteratorResult<string> {
        if (this.indexes.length == 0) {
            return {done: true, value: null};
        }
        const [startIndex, endIndex] = this.indexes.shift();
        return {
            done: false,
            value: this.value.substr(startIndex, endIndex - startIndex + 1)
        };
    }

    public locateVarsRecursive(value: string, locatedAfterIndex: number = -1): Array<number[]> {
        let startToken = VariablesMatcher.nextStartToken(value, locatedAfterIndex);
        if (startToken == -1) return [];

        //check if the closest token is another start index (nested variables) or end index
        let nextStartToken = VariablesMatcher.nextStartToken(value, startToken);
        const endToken = VariablesMatcher.nextEndToken(value, startToken);

        if (endToken == -1) { //no variable found, end token is missing e.g. ${opt:bar
            return [];
        }

        if (nextStartToken == -1) { //no other variables found, return the current match
            return [[startToken, endToken]];
        }

        if (nextStartToken > endToken) {  //no nested variable, next variable starts after this match
            return [[startToken, endToken]].concat(this.locateVarsRecursive(value, endToken));
        }

        //nested variables, let's extract the child variable first
        const nestedVars = this.locateVarsRecursive(value, startToken);
        if (nestedVars.length > 0) {
            const endToken = VariablesMatcher.nextEndToken(value, nestedVars[nestedVars.length - 1][1]);
            return nestedVars.concat([[startToken, endToken]]);
        } else {
            return [[startToken, endToken]];
        }
    }

    private static nextStartToken(value: string, locatedAfterIndex: number = -1): number {
        const optStartIndex = value.indexOf('${opt:', locatedAfterIndex + 1);
        const selfStartIndex = value.indexOf('${self:', locatedAfterIndex + 1);

        if (optStartIndex == -1) {
            return selfStartIndex;
        }
        if (selfStartIndex == -1) {
            return optStartIndex;
        }
        return optStartIndex < selfStartIndex ? optStartIndex : selfStartIndex;
    }

    private static nextEndToken(value: string, locatedAfterIndex: number = -1): number {
        return value.indexOf('}', locatedAfterIndex + 1);
    }

}