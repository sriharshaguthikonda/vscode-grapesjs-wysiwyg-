import { ExtensionContext, Uri, Webview } from 'vscode';
import * as cheerio from 'cheerio';
import { join } from 'path';
import PluginsManager from './PluginsManager';
import { getNonce, isURL } from './utils';

export default class ContentProvider {
  public static getContent(
    context: ExtensionContext,
    webview: Webview,
    content?: string | undefined,
    allowScripts: boolean = false
  ) {
    const toWebviewUri = (uri: Uri) => {
      const anyWebview = webview as any;
      return typeof anyWebview.asWebviewUri === 'function'
        ? anyWebview.asWebviewUri(uri)
        : uri.with({ scheme: 'vscode-resource' });
    };

    const plugins = PluginsManager.getAll();
    const pluginsFiles = plugins.map(({ path }) => {
      const p = path || '';

      return !isURL(p) ? toWebviewUri(Uri.file(p)) : p;
    });
    const vendorsUri = toWebviewUri(
      Uri.file(join(context.extensionPath, '/out/ui/vendors.bundle.js'))
    );
    const grapesUri = toWebviewUri(Uri.file(join(context.extensionPath, '/out/ui/grapes.min.js')));
    const scriptUri = toWebviewUri(Uri.file(join(context.extensionPath, '/out/ui/app.bundle.js')));

    const nonce = getNonce();
    const cspSource = (webview as any).cspSource || 'vscode-resource:';
    const scriptSrc = allowScripts
      ? `'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' ${cspSource} https: http:`
      : `'nonce-${nonce}' 'unsafe-eval' ${cspSource} https: http:`;

    return `<!DOCTYPE html>
						<html lang="en">
						<head>
							<meta charset="UTF-8">
	
							<!--
							Use a content security policy to only allow loading images from https or from our extension directory,
							and only allow scripts that have a specific nonce.
							-->
							<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: http: data:; style-src 'unsafe-inline' ${cspSource} https: http:; script-src ${scriptSrc}; font-src ${cspSource} data: https: http:;">
	
							<meta name="viewport" content="width=device-width, initial-scale=1.0">
							<title>GrapesJS</title>
							<script nonce="${nonce}" src="${vendorsUri.toString()}"></script>
							<script nonce="${nonce}" src="${grapesUri.toString()}"></script>
							${pluginsFiles
                .map(
                  plugin =>
                    `<script nonce="${nonce}" src="${plugin ? plugin.toString() : ''}"></script>`
                )
                .join('')}
							<script nonce="${nonce}">
								window.plugins = ${JSON.stringify(plugins.map(plugin => (plugin ? plugin.name : '')))}
								window.pluginsOptions = ${JSON.stringify(
                  plugins.map(plugin =>
                    plugin ? { options: plugin.options, name: plugin.name } : {}
                  )
                )}
								window.grapesjsAllowScripts = ${allowScripts};
							</script>
						</head>
						<body>
							<div id="root">								
								<div class="editor-row">
									<div class="editor-canvas">
										<div id="gjs">
											${content || this.getTemplate()}
										</div>
									</div>
									<div class="panel__right">
										<div class="panel__switcher"></div>
										<div class="panel__content">
											<div class="layers-container"></div>
											<div class="styles-container" style="display: none;"></div>
											<div class="traits-container" style="display: none;"></div>
											<div class="blocks-container" style="display: none;"></div>
										</div>
										<div class="panel__basic-actions"></div>
									</div>
								</div>
							</div>
							<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
						</body>
						</html>`;
  }

  public static exportMockup(html: string, css: string) {
    let mockup;

    if (this._isHeadInHtml(html)) {
      mockup = html;
    } else {
      mockup = `<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title></title>
				</head>
				<body>${html}</body>
			</html>`;
    }

    return this._addCssInHtml(mockup, css);
  }

  private static getTemplate() {
    return `<!DOCTYPE html>
		<html>
			<head>
				<link href="https://fonts.googleapis.com/css?family=Signika&display=swap" rel="stylesheet">
				<style>
					html, body {
						margin: 0;
						padding: 0;
						height: 100%;
					}
					body {
						position: relative;
						font-family: Arial, Helvetica, sans-serif;
						background: linear-gradient(#101452 10%, #131862 55%, #546bab);
					}
					.jumbotron {
						margin: 0;
						padding: 50px;
						position: absolute;
						top: 50%;
						left: 50%;
						transform: translate(-50%, -50%);
						border-radius: 25%;
						color: #fff;
					}
					.jumbotron h1 {
						font-family: 'Signika', sans-serif;
						text-transform: uppercase;
						text-shadow: 0 0 5px #fff, 0 0 10px #fff, 0 0 20px #ff0080, 0 0 30px #ff0080, 0 0 40px #ff0080;
					}
					.text-center {
						text-align: center;
					}
				</style>
			</head>
			<body>
				<div class="jumbotron">
					<h1 class="text-center">Ready to Build <br/>with GrapesJS&nbsp;!!!</h1>
				</div>
			</body>
		</html>`;
  }

  private static _isHeadInHtml(html: string) {
    const $ = cheerio.load(html);

    return $('head').length > 0;
  }

  private static _addCssInHtml(html: string, css: string) {
    const $ = cheerio.load(html);

    $('head').append(`<style>${css}</style>`);

    return $.html();
  }
}
