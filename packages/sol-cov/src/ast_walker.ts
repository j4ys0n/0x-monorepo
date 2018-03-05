/**
 * Methods in this file walk the AST and call the instrumenter
 * functions where appropriate, which determine where to inject events.
 * (Listed in alphabetical order)
 */
import * as _ from 'lodash';

import { ASTVisitor } from './ast_visitor';
// tslint:disable:no-unused-expression
export class ASTWalker {
    private _astVisitor: ASTVisitor;
    constructor(astVisitor: ASTVisitor) {
        this._astVisitor = astVisitor;
    }
    public walk(contract, expression): void {
        if (!_.isUndefined(this[`_walk${expression.type}`])) {
            this[`_walk${expression.type}`](contract, expression);
        }
    }
    private _walkStateVariableDeclaration(contract, expression): void {
        this._astVisitor.visitStatement(contract, expression);
    }
    private _walkAssignmentExpression(contract, expression): void {
        this._astVisitor.visitAssignmentExpression(contract, expression);
    }
    private _walkBlockStatement(contract, expression): void {
        for (const statement of expression.body) {
            this.walk(contract, statement);
        }
    }
    private _walkCallExpression(contract, expression): void {
        // In any given chain of call expressions, only the head callee is an Identifier node
        if (expression.callee.type === 'Identifier') {
            if (expression.callee.name === 'assert' || expression.callee.name === 'require') {
                this._astVisitor.visitAssertOrRequire(contract, expression);
            }
        }
        this.walk(contract, expression.callee);
    }
    private _walkConditionalExpression(contract, expression): void {
        this._astVisitor.visitConditionalExpression(contract, expression);
    }
    private _walkContractStatement(contract, expression): void {
        this._walkContractOrLibraryStatement(contract, expression);
    }
    private _walkContractOrLibraryStatement(contract, expression): void {
        if (expression.body) {
            expression.body.forEach(this.walk.bind(this, contract));
        }
    }
    private _walkPlaceholderStatement(contract, expression) {
        this._astVisitor.visitStatement(contract, expression);
    }
    private _walkExpressionStatement(contract, expression) {
        this._astVisitor.visitStatement(contract, expression);
        this.walk(contract, expression.expression);
    }
    private _walkForStatement(contract, expression): void {
        this._astVisitor.visitStatement(contract, expression);
        this.walk(contract, expression.body);
    }
    private _walkFunctionDeclaration(contract, func): void {
        if (func.modifiers) {
            this.walk(contract, func.modifiers);
        }
        if (func.body) {
            this._astVisitor.visitFunctionDeclaration(contract, func);
            this.walk(contract, func.body);
        }
    }
    private _walkIfStatement(contract, expression): void {
        this._astVisitor.visitIfStatement(contract, expression);

        this.walk(contract, expression.consequent);

        if (expression.alternate) {
            this.walk(contract, expression.alternate);
        }
    }
    private _walkLibraryStatement(contract, expression): void {
        this._walkContractOrLibraryStatement(contract, expression);
    }
    private _walkMemberExpression(contract, expression): void {
        this.walk(contract, expression.object);
    }
    private _walkModifiers(contract, modifiers) {
        if (modifiers) {
            modifiers.forEach(modifier => {
                this.walk(contract, modifier);
            });
        }
    }
    private _walkModifierDeclaration(contract, expression): void {
        this._astVisitor.visitFunctionDeclaration(contract, expression);
        this.walk(contract, expression.body);
    }
    private _walkNewExpression(contract, expression): void {
        this.walk(contract, expression.callee);
    }
    private _walkProgram(contract, expression): void {
        expression.body.forEach(this.walk.bind(this, contract));
    }
    private _walkReturnStatement(contract, expression): void {
        this._astVisitor.visitStatement(contract, expression);
    }
    private _walkThrowStatement(contract, expression): void {
        this._astVisitor.visitStatement(contract, expression);
    }
    private _walkUnaryExpression(contract, expression): void {
        this.walk(contract, expression.argument);
    }
    private _walkUsingStatement(contract, expression): void {
        this.walk(contract, expression.for);
    }
    private _walkVariableDeclaration(contract, expression): void {
        this.walk(contract, expression.declarations[0].id);
    }
    private _walkVariableDeclarationTuple(contract, expression): void {
        this.walk(contract, expression.declarations[0].id);
    }
    private _walkWhileStatement(contract, expression): void {
        this._astVisitor.visitStatement(contract, expression);
        this.walk(contract, expression.body);
    }
}
