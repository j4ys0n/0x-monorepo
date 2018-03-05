declare module 'solidity-parser-sc' {
    export type AST = any;
    export function parse(sourceCode: string): AST;
}
