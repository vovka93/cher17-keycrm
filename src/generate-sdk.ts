#!/usr/bin/env bun
import ts from "typescript";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { YAML } from "bun";

/* -------------------------------------------------- */
/* Utils                                              */
/* -------------------------------------------------- */

const f = ts.factory;

const id = (name: string) => f.createIdentifier(name);

function camelCase(s: string) {
  return s
    .replace(/[-_\/{}]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (m) => m.toLowerCase())
    .replace(/\s+/g, ""); // Remove all spaces
}

function pascalCase(s: string) {
  return s
    .replace(/[-_\/{}]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (m) => m.toUpperCase())
    .replace(/\s+/g, ""); // Remove all spaces
}

/* -------------------------------------------------- */
/* OpenAPI load                                       */
/* -------------------------------------------------- */

function loadOpenApi(path: string): any {
  const raw = readFileSync(path, "utf8");
  return path.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
}

/* -------------------------------------------------- */
/* Schema → Type                                      */
/* -------------------------------------------------- */

function schemaToType(schema: any): ts.TypeNode {
  if (!schema) return f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);

  if (schema.$ref) {
    return f.createTypeReferenceNode(schema.$ref.split("/").pop()!, undefined);
  }

  switch (schema.type) {
    case "string":
      return f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    case "number":
    case "integer":
      return f.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    case "boolean":
      return f.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
    case "array":
      return f.createArrayTypeNode(schemaToType(schema.items));
    case "object":
      if (!schema.properties) {
        return f.createTypeReferenceNode("Record", [
          f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        ]);
      }
      return f.createTypeLiteralNode(
        Object.entries(schema.properties).map(([k, v]: any) => {
          const isRequired = Array.isArray(schema.required) && schema.required.includes(k);

          // Check if key is valid JS identifier (allows underscores, letters, numbers, $)
          const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k);

          // Use string literal for invalid identifiers or Cyrillic
          const propertyName = isValidIdentifier
            ? k  // Keep original valid identifier
            : f.createStringLiteral(k);  // Quote invalid identifiers

          return f.createPropertySignature(
            undefined,
            propertyName,
            isRequired
              ? undefined
              : f.createToken(ts.SyntaxKind.QuestionToken),
            schemaToType(v),
          );
        }),
      );
    default:
      return f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
  }
}

/* -------------------------------------------------- */
/* Schema declarations                                */
/* -------------------------------------------------- */

function generateSchemas(openapi: any): ts.Statement[] {
  return Object.entries(openapi.components?.schemas ?? {}).map(
    ([name, schema]: any) =>
      f.createTypeAliasDeclaration(
        [f.createModifier(ts.SyntaxKind.ExportKeyword)],
        name,
        undefined,
        schemaToType(schema),
      ),
  );
}

/* -------------------------------------------------- */
/* Domain grouping                                    */
/* -------------------------------------------------- */

function groupByDomain(openapi: any): Map<string, Array<{ path: string; method: string; op: any }>> {
  const domains = new Map<string, Array<{ path: string; method: string; op: any }>>();

  for (const [path, item] of Object.entries<any>(openapi.paths ?? {})) {
    for (const [method, op] of Object.entries<any>(item)) {
      // Extract domain from tags or path
      const tag = op.tags?.[0] || path.split('/')[1] || 'default';
      const domain = pascalCase(tag);

      if (!domains.has(domain)) {
        domains.set(domain, []);
      }

      domains.get(domain)!.push({ path, method, op });
    }
  }

  return domains;
}

/* -------------------------------------------------- */
/* Domain service method                              */
/* -------------------------------------------------- */

