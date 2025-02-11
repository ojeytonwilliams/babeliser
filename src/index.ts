import { parse, ParserOptions } from "@babel/parser";
// import * as generator from "@babel/generator";
import { default as generate } from "@babel/generator";
import { GeneratorOptions } from "babel__generator";
import {
  ArrowFunctionExpression,
  assertArrowFunctionExpression,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  ImportDeclaration,
  is,
  Node,
  VariableDeclaration,
} from "@babel/types";

type BabeliserOptions = { maxScopeDepth: number };
type Scope = Array<string>;

export class Babeliser {
  public parsedCode: ReturnType<typeof parse>;
  private maxScopeDepth = 4;
  constructor(
    codeString: string,
    options?: Partial<ParserOptions & BabeliserOptions>
  ) {
    this.parsedCode = parse(codeString, {
      sourceType: "module",
      ...options,
    });
    if (options?.maxScopeDepth) {
      this.maxScopeDepth = options.maxScopeDepth;
    }
  }
  public getArrowFunctionExpressions() {
    const arrowFunctionDeclarations = this._recurseBodiesForType<
      ArrowFunctionExpression & { scope: Scope }
    >("ArrowFunctionExpression");
    return arrowFunctionDeclarations;
  }
  public getExpressionStatements() {
    const expressionStatements = this._recurseBodiesForType<
      ExpressionStatement & { scope: Scope }
    >("ExpressionStatement");
    return expressionStatements;
  }
  public getFunctionDeclarations() {
    const functionDeclarations = this._recurseBodiesForType<
      FunctionDeclaration & { scope: Scope }
    >("FunctionDeclaration");
    return functionDeclarations;
  }
  public getImportDeclarations() {
    const expressionStatements = this._recurseBodiesForType<
      ImportDeclaration & { scope: Scope }
    >("ImportDeclaration");
    return expressionStatements;
  }
  public getType<T>(type: string) {
    return this._recurseBodiesForType<T & { scope: Scope }>(type);
  }
  public getVariableDeclarations() {
    const variableDeclarations = this._recurseBodiesForType<
      VariableDeclaration & { scope: Scope }
    >("VariableDeclaration");
    return variableDeclarations;
  }

  public getExpressionStatement(
    name: string,
    scope: Scope = ["global"]
  ): (ExpressionStatement & { scope: Scope }) | undefined {
    const expressionStatements = this.getExpressionStatements().filter((a) =>
      this._isInScope(a.scope, scope)
    );
    const expressionStatement = expressionStatements.find((e) => {
      const expression = e.expression;
      if (is("CallExpression", expression)) {
        if (name.includes(".")) {
          const [objectName, methodName] = name.split(".");
          const memberExpression = expression.callee;
          if (is("MemberExpression", memberExpression)) {
            const object = memberExpression.object;
            const property = memberExpression.property;
            if (is("Identifier", object) && is("Identifier", property)) {
              return object.name === objectName && property.name === methodName;
            }
          }
        }
        const identifier = expression.callee;
        if (is("Identifier", identifier) && identifier.name === name) {
          return true;
        }
      }
      if (is("AwaitExpression", expression)) {
        const callExpression = expression.argument;
        if (is("CallExpression", callExpression)) {
          const identifier = callExpression.callee;
          if (is("Identifier", identifier)) {
            return identifier.name === name;
          }
        }
      }
      return false;
    });
    return expressionStatement;
  }

  public generateCode(ast: Node, options?: GeneratorOptions) {
    // console.log(generator);
    // return generator.default(ast, options).code;
    return generate(ast, options).code;
  }

  private _isInScope(scope: Scope, targetScope: Scope = ["global"]): boolean {
    if (targetScope.length === 1 && targetScope[0] === "global") {
      return true;
    }
    if (scope.length < targetScope.length) {
      return false;
    }
    const scopeString = scope.join(".");
    const targetScopeString = targetScope.join(".");
    return scopeString.includes(targetScopeString);
  }

  private _recurseBodiesForType<T>(type: string): Array<T> {
    const body = this.parsedCode.program.body;
    const types = [];
    for (const bod of body) {
      const a = this._recurse(bod, (a) => a?.type === type, ["global"]);
      if (a?.length) {
        types.push(...a);
      }
    }
    return types;
  }

  private _recurse(
    val: unknown,
    returnCondition: (...args: any) => boolean,
    scope: Array<string>
  ) {
    if (scope.length >= this.maxScopeDepth) {
      return;
    }
    const matches = [];
    if (val && typeof val === "object") {
      if (!Array.isArray(val)) {
        // @ts-ignore Force it.
        val.scope = scope;
      }
      if (returnCondition(val)) {
        matches.push(val);
      }

      let currentScope = [...scope];
      const nearestIdentifier: undefined | Identifier = Object.entries(
        val
      ).find(([_k, v]) => v?.type === "Identifier")?.[1];
      if (nearestIdentifier) {
        currentScope.push(nearestIdentifier.name);
      }

      for (const [_k, v] of Object.entries(val)) {
        const mat = this._recurse(v, returnCondition, currentScope);
        const toPush = mat?.filter(Boolean).flat();
        if (toPush?.length) {
          matches.push(...toPush.flat());
        }
      }
    }
    return matches;
  }
}

function assertNot<T>(x: any, tString: string): x is T {
  if (x.type === tString) {
    return false;
  }
  return true;
}

function contains<T>(x: any, elem: string): x is T {
  if (typeof x === "object") {
    return Object.hasOwn(x, elem);
  }
  return false;
}
