import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
import { dirname, resolve } from 'path';
import ContentProvider from './ContentProvider';
import { isURL } from './utils';

let timerId: NodeJS.Timeout;

export default class GrapesEditorManager {
  public static currentPanel: GrapesEditorManager | undefined;
  public static viewFocus = 'grapesjsViewFocus';
  public static viewType = 'grapesjs.editor';
  private readonly _panel: vscode.WebviewPanel;
  private _activeEditor: vscode.TextEditor | undefined;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext) {
    if (GrapesEditorManager.currentPanel) {
      const activeEditor = vscode.window.activeTextEditor;
      const activeContent =
        activeEditor &&
        GrapesEditorManager.isAcceptableLaguage(activeEditor.document.languageId)
          ? activeEditor.document.getText()
          : '';
      const { _panel } = GrapesEditorManager.currentPanel;
      const stylesheets = GrapesEditorManager.getStylesheetLinks(
        activeContent,
        activeEditor ? activeEditor.document : undefined,
        _panel.webview
      );

      _panel.reveal(vscode.ViewColumn.Two);
      _panel.webview.postMessage({
        command: 'loading'
      });

      if (timerId) clearTimeout(timerId);

      timerId = setTimeout(() => {
        _panel.webview.postMessage({
          command: 'change',
          content: activeContent,
          stylesheets
        });
      }, 300);
    } else {
      const localResourceRoots = [vscode.Uri.file(context.extensionPath)];
      if (vscode.workspace.workspaceFolders) {
        localResourceRoots.push(...vscode.workspace.workspaceFolders.map(folder => folder.uri));
      }

      const panel = vscode.window.createWebviewPanel(
        GrapesEditorManager.viewType,
        'Grapesjs Editor',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots
        }
      );

      GrapesEditorManager.currentPanel = new GrapesEditorManager(panel, context);
    }
  }

  public static exportContent() {
    if (GrapesEditorManager.currentPanel) {
      GrapesEditorManager.currentPanel._panel.webview.postMessage({
        command: 'callExport'
      });
    }
  }

  public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    GrapesEditorManager.currentPanel = new GrapesEditorManager(panel, context);
  }

  public static isAcceptableLaguage(languageId: string) {
    return languageId === 'html';
  }

  private onChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    const { document, contentChanges } = event;

    if (
      this._activeEditor &&
      this._activeEditor.document === document &&
      GrapesEditorManager.isAcceptableLaguage(document.languageId) &&
      contentChanges.length > 0
    ) {
      const content = document.getText();
      const stylesheets = GrapesEditorManager.getStylesheetLinks(
        content,
        document,
        this._panel.webview
      );

      this._panel.webview.postMessage({
        command: 'change',
        content,
        stylesheets
      });
    }
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();
    const delay: number = config.get('grapesjs.delay') || 0;
    const allowScripts: boolean = !!config.get('grapesjs.allowScripts');
    const activeEditor = vscode.window.activeTextEditor;
    const activeContent =
      activeEditor &&
      GrapesEditorManager.isAcceptableLaguage(activeEditor.document.languageId)
        ? activeEditor.document.getText()
        : '';
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.onDidChangeViewState(({ webviewPanel }) => {
      this.setWebviewActiveContext(webviewPanel.active);
    });
    this._panel.webview.html = ContentProvider.getContent(
      context,
      this._panel.webview,
      activeContent,
      allowScripts
    );
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'export':
            const { html, css } = message.content;

            vscode.workspace
              .openTextDocument({
                language: 'html',
                content: ContentProvider.exportMockup(html, css)
              })
              .then(doc =>
                vscode.window.showTextDocument(doc, {
                  preserveFocus: true
                })
              );
            return;
        }
      },
      null,
      this._disposables
    );

    this.setWebviewActiveContext(true);

    this.updateActiveEditor(activeEditor);

    const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      (event: vscode.TextDocumentChangeEvent) => {
      const { document, contentChanges } = event;

      if (
        this._activeEditor &&
        this._activeEditor.document === document &&
        GrapesEditorManager.isAcceptableLaguage(document.languageId) &&
        contentChanges.length > 0
      ) {
        this._panel.webview.postMessage({
          command: 'loading'
        });

        if (timerId) clearTimeout(timerId);

        timerId = setTimeout(() => {
          this.onChangeTextDocument(event);
        }, delay);
      }
    });

    this._disposables.push(
      documentChangeDisposable,
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.updateActiveEditor(editor);
      })
    );
  }

  public dispose() {
    this.setWebviewActiveContext(false);
    GrapesEditorManager.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  public setWebviewActiveContext(value: boolean) {
    vscode.commands.executeCommand('setContext', GrapesEditorManager.viewFocus, value);
  }

  private updateActiveEditor(editor: vscode.TextEditor | undefined) {
    if (editor && GrapesEditorManager.isAcceptableLaguage(editor.document.languageId)) {
      this._activeEditor = editor;
      const content = editor.document.getText();
      const stylesheets = GrapesEditorManager.getStylesheetLinks(
        content,
        editor.document,
        this._panel.webview
      );
      this._panel.webview.postMessage({
        command: 'loading'
      });
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        this._panel.webview.postMessage({
          command: 'change',
          content,
          stylesheets
        });
      }, 300);
      return;
    }

    this._activeEditor = undefined;
  }

  private static getStylesheetLinks(
    html: string,
    document: vscode.TextDocument | undefined,
    webview: vscode.Webview
  ) {
    if (!document) return [];

    const $ = cheerio.load(html);
    const links: string[] = [];
    const baseDir = document.uri.scheme === 'file' ? dirname(document.uri.fsPath) : undefined;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspaceRoot = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
    const toWebviewUri = (uri: vscode.Uri) => {
      const anyWebview = webview as any;
      return typeof anyWebview.asWebviewUri === 'function'
        ? anyWebview.asWebviewUri(uri)
        : uri.with({ scheme: 'vscode-resource' });
    };

    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      const trimmed = href.trim();
      if (!trimmed) return;

      if (isURL(trimmed) || trimmed.startsWith('data:')) {
        links.push(trimmed);
        return;
      }

      if (trimmed.startsWith('//')) {
        links.push(`https:${trimmed}`);
        return;
      }

      if (
        trimmed.startsWith('vscode-resource:') ||
        trimmed.startsWith('vscode-webview-resource:')
      ) {
        links.push(trimmed);
        return;
      }

      if (trimmed.startsWith('file:')) {
        try {
          links.push(toWebviewUri(vscode.Uri.parse(trimmed)).toString());
        } catch (err) {
          // Ignore invalid file URLs.
        }
        return;
      }

      if ((trimmed.startsWith('/') || trimmed.startsWith('\\')) && workspaceRoot) {
        const resolvedPath = resolve(workspaceRoot, `.${trimmed}`);
        links.push(toWebviewUri(vscode.Uri.file(resolvedPath)).toString());
        return;
      }

      if (!baseDir) return;

      const resolvedPath = resolve(baseDir, trimmed);
      links.push(toWebviewUri(vscode.Uri.file(resolvedPath)).toString());
    });

    return links;
  }
}