function generateServiceMethod(path: string, method: string, op: any) {
  const name = op.operationId ?? camelCase(`${method}_${path}`);

  const responseSchema =
    op.responses?.["200"]?.content?.["application/json"]?.schema ??
    op.responses?.["201"]?.content?.["application/json"]?.schema;

  // Extract request body schema
  const requestBodySchema =
    op.requestBody?.content?.["application/json"]?.schema;

  // Extract path parameters
  const pathParams = path.match(/\{(\w+)\}/g)?.map(p => p.slice(1, -1)) || [];

  // Build parameters
  const params: ts.ParameterDeclaration[] = [];

  // Add path params
  pathParams.forEach(param => {
    params.push(
      f.createParameterDeclaration(
        undefined,
        undefined,
        param,
        undefined,
        f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      )
    );
  });

  // Add body param if needed
  if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
    params.push(
      f.createParameterDeclaration(
        undefined,
        undefined,
        "body",
        f.createToken(ts.SyntaxKind.QuestionToken),
        requestBodySchema
          ? schemaToType(requestBodySchema)
          : f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        undefined,
      )
    );
  }

  // Build path expression
  let pathExpr: ts.Expression = f.createStringLiteral(path);
  pathParams.forEach(param => {
    pathExpr = f.createCallExpression(
      f.createPropertyAccessExpression(pathExpr, "replace"),
      undefined,
      [
        f.createStringLiteral(`{${param}}`),
        id(param),
      ]
    );
  });

  return f.createMethodDeclaration(
    [f.createModifier(ts.SyntaxKind.AsyncKeyword)],
    undefined,
    name,
    undefined,
    undefined,
    params,
    f.createTypeReferenceNode("Promise", [
      responseSchema
        ? schemaToType(responseSchema)
        : f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
    ]),
    f.createBlock(
      [
        f.createReturnStatement(
          f.createCallExpression(
            f.createPropertyAccessExpression(
              f.createPropertyAccessExpression(f.createThis(), "client"),
              "request"
            ),
            undefined,
            [
              f.createStringLiteral(method.toUpperCase()),
              pathExpr,
              ['post', 'put', 'patch'].includes(method.toLowerCase())
                ? id("body")
                : f.createIdentifier("undefined"),
            ],
          ),
        ),
      ],
      true,
    ),
  );
}

/* -------------------------------------------------- */
/* Domain service class                               */
/* -------------------------------------------------- */

function generateDomainService(domain: string, operations: Array<{ path: string; method: string; op: any }>): ts.ClassDeclaration {
  const methods = operations.map(({ path, method, op }) =>
    generateServiceMethod(path, method, op)
  );

  return f.createClassDeclaration(
    [f.createModifier(ts.SyntaxKind.ExportKeyword)],
    `${domain}Service`,
    undefined,
    undefined,
    [
      f.createPropertyDeclaration(
        [f.createModifier(ts.SyntaxKind.PrivateKeyword)],
        "client",
        undefined,
        f.createTypeReferenceNode("ApiClient", undefined),
        undefined,
      ),
      f.createConstructorDeclaration(
        undefined,
        [
          f.createParameterDeclaration(
            undefined,
            undefined,
            "client",
            undefined,
            f.createTypeReferenceNode("ApiClient", undefined),
          ),
        ],
        f.createBlock(
          [
            f.createExpressionStatement(
              f.createBinaryExpression(
                f.createPropertyAccessExpression(f.createThis(), "client"),
                ts.SyntaxKind.EqualsToken,
                id("client"),
              ),
            ),
          ],
          true,
        ),
      ),
      ...methods,
    ],
  );
}

/* -------------------------------------------------- */
/* ApiClient with Bearer auth                         */
/* -------------------------------------------------- */

