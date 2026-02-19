import * as vscode from 'vscode';
import * as fs from 'fs';
import { resolve } from 'path';
import { getNestedObject, isURL } from './utils';

export default class PluginsManager {
  public static getAll() {
    if (!vscode.workspace.workspaceFolders) return [];

    const pluginsFolderPath: string =
      vscode.workspace.getConfiguration().get('grapesjs.pluginsFolder') || './';
    const workspaceFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const srcPath = resolve(workspaceFolderPath, pluginsFolderPath);
    const pluginsFolders = this._getDirectories(srcPath);
    const pluginsConfig = pluginsFolders.map(folder =>
      this._getConfig(resolve(srcPath, folder))
    );

    return pluginsConfig
      .map((config, i) => {
        return config ? this._loadPlugin(resolve(srcPath, pluginsFolders[i]), config) : {};
      })
      .filter(this._validPlugin);
  }

  private static _getDirectories(srcPath: string) {
    if (!fs.existsSync(srcPath)) return [];

    try {
      if (!fs.statSync(srcPath).isDirectory()) return [];
      return fs
        .readdirSync(srcPath)
        .filter(file => fs.statSync(resolve(srcPath, file)).isDirectory());
    } catch (err) {
      vscode.window.showErrorMessage(err.message || err);
      return [];
    }
  }

  private static _getConfig(srcPath: string) {
    if (fs.existsSync(resolve(srcPath, 'package.json'))) {
      try {
        const contentConfig = fs
          .readFileSync(resolve(srcPath, 'package.json'))
          .toString('utf8');
        const jsonConfig = JSON.parse(contentConfig);
        const grapesjsConfig = getNestedObject(jsonConfig, ['vscode', 'grapesjs']);

        if (grapesjsConfig === undefined || grapesjsConfig === null || grapesjsConfig === false) {
          return;
        }

        return Object.assign({}, typeof grapesjsConfig === 'object' ? grapesjsConfig : {}, {
          name: jsonConfig.name || '',
          main: jsonConfig.main || ''
        });
      } catch (err) {
        vscode.window.showErrorMessage(err.message || err);
      }
    }
  }

  private static _loadPlugin(
    srcPath: string,
    config: { lib: string; name: string; main: string; options?: any }
  ) {
    const { lib, name, main, options } = config;
    const p = lib || main;
    const path = !isURL(p) ? resolve(srcPath, p) : p;

    return fs.existsSync(path) || isURL(path) ? { options: options || {}, path, name } : {};
  }

  private static _validPlugin(plugin: any) {
    return plugin !== {} && plugin.hasOwnProperty('path') && plugin.hasOwnProperty('name');
  }
}
