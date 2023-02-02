import fs from 'fs-extra';
import glob from 'glob';
import pMapSeries from 'p-map-series';
import * as path from 'path';
import R from 'ramda';
import { BitId } from '@teambit/legacy-bit-id';
import { IS_WINDOWS, PACKAGE_JSON, SOURCE_DIR_SYMLINK_TO_NM } from '@teambit/legacy/dist/constants';
import BitMap from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import { PackageJsonTransformer } from '@teambit/legacy/dist/consumer/component/package-json-transformer';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import { first } from '@teambit/legacy/dist/utils';
import getNodeModulesPathOfComponent from '@teambit/legacy/dist/utils/bit/component-node-modules-path';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { changeCodeFromRelativeToModulePaths } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import Symlink from '@teambit/legacy/dist/links/symlink';
import { Workspace } from '@teambit/workspace';

type LinkDetail = { from: string; to: string };
export type NodeModulesLinksResult = {
  id: BitId;
  bound: LinkDetail[];
};

/**
 * link given components to node_modules, so it's possible to use absolute link instead of relative
 * for example, require('@bit/remote-scope.bar.foo)
 */
export default class NodeModuleLinker {
  components: Component[];
  consumer: Consumer;
  bitMap: BitMap; // preparation for the capsule, which is going to have only BitMap with no Consumer
  dataToPersist: DataToPersist;
  constructor(components: Component[], consumer: Consumer) {
    this.components = ComponentsList.getUniqueComponents(components);
    this.consumer = consumer;
    this.bitMap = consumer.bitMap;
    this.dataToPersist = new DataToPersist();
  }
  async link(): Promise<NodeModulesLinksResult[]> {
    const links = await this.getLinks();
    const linksResults = this.getLinksResults();
    if (this.consumer) links.addBasePath(this.consumer.getPath());
    await links.persistAllToFS();
    await this.consumer?.componentFsCache.deleteAllDependenciesDataCache();
    return linksResults;
  }
  async getLinks(): Promise<DataToPersist> {
    this.dataToPersist = new DataToPersist();
    // don't use Promise.all because down the road it calls transformPackageJson of pkg aspect, which loads components
    await pMapSeries(this.components, (component) => {
      const componentId = component.id.toString();
      logger.debug(`linking component to node_modules: ${componentId}`);
      const componentMap: ComponentMap = this.bitMap.getComponent(component.id);
      component.componentMap = componentMap;
      return this._populateComponentsLinks(component);
    });

    return this.dataToPersist;
  }
  getLinksResults(): NodeModulesLinksResult[] {
    const linksResults: NodeModulesLinksResult[] = [];
    const getExistingLinkResult = (id) => linksResults.find((linkResult) => linkResult.id.isEqual(id));
    const addLinkResult = (id: BitId | null | undefined, from: string, to: string) => {
      if (!id) return;
      const existingLinkResult = getExistingLinkResult(id);
      if (existingLinkResult) {
        existingLinkResult.bound.push({ from, to });
      } else {
        linksResults.push({ id, bound: [{ from, to }] });
      }
    };
    this.dataToPersist.symlinks.forEach((symlink: Symlink) => {
      addLinkResult(symlink.componentId, symlink.src, symlink.dest);
    });
    this.components.forEach((component) => {
      const existingLinkResult = getExistingLinkResult(component.id);
      if (!existingLinkResult) {
        linksResults.push({ id: component.id, bound: [] });
      }
    });
    return linksResults;
  }

  _getDefaultScope(component?: Component): string | undefined | null {
    if (component) {
      return component.defaultScope;
    }
    return this.consumer ? this.consumer.config.defaultScope : null;
  }

  /**
   * even when an authored component has rootDir, we can't just symlink that rootDir to
   * node_modules/rootDir. it could work only when the main-file is index.js, not for other cases.
   * node expects the module inside node_modules to have either package.json with valid "main"
   * property or an index.js file. this main property can't be relative.
   */
  async _populateComponentsLinks(component: Component): Promise<void> {
    const componentId = component.id;
    const linkPath: PathOsBasedRelative = getNodeModulesPathOfComponent({
      bindingPrefix: component.bindingPrefix,
      id: componentId,
      allowNonScope: true,
      defaultScope: this._getDefaultScope(component),
      extensions: component.extensions,
    });

    this.symlinkComponentDir(component, linkPath);
    this._deleteExistingLinksRootIfSymlink(linkPath);
    await this.createPackageJson(component);
  }

  /**
   * symlink the entire source directory into "src" in node-modules.
   */
  private symlinkComponentDir(component: Component, linkPath: PathOsBasedRelative) {
    const componentMap = component.componentMap as ComponentMap;

    const filesToBind = componentMap.getAllFilesPaths();
    filesToBind.forEach((file) => {
      const fileWithRootDir = path.join(componentMap.rootDir as string, file);
      const dest = path.join(linkPath, file);
      this.dataToPersist.addSymlink(Symlink.makeInstance(fileWithRootDir, dest, component.id, true));
    });

    if (IS_WINDOWS) {
      this.dataToPersist.addSymlink(
        Symlink.makeInstance(
          componentMap.rootDir as string,
          path.join(linkPath, SOURCE_DIR_SYMLINK_TO_NM),
          component.id
        )
      );
    }
  }

