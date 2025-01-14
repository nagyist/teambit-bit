// @bit-no-check

import {
  TypescriptTask,
} from '@teambit/typescript.typescript-compiler';
import { resolve } from 'path';
import { Pipeline } from "@teambit/builder";
import { Tester, TesterContext } from '@teambit/tester';
import { EnvHandler } from '@teambit/envs';
import { Component } from '@teambit/component';
// @ts-ignore
import { ReactEnv } from '@teambit/react.react-env';
// @ts-ignore
import type { ReactEnvInterface } from '@teambit/react.react-env';
import { JestTester } from '@teambit/defender.jest-tester';
// @ts-ignore
import {MultiTester, MultiTesterTask} from '@teambit/defender.testers.multi-tester';

function generateResolveSpecPathsFunc(pattern: string) {
  return (component: Component, context: TesterContext) => {
    const componentPatternValue = context.patterns.get(component);
    if (!componentPatternValue) return [] as string[];
    const [, patternEntry] = componentPatternValue;
    return [resolve(patternEntry.componentDir, pattern)]
  }
}

export class MultiJestTesterEnv extends ReactEnv implements ReactEnvInterface {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'multi-jest-tester';

  /**
   * icon for the env. use this to build a more friendly env.
   * uses react by default.
   */
  icon = 'https://static.bit.dev/extensions-icons/react.svg';

  protected jestConfigPath = require.resolve('./config/jest.config');
  protected tsconfigPath = require.resolve('./config/tsconfig.json');

  tester(): EnvHandler<Tester> {
    return MultiTester.fromTesterHandlers({
      testers: [
        JestTester.from({
          config: this.jestConfigPath,
          resolveSpecPaths: generateResolveSpecPathsFunc('**/*.custom-pattern-1.spec.+(js|ts|jsx|tsx)')
        }),
        JestTester.from({
          config: this.jestConfigPath,
          resolveSpecPaths: generateResolveSpecPathsFunc('**/*.custom-pattern-2.spec.+(js|ts|jsx|tsx)')
        })
      ]
    });
  }

  build() {
    return Pipeline.from([
      TypescriptTask.from({
        tsconfig: this.tsconfigPath,
      }),
      MultiTesterTask.fromTesterHandlers({
        testers: [
          JestTester.from({
            config: this.jestConfigPath,
            resolveSpecPaths: generateResolveSpecPathsFunc('**/*.custom-pattern-1.spec.+(js|ts|jsx|tsx)')
          }),
          JestTester.from({
            config: this.jestConfigPath,
            resolveSpecPaths: generateResolveSpecPathsFunc('**/*.custom-pattern-2.spec.+(js|ts|jsx|tsx)')
          })
        ]
      })
    ]);
  }
}

export default new MultiJestTesterEnv();
