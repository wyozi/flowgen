/* @flow */

import * as ts from "typescript";
import { opts } from "../options";
import { checker } from "../checker";
import type { RawNode } from "../nodes/node";
import printers from "./index";

export const propertyDeclaration = (
  node: RawNode,
  keywordPrefix: string,
  isVar: boolean = false,
) => {
  let left = keywordPrefix;
  const symbol = checker.current.getSymbolAtLocation(node.name);
  const name = isVar
    ? printers.node.getFullyQualifiedName(symbol, node.name)
    : printers.node.printType(node.name);
  if (
    node.modifiers &&
    node.modifiers.some(
      modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword,
    )
  ) {
    return "";
  }
  if (
    node.modifiers &&
    node.modifiers.some(
      modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
    )
  ) {
    left += "+";
  }

  left += name;

  if (node.parameters) {
    return left + ": " + node.parameters.map(printers.common.parameter);
  }

  if (node.type) {
    let right = printers.node.printType(node.type);
    if (node.questionToken && node.name.kind !== ts.SyntaxKind.ComputedPropertyName) {
      left += "?";
    }
    if (
      node.questionToken &&
      node.name.kind === ts.SyntaxKind.ComputedPropertyName
    ) {
      right = `(${right}) | void`;
    }
    return left + ": " + right;
  }

  return left + `: any // ${printers.node.printType(node.initializer)}`;
};

export const variableDeclaration = (node: RawNode): string => {
  const declarations = node.declarationList.declarations.map(
    printers.node.printType,
  );

  return declarations
    .map(name => `declare ${printers.relationships.exporter(node)}var ${name};`)
    .join("\n");
};

export const interfaceType = (
  node: RawNode,
  withSemicolons: boolean = false,
): string => {
  let members = node.members
    .map(member => {
      const printed = printers.node.printType(member);

      if (!printed) {
        return null;
      }

      let str = "\n";

      if (member.jsDoc) {
        str += printers.common.comment(member.jsDoc);
      }

      return str + printed;
    })
    .filter(Boolean) // Filter rows which didnt print propely (private fields et al)
    .join(withSemicolons ? ";" : ",");

  if (members.length > 0) {
    members += "\n";
  }

  return `{${members}}`;
};

const interfaceRecordType = (
  node: RawNode,
  heritage: string,
  withSemicolons: boolean = false,
): string => {
  let members = node.members
    .map(member => {
      const printed = printers.node.printType(member);

      if (!printed) {
        return null;
      }

      let str = "\n";

      if (member.jsDoc) {
        str += printers.common.comment(member.jsDoc);
      }

      return str + printed;
    })
    .filter(Boolean) // Filter rows which didnt print propely (private fields et al)
    .join(withSemicolons ? ";" : ",");

  if (members.length > 0) {
    members += "\n";
  }

  return `{${heritage}${members}}`;
};

const interfaceRecordDeclaration = (
  nodeName: string,
  node: RawNode,
  modifier: string,
): string => {
  let heritage = "";

  // If the class is extending something
  if (node.heritageClauses) {
    heritage = node.heritageClauses
      .map(clause => {
        return clause.types
          .map(type => printers.node.printType(type))
          .map(type => `...$Exact<${type}>`)
          .join(",\n");
      })
      .join("");
    heritage = heritage.length > 0 ? `${heritage},\n` : "";
  }

  let str = `${modifier}type ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} = ${interfaceRecordType(node, heritage)}\n`;

  return str;
};

export const interfaceDeclaration = (
  nodeName: string,
  node: RawNode,
  modifier: string,
): string => {
  const isRecord = opts().interfaceRecords;
  if (isRecord) {
    return interfaceRecordDeclaration(nodeName, node, modifier);
  }
  let heritage = "";

  // If the class is extending something
  if (node.heritageClauses) {
    heritage = node.heritageClauses
      .map(clause => {
        return clause.types
          .map(type => {
            // TODO: refactor this
            const symbol = checker.current.getSymbolAtLocation(type.expression);
            printers.node.fixDefaultTypeArguments(symbol, type);
            if (type.expression.kind === ts.SyntaxKind.Identifier) {
              return (
                printers.node.getFullyQualifiedPropertyAccessExpression(
                  symbol,
                  type.expression,
                ) + printers.common.generics(type.typeArguments)
              );
            } else {
              return printers.node.printType(type);
            }
          })
          .join(" & ");
      })
      .join("");
    heritage = heritage.length > 0 ? `& ${heritage}\n` : "";
  }

  const type = node.heritageClauses ? "type" : "interface";

  let str = `${modifier}${type} ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} ${type === "type" ? "= " : ""}${interfaceType(node)} ${heritage}`;

  return str;
};

export const typeDeclaration = (
  nodeName: string,
  node: RawNode,
  modifier: string,
): string => {
  let str = `${modifier}type ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} = ${printers.node.printType(node.type)};`;

  return str;
};

export const enumDeclaration = (nodeName: string, node: RawNode): string => {
  const exporter = printers.relationships.exporter(node);
  let members = "";
  for (const [index, member] of node.members.entries()) {
    let value;
    const name = `${nodeName}__${member.name.text}`;
    if (typeof member.initializer !== "undefined") {
      value = printers.node.printType(member.initializer);
    } else {
      value = index;
    }
    members += `+${member.name.text}: ${value},`;
    members += `// ${value}\n`;
  }
  return `
declare ${exporter} var ${nodeName}: {|
  ${members}
|};\n`;
};

export const typeReference = (node: RawNode, identifier: boolean): string => {
  if (node.typeName.left && node.typeName.right) {
    return (
      printers.node.printType(node.typeName) +
      printers.common.generics(node.typeArguments)
    );
  }
  let name = node.typeName.text;
  if (identifier) {
    name = printers.identifiers.print(node.typeName.text);
    if (typeof name === "function") {
      return name(node.typeArguments);
    }
  }
  return (
    printers.relationships.namespaceProp(name) +
    printers.common.generics(node.typeArguments)
  );
};

export const classDeclaration = (nodeName: string, node: RawNode): string => {
  let heritage = "";

  // If the class is extending something
  if (node.heritageClauses) {
    heritage = node.heritageClauses
      .map(clause => {
        return clause.types
          .map(type => {
            // TODO: refactor this
            const symbol = checker.current.getSymbolAtLocation(type.expression);
            printers.node.fixDefaultTypeArguments(symbol, type);
            if (type.expression.kind === ts.SyntaxKind.Identifier) {
              return (
                printers.node.getFullyQualifiedPropertyAccessExpression(
                  symbol,
                  type.expression,
                ) + printers.common.generics(type.typeArguments)
              );
            } else {
              return printers.node.printType(type);
            }
          })
          .join(", ");
      })
      .join(", ");
    heritage = heritage.length > 0 ? `mixins ${heritage}` : "";
  }

  let str = `declare ${printers.relationships.exporter(
    node,
  )}class ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} ${heritage} ${interfaceType(node, true)}`;

  return str;
};
