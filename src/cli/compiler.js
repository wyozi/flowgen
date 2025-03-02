/* @flow */
import {
  createProgram,
  createCompilerHost,
  createSourceFile,
  ScriptTarget,
  type SourceFile,
  transform,
} from "typescript";
import fs from "fs";
import tsc from "typescript-compiler";

import namespaceManager from "../namespaceManager";
import { type Options, assignOptions, resetOptions } from "../options";
import { checker } from "../checker";
import * as logger from "../logger";
import { withEnv } from "../env";
import { importEqualsTransformer, legacyModules } from "../parse/transformers";
import { recursiveWalkTree } from "../parse";

const compile = withEnv(
  (env: any, sourceFile: SourceFile): string => {
    const rootNode = recursiveWalkTree(sourceFile);

    const output = rootNode
      .getChildren()
      .map(child => {
        return child.print();
      })
      .join("");

    return output;
  },
);

const reset = (options?: Options) => {
  resetOptions();
  if (options) {
    assignOptions(options);
  }
  namespaceManager.reset();
};

const transformers = [legacyModules(), importEqualsTransformer()];

/**
 * Compiles typescript files
 */
export default {
  reset,

  compile: compile.withEnv({}),

  setChecker(typeChecker: any) {
    checker.current = typeChecker;
  },

  getTransformers() {
    return transformers;
  },

  compileTest: (path: string, target: string): void => {
    tsc.compile(path, "--module commonjs -t ES6 --out " + target);
  },

  compileDefinitionString: (string: string, options?: Options): string => {
    reset(options);

    const compilerOptions = {
      noLib: true,
      target: ScriptTarget.Latest,
    };
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (file === "file.ts") {
        return transform(
          createSourceFile("/dev/null", string, languageVersion, true),
          transformers,
          compilerOptions,
        ).transformed[0];
      }
      return oldSourceFile(file, languageVersion);
    };

    const program = createProgram(["file.ts"], compilerOptions, compilerHost);

    checker.current = program.getTypeChecker();
    const sourceFile = program.getSourceFile("file.ts");
    logger.setSourceFile(sourceFile);

    if (!sourceFile) return "";

    return compile.withEnv({})(sourceFile);
  },

  compileDefinitionFile: (path: string, options?: Options): string => {
    reset(options);

    const compilerOptions = {
      noLib: true,
      target: ScriptTarget.Latest,
    };
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (file === path) {
        return transform(
          createSourceFile(
            file,
            compilerHost.readFile(file),
            languageVersion,
            true,
          ),
          transformers,
          compilerOptions,
        ).transformed[0];
      }
      return oldSourceFile(file, languageVersion);
    };

    const program = createProgram([path], compilerOptions, compilerHost);

    checker.current = program.getTypeChecker();
    const sourceFile = program.getSourceFile(path);
    logger.setSourceFile(sourceFile);

    if (!sourceFile) return "";

    return compile.withEnv({})(sourceFile);
  },

  compileDefinitionFiles: (
    paths: string[],
    options?: Options,
  ): Array<[string, string]> => {
    const compilerOptions = {
      noLib: true,
      target: ScriptTarget.Latest,
    };
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (paths.includes(file)) {
        return transform(
          createSourceFile(
            file,
            compilerHost.readFile(file),
            languageVersion,
            true,
          ),
          transformers,
          compilerOptions,
        ).transformed[0];
      }
      return oldSourceFile(file, languageVersion);
    };

    const program = createProgram(paths, compilerOptions, compilerHost);

    checker.current = program.getTypeChecker();

    return paths.map(path => {
      const sourceFile = program.getSourceFile(path);
      logger.setSourceFile(sourceFile);
      if (!sourceFile) return "";
      reset(options);
      return [path, compile.withEnv({})(sourceFile)];
    });
  },
};