function generateApiClient(): ts.ClassDeclaration {
  const requestMethod = f.createMethodDeclaration(
    [f.createModifier(ts.SyntaxKind.AsyncKeyword)],
    undefined,
    "request",
    undefined,
    undefined,
    [
      f.createParameterDeclaration(
        undefined,
        undefined,
        "method",
        undefined,
        f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
      f.createParameterDeclaration(
        undefined,
        undefined,
        "path",
        undefined,
        f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
      f.createParameterDeclaration(
        undefined,
        undefined,
        "body",
        f.createToken(ts.SyntaxKind.QuestionToken),
        f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
        undefined,
      ),
    ],
    f.createTypeReferenceNode("Promise", [
      f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
    ]),
    f.createBlock(
      [
        f.createVariableStatement(
          undefined,
          f.createVariableDeclarationList(
            [
              f.createVariableDeclaration(
                "headers",
                undefined,
                f.createTypeReferenceNode("Record", [
                  f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                  f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                ]),
                f.createObjectLiteralExpression([
                  f.createPropertyAssignment(
                    f.createStringLiteral("Content-Type"),
                    f.createStringLiteral("application/json"),
                  ),
                ], true),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
        f.createIfStatement(
          f.createPropertyAccessExpression(f.createThis(), "token"),
          f.createBlock([
            f.createExpressionStatement(
              f.createBinaryExpression(
                f.createElementAccessExpression(
                  id("headers"),
                  f.createStringLiteral("Authorization")
                ),
                ts.SyntaxKind.EqualsToken,
                f.createTemplateExpression(
                  f.createTemplateHead("Bearer "),
                  [
                    f.createTemplateSpan(
                      f.createPropertyAccessExpression(f.createThis(), "token"),
                      f.createTemplateTail(""),
                    ),
                  ],
                ),
              ),
            ),
          ], true),
        ),
        f.createVariableStatement(
          undefined,
          f.createVariableDeclarationList(
            [
              f.createVariableDeclaration(
                "res",
                undefined,
                undefined,
                f.createAwaitExpression(
                  f.createCallExpression(id("fetch"), undefined, [
                    f.createBinaryExpression(
                      f.createPropertyAccessExpression(
                        f.createThis(),
                        "baseUrl",
                      ),
                      ts.SyntaxKind.PlusToken,
                      id("path"),
                    ),
                    f.createObjectLiteralExpression(
                      [
                        f.createPropertyAssignment("method", id("method")),
                        f.createShorthandPropertyAssignment("headers"),
                        f.createPropertyAssignment(
                          "body",
                          f.createConditionalExpression(
                            id("body"),
                            f.createToken(ts.SyntaxKind.QuestionToken),
                            f.createCallExpression(
                              f.createPropertyAccessExpression(
                                id("JSON"),
                                "stringify",
                              ),
                              undefined,
                              [id("body")],
                            ),
                            f.createToken(ts.SyntaxKind.ColonToken),
                            f.createIdentifier("undefined"),
                          ),
                        ),
                      ],
                      true,
                    ),
                  ]),
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
        f.createReturnStatement(
          f.createAwaitExpression(
            f.createCallExpression(
              f.createPropertyAccessExpression(id("res"), "json"),
              undefined,
              [],
            ),
          ),
        ),
      ],
      true,
    ),
  );

  return f.createClassDeclaration(
    [f.createModifier(ts.SyntaxKind.ExportKeyword)],
    "ApiClient",
    undefined,
    undefined,
    [
      f.createPropertyDeclaration(
        undefined,
        "baseUrl",
        undefined,
        f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined,
      ),
      f.createPropertyDeclaration(
        undefined,
        "token",
        f.createToken(ts.SyntaxKind.QuestionToken),
        f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        undefined,
      ),
      f.createConstructorDeclaration(
        undefined,
        [
          f.createParameterDeclaration(
            undefined,
            undefined,
            "baseUrl",
            undefined,
            f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          ),
          f.createParameterDeclaration(
            undefined,
            undefined,
            "token",
            f.createToken(ts.SyntaxKind.QuestionToken),
            f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            undefined,
          ),
        ],
        f.createBlock(
          [
            f.createExpressionStatement(
              f.createBinaryExpression(
                f.createPropertyAccessExpression(f.createThis(), "baseUrl"),
                ts.SyntaxKind.EqualsToken,
                id("baseUrl"),
              ),
            ),
            f.createExpressionStatement(
              f.createBinaryExpression(
                f.createPropertyAccessExpression(f.createThis(), "token"),
                ts.SyntaxKind.EqualsToken,
                id("token"),
              ),
            ),
          ],
          true,
        ),
      ),
      f.createMethodDeclaration(
        undefined,
        undefined,
        "setToken",
        undefined,
        undefined,
        [
          f.createParameterDeclaration(
            undefined,
            undefined,
            "token",
            undefined,
            f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          ),
        ],
        f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        f.createBlock(
          [
            f.createExpressionStatement(
              f.createBinaryExpression(
                f.createPropertyAccessExpression(f.createThis(), "token"),
                ts.SyntaxKind.EqualsToken,
                id("token"),
              ),
            ),
          ],
          true,
        ),
      ),
      requestMethod,
    ],
  );
}

/* -------------------------------------------------- */
/* Main SDK class                                     */
/* -------------------------------------------------- */

function generateMainSdk(domains: Map<string, any>): ts.ClassDeclaration {
  const serviceProperties: ts.PropertyDeclaration[] = [];
  const constructorAssignments: ts.Statement[] = [];

  for (const domain of domains.keys()) {
    const serviceName = camelCase(domain);

    serviceProperties.push(
      f.createPropertyDeclaration(
        [f.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
        serviceName,
        undefined,
        f.createTypeReferenceNode(`${domain}Service`, undefined),
        undefined,
      )
    );

    constructorAssignments.push(
      f.createExpressionStatement(
        f.createBinaryExpression(
          f.createPropertyAccessExpression(f.createThis(), serviceName),
          ts.SyntaxKind.EqualsToken,
          f.createNewExpression(
            f.createIdentifier(`${domain}Service`),
            undefined,
            [id("client")],
          ),
        ),
      ),
    );
  }

  return f.createClassDeclaration(
    [f.createModifier(ts.SyntaxKind.ExportKeyword)],
    "SDK",
    undefined,
    undefined,
    [
      f.createPropertyDeclaration(
        [f.createModifier(ts.SyntaxKind.PrivateKeyword)],
        "client",
        undefined,
        f.createTypeReferenceNode("ApiClient", undefined),
        undefined,
      ),
      ...serviceProperties,
      f.createConstructorDeclaration(
        undefined,
        [
          f.createParameterDeclaration(
            undefined,
            undefined,
            "baseUrl",
            undefined,
            f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          ),
          f.createParameterDeclaration(
            undefined,
            undefined,
            "token",
            f.createToken(ts.SyntaxKind.QuestionToken),
            f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
            undefined,
          ),
        ],
        f.createBlock(
          [
            f.createVariableStatement(
              undefined,
              f.createVariableDeclarationList(
                [
                  f.createVariableDeclaration(
                    "client",
                    undefined,
                    undefined,
                    f.createNewExpression(
                      f.createIdentifier("ApiClient"),
                      undefined,
                      [id("baseUrl"), id("token")],
                    ),
                  ),
                ],
                ts.NodeFlags.Const,
              ),
            ),
            f.createExpressionStatement(
              f.createBinaryExpression(
                f.createPropertyAccessExpression(f.createThis(), "client"),
                ts.SyntaxKind.EqualsToken,
                id("client"),
              ),
            ),
            ...constructorAssignments,
          ],
          true,
        ),
      ),
      f.createMethodDeclaration(
        undefined,
        undefined,
        "setToken",
        undefined,
        undefined,
        [
          f.createParameterDeclaration(
            undefined,
            undefined,
            "token",
            undefined,
            f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          ),
        ],
        f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        f.createBlock(
          [
            f.createExpressionStatement(
              f.createCallExpression(
                f.createPropertyAccessExpression(
                  f.createPropertyAccessExpression(f.createThis(), "client"),
                  "setToken"
                ),
                undefined,
                [id("token")],
              ),
            ),
          ],
          true,
        ),
      ),
    ],
  );
}

/* -------------------------------------------------- */
/* Emit                                               */
/* -------------------------------------------------- */

function emit(statements: ts.Statement[]) {
  const sf = ts.createSourceFile(
    "sdk.ts",
    "\n",
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.TS,
  );
  const printer = ts.createPrinter();
  return statements
    .map((s) => printer.printNode(ts.EmitHint.Unspecified, s, sf))
    .join("\n\n");
}

/* -------------------------------------------------- */
/* Main                                               */
/* -------------------------------------------------- */

const [, , input, output] = Bun.argv;

const openapi = loadOpenApi(resolve(input!));

const domains = groupByDomain(openapi);

const ast = [
  ...generateSchemas(openapi),
  generateApiClient(),
  ...Array.from(domains.entries()).map(([domain, ops]) =>
    generateDomainService(domain, ops)
  ),
  generateMainSdk(domains),
];

writeFileSync(resolve(output!), emit(ast));
console.log("SDK generated:", output);
console.log("Domains:", Array.from(domains.keys()).join(", "));