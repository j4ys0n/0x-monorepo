import * as _ from 'lodash';

import { LocationByOffset, SingleFileSourceRange } from './types';
// tslint:disable:ban-comma-operator no-unused-expression no-console
export class ASTVisitor {
    private _locationByOffset: LocationByOffset;
    public static prePosition(expression) {
        if (expression.right.type === 'ConditionalExpression' && expression.left.type === 'MemberExpression') {
            expression.start -= 2;
        }
    }
    constructor(locationByOffset: LocationByOffset) {
        this._locationByOffset = locationByOffset;
    }
    public visitAssignmentExpression(contract, expression) {
        if (expression.right.type === 'ConditionalExpression') {
            if (expression.left.type === 'DeclarativeExpression' || expression.left.type === 'Identifier') {
                this.visitConditionalExpression(contract, expression.right);
            } else if (expression.left.type === 'MemberExpression') {
                this.visitConditionalExpression(contract, expression.right);
            } else {
                const err = 'Error instrumenting assignment expression @ solidity-coverage/lib/instrumenter.js';
                console.log(err, contract, expression.left);
                process.exit();
            }
        }
    }
    public visitConditionalExpression(contract, expression) {
        // TODO
    }

    public visitStatement(contract, expression) {
        contract.statementId += 1;
        // We need to work out the lines and columns the expression starts and ends
        const loc = this._getExpressionRange(expression);
        const text = contract.instrumented.slice(expression.start, expression.end);

        contract.statementMap[contract.statementId] = {
            text, // TODO remove
            ...loc,
        };
    }

    public visitFunctionDeclaration(contract, expression) {
        contract.fnId += 1;
        const loc = this._getExpressionRange(expression);
        contract.fnMap[contract.fnId] = {
            name: expression.name,
            line: loc.start.line,
            loc,
        };
    }
    public visitAssertOrRequire(contract, expression) {
        // TODO
    }
    public visitIfStatement(contract, expression) {
        contract.branchId += 1;
        contract.branchMap[contract.branchId] = {
            line: this._getExpressionRange(expression).start.line,
            type: 'if',
            locations: [
                this._getExpressionRange(expression.consequent),
                this._getExpressionRange(expression.alternate || expression),
            ],
        };
    }
    private _getExpressionRange(expression): SingleFileSourceRange {
        const start = this._locationByOffset[expression.start];
        const end = this._locationByOffset[expression.end - 1];
        const range = {
            start,
            end,
        };
        return range;
    }
}
