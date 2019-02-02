import {VariablesMatcher} from "../src/VariablesMatcher";

describe("Variables matcher tests", () => {

    it("locates a single opt variable", () => {
        const varsIterator = new VariablesMatcher('name : ${opt:foo}-bar')[Symbol.iterator]();
        expect(varsIterator.next()).toEqual({'done': true, 'value': '${opt:foo}'});
    });

    it("locates a single self variable", () => {
        const varsIterator = new VariablesMatcher('name : ${self:foo}-bar')[Symbol.iterator]();
        expect(varsIterator.next()).toEqual({'done': true, 'value': '${self:foo}'});
    });

    it("locates a multiple variables", () => {
        const varsIterator = new VariablesMatcher('name : ${self:foo}${opt:bar}Service')[Symbol.iterator]();
        expect(varsIterator.next()).toEqual({'done': false, 'value': '${self:foo}'});
        expect(varsIterator.next()).toEqual({'done': false, 'value': '${opt:bar}'} );
    });

    it("locates a nested variables", () => {
        const varsIterator = new VariablesMatcher('name : ${self:foo${opt:bar}}Service')[Symbol.iterator]();
        expect(varsIterator.next()).toEqual({'done': false, 'value': '${opt:bar}'});
        expect(varsIterator.next()).toEqual({'done': true, 'value': '${self:foo${opt:bar}}'} );
    });

});