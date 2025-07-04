import { expect } from 'chai';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit reset command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('untag single component', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      localScope = helper.scopeHelper.cloneWorkspace();
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 1 components');
    });
    describe('with one version', () => {
      before(() => {
        helper.command.reset('bar/foo', true);
      });
      it('should delete the entire component from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 0 components');
      });
    });
    describe('with multiple versions when specifying the version', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.command.tagWithoutBuild('bar/foo', '--unmodified');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');

        helper.command.reset('bar/foo', true);
      });
      it('should delete only the specified tag', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.not.have.property('0.0.2');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.1');
      });
      it('should delete the specified version from the "state" attribute', () => {
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.not.have.property('0.0.2');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.state.versions).to.have.property('0.0.1');
      });
      it('bit show should work', () => {
        const showOutput = helper.command.showComponentParsed('bar/foo');
        expect(showOutput.name).to.equal('bar/foo');
      });
      it('bit status should show the component as staged', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string('staged components');
      });
    });
    describe('with multiple versions when not specifying the version', () => {
      describe('and all versions are local', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(localScope);
          helper.command.tagWithoutBuild('bar/foo', '--unmodified');
          const catComponent = helper.command.catComponent('bar/foo');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.have.property('0.0.2');

          helper.command.reset('bar/foo');
        });
        it('should delete the entire component from the model', () => {
          const output = helper.command.listLocalScope();
          expect(output).to.have.string('found 0 components');
        });
      });
    });
    describe('when some versions are exported, some are local', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.export();
        helper.command.tagWithoutBuild('bar/foo', '--unmodified');
        const catComponent = helper.command.catComponent('bar/foo');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(catComponent.versions).to.have.property('0.0.2');
      });
      describe('untagging without version', () => {
        before(() => {
          helper.command.reset('bar/foo');
        });
        it('should delete only the local tag and leave the exported tag', () => {
          const catComponent = helper.command.catComponent('bar/foo');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.not.have.property('0.0.2');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.versions).to.have.property('0.0.1');
        });
      });
    });
    describe('when tagging non-existing component', () => {
      it('should show an descriptive error', () => {
        const resetFunc = () => helper.command.reset('non-exist-scope/non-exist-comp');
        const error = new MissingBitMapComponent('non-exist-scope/non-exist-comp');
        helper.general.expectToThrow(resetFunc, error);
      });
    });
  });
  describe('untag multiple components (--all flag)', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fs.createFile('bar2', 'foo2.js');
      helper.command.addComponent('bar2', { i: 'bar/foo2' });
      helper.fs.createFile('bar3', 'foo3.js');
      helper.command.addComponent('bar3', { i: 'bar/foo3' });
      helper.command.tagAllWithoutBuild();
      helper.command.exportIds('bar/foo3');
      localScope = helper.scopeHelper.cloneWorkspace();
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 3 components');
    });
    describe('without specifying a version', () => {
      let untagOutput;
      before(() => {
        untagOutput = helper.command.resetAll();
      });
      it('should display a descriptive successful message', () => {
        expect(untagOutput).to.have.string('2 component(s) were reset');
      });
      it('should remove only local components from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 1 components');
        expect(output).to.have.string('bar/foo3');
      });
    });
    describe('with --head', () => {
      let untagOutput;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.command.tagIncludeUnmodified('0.0.5');
        untagOutput = helper.command.resetAll('--head');
      });
      it('should display a descriptive successful message', () => {
        expect(untagOutput).to.have.string('3 component(s) were reset');
      });
      it('should remove only the specified version from the model', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('found 3 components');
        expect(output).to.have.string('0.0.1');
        expect(output).to.not.have.string('0.0.5');
      });
    });
  });
  describe('components with dependencies', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentIsType();
      helper.fixtures.addComponentUtilsIsType();
      helper.fixtures.createComponentIsString();
      helper.fixtures.addComponentUtilsIsString();
      helper.command.linkAndRewire();
      helper.command.tagAllWithoutBuild();
      localScope = helper.scopeHelper.cloneWorkspace();
    });
    describe('untag only the dependency', () => {
      describe('without force flag', () => {
        let untagOutput;
        before(() => {
          try {
            helper.command.reset('utils/is-type');
          } catch (err: any) {
            untagOutput = err.message;
          }
        });
        it('should throw a descriptive error', () => {
          expect(untagOutput).to.have.string(
            `unable to reset ${helper.scopes.remote}/utils/is-type, the version 0.0.1 has the following dependent(s) ${helper.scopes.remote}/utils/is-string@0.0.1`
          );
        });
      });
      describe('with force flag', () => {
        let untagOutput;
        before(() => {
          untagOutput = helper.command.reset('utils/is-type', undefined, '--force');
        });
        it('should untag successfully', () => {
          expect(untagOutput).to.have.string('1 component(s) were reset');
        });
      });
      describe('after exporting the component and tagging the scope', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedWorkspace(localScope);
          helper.scopeHelper.reInitRemoteScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.export();
          helper.command.tagIncludeUnmodified('1.0.5');
          try {
            output = helper.command.reset('utils/is-type');
          } catch (err: any) {
            output = err.message;
          }
        });
        it('should show an error', () => {
          expect(output).to.have.string(`unable to reset ${helper.scopes.remote}/utils/is-type`);
        });
      });
    });
    describe('untag all components', () => {
      describe('when all components have only local versions', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(localScope);
          helper.command.resetAll();
        });
        it('should remove all the components because it does not leave a damaged component without dependency', () => {
          const output = helper.command.listLocalScope();
          expect(output).to.have.string('found 0 components');
        });
      });
    });
    describe('untag only the dependent', () => {
      let untagOutput;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        untagOutput = helper.command.reset('utils/is-string');
      });
      it('should untag successfully the dependent', () => {
        expect(untagOutput).to.have.string('1 component(s) were reset');
        expect(untagOutput).to.have.string('utils/is-string');
      });
      it('should leave the dependency intact', () => {
        const output = helper.command.listLocalScope();
        expect(output).to.have.string('utils/is-type');
      });
    });
    describe('after import and tagging', () => {
      let scopeAfterImport;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.export();
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string --path components/utils/is-string');
        scopeAfterImport = helper.scopeHelper.cloneWorkspace();
        helper.command.tagWithoutBuild('utils/is-string', '--unmodified --ignore-issues "*"');
      });
      describe('untag using the id without scope-name', () => {
        let output;
        before(() => {
          output = helper.command.reset('utils/is-string');
        });
        it('should untag successfully', () => {
          expect(output).to.have.string('1 component(s) were reset');
          expect(output).to.have.string('utils/is-string');
        });
      });
      describe('modify, tag and then untag all', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(scopeAfterImport);
          helper.fs.modifyFile('components/utils/is-string/is-string.js');
          helper.command.tagAllWithoutBuild('--ignore-issues "*"');
          helper.command.resetAll();
        });
        it('should show the component as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('no modified components');
          expect(output).to.have.string('modified components');
          expect(output).to.have.string('utils/is-string');
        });
      });
    });
  });
  describe('components with config in the .bitmap file', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.deprecateComponent('comp1');
      helper.command.tagWithoutBuild();
      const isDeprecated = helper.command.isDeprecated('comp1');
      expect(isDeprecated).to.be.true; // intermediate step.
      helper.command.resetAll();
    });
    it('bit reset should leave the config as they were before the tag', () => {
      const isDeprecated = helper.command.isDeprecated('comp1');
      expect(isDeprecated).to.be.true;
    });
    it('bit export should remove the entries form the staged-config file', () => {
      helper.command.tagWithoutBuild('--unmodified');
      helper.command.export();
      const stagedConfig = helper.general.getStagedConfig();
      expect(stagedConfig).to.have.lengthOf(0);
    });
  });
  describe('when checked out to a non-head version with detach-head functionality', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'version2');
      helper.command.tagWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'version3');
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.checkoutVersion('0.0.2', 'comp1', '-x');
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified --detach-head');

      // an intermediate step, make sure the component is detached
      const comp = helper.command.catComponent('comp1');
      expect(comp).to.have.property('detachedHeads');
      expect(comp.detachedHeads.current).to.not.be.undefined;

      helper.command.resetAll();
    });
    after(() => {
      helper.command.resetFeatures();
    });
    it('expect .bitmap to point to the same version as it was before the reset, and not the latest', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('0.0.2');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    it('should clear the detached head', () => {
      const comp = helper.command.catComponent('comp1');
      expect(comp).to.not.have.property('detachedHeads');
    });
  });
});
