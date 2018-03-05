import * as fs from 'fs';
import * as path from 'path';
import * as SolidityParser from 'solidity-parser-sc';

import { ASTVisitor } from './ast_visitor';
import { ASTWalker } from './ast_walker';
import { getLocationByOffset } from './source_maps';

export const instrumentSolidity = (contractSource: string, fileName: string) => {
    const contract: any = {};
    contract.source = contractSource;
    contract.instrumented = contractSource;

    contract.runnableLines = [];
    contract.fnMap = {};
    contract.fnId = 0;
    contract.branchMap = {};
    contract.branchId = 0;
    contract.statementMap = {};
    contract.statementId = 0;
    contract.injectionPoints = {};

    // First, we run over the original contract to get the source mapping.
    const ast = SolidityParser.parse(contract.source);
    fs.writeFileSync(`ast_${path.basename(fileName)}.json`, JSON.stringify(ast, null, 2));
    const locationByOffset = getLocationByOffset(contractSource);
    const astVisitor = new ASTVisitor(locationByOffset);
    const astWalker = new ASTWalker(astVisitor);
    astWalker.walk(contract, ast);
    const retValue = JSON.parse(JSON.stringify(contract));
    return retValue;
};