  /**
   * Removing existing links root (the package path) - to handle cases it was linked by package manager for example
   * this makes sure we are not affecting other places (like package manager cache) we shouldn't touch
   * If you have a case when this deletes something created by the package manager and it's not the desired behavior,
   * do not delete this code, but make sure the package manger nest the installed version into it's dependent
   * @param component
   */
  _deleteExistingLinksRootIfSymlink(linkPath: string) {
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        this.dataToPersist.removePath(new RemovePath(linkPath));
      }
      return undefined;
    } catch (err: any) {
      return undefined; // probably file does not exist
    }
  }

  /**
   * When the dists is outside the components directory, it doesn't have access to the node_modules of the component's
   * root-dir. The solution is to go through the node_modules packages one by one and symlink them.
   */
  _getSymlinkPackages(from: string, to: string, component: Component): Symlink[] {
    if (!this.consumer) throw new Error('getSymlinkPackages expects the Consumer to be defined');
    const dependenciesSavedAsComponents = component.dependenciesSavedAsComponents;
    const fromNodeModules = path.join(from, 'node_modules');
    const toNodeModules = path.join(to, 'node_modules');
    logger.debug(
      `symlinkPackages for dists outside the component directory from ${fromNodeModules} to ${toNodeModules}`
    );
    const unfilteredDirs = glob.sync('*', { cwd: fromNodeModules });
    // when dependenciesSavedAsComponents the node_modules/@bit has real link files, we don't want to touch them
    // otherwise, node_modules/@bit has packages as any other directory in node_modules
    const dirsToFilter = dependenciesSavedAsComponents ? [this.consumer.config._bindingPrefix] : [];
    const customResolvedData = component.dependencies.getCustomResolvedData();
    if (!R.isEmpty(customResolvedData)) {
      // filter out packages that are actually symlinks to dependencies
      Object.keys(customResolvedData).forEach((importSource) => dirsToFilter.push(first(importSource.split('/'))));
    }
    const dirs = dirsToFilter.length ? unfilteredDirs.filter((dir) => !dirsToFilter.includes(dir)) : unfilteredDirs;
    if (!dirs.length) return [];
    return dirs.map((dir) => {
      const fromDir = path.join(fromNodeModules, dir);
      const toDir = path.join(toNodeModules, dir);
      return Symlink.makeInstance(fromDir, toDir);
    });
  }

  _getDependencyLink(
    parentRootDir: PathOsBasedRelative,
    bitId: BitId,
    rootDir: PathOsBasedRelative,
    bindingPrefix: string,
    component: Component
  ): Symlink {
    const relativeDestPath = getNodeModulesPathOfComponent({
      ...component,
      id: bitId,
      allowNonScope: true,
      bindingPrefix,
      isDependency: true,
    });
    const destPathInsideParent = path.join(parentRootDir, relativeDestPath);
    return Symlink.makeInstance(rootDir, destPathInsideParent, bitId);
  }

  /**
   * create package.json on node_modules/@bit/component-name/package.json with a property 'main'
   * pointing to the component's main file.
   * It is needed for Authored components only.
   * Since an authored component doesn't have rootDir, it's impossible to symlink to the component directory.
   * It makes it easier for Author to use absolute syntax between their own components.
   */
  private async createPackageJson(component: Component) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const hasPackageJsonAsComponentFile = component.files.some((file) => file.relative === PACKAGE_JSON);
    if (hasPackageJsonAsComponentFile) return; // don't generate package.json on top of the user package.json
    const dest = path.join(
      getNodeModulesPathOfComponent({
        ...component,
        id: component.id,
        allowNonScope: true,
      })
    );
    const packageJson = PackageJsonFile.createFromComponent(dest, component, true, true);
    await this._applyTransformers(component, packageJson);
    if (IS_WINDOWS) {
      // in the workspace, override the "types" and add the "src" prefix.
      // otherwise, the navigation and auto-complete won't work on the IDE.
      // this is for Windows only. For Linux, we use symlinks for the files.
      packageJson.addOrUpdateProperty('types', `${SOURCE_DIR_SYMLINK_TO_NM}/${component.mainFile}`);
    }
    if (packageJson.packageJsonObject.version === 'latest') {
      packageJson.packageJsonObject.version = '0.0.1-new';
    }

    // packageJson.mergePropsFromExtensions(component);
    // TODO: we need to have an hook here to get the transformer from the pkg extension

    // delete the version, otherwise, we have to maintains it. such as, when tagging, it should be
    // changed to the new tagged version.
    delete packageJson.packageJsonObject.version;
    this.dataToPersist.addFile(packageJson.toVinylFile());
  }

  /**
   * these are changes made by aspects
   */
  async _applyTransformers(component: Component, packageJson: PackageJsonFile) {
    return PackageJsonTransformer.applyTransformers(component, packageJson);
  }
}

export async function linkToNodeModulesWithCodemod(
  workspace: Workspace,
  bitIds: BitId[],
  changeRelativeToModulePaths: boolean
) {
  let codemodResults;
  if (changeRelativeToModulePaths) {
    codemodResults = await changeCodeFromRelativeToModulePaths(workspace.consumer, bitIds);
  }
  const linksResults = await linkToNodeModules(workspace, bitIds);
  return { linksResults, codemodResults };
}

export async function linkToNodeModules(
  workspace: Workspace,
  bitIds: BitId[],
  loadFromScope = false
): Promise<NodeModulesLinksResult[]> {
  const componentsIds = BitIds.fromArray(bitIds);
  if (!componentsIds.length) return [];
  const getComponents = async () => {
    if (loadFromScope) {
      return Promise.all(componentsIds.map((id) => workspace.consumer.loadComponentFromModel(id)));
    }
    const { components } = await workspace.consumer.loadComponents(componentsIds);
    return components;
  };
  const components = await getComponents();
  const nodeModuleLinker = new NodeModuleLinker(components, workspace.consumer);
  return nodeModuleLinker.link();
}