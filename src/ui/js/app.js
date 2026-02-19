import '../../../node_modules/grapesjs/dist/css/grapes.min.css';
import '../css/styles.css';

import grapesjs from 'grapesjs';
import config from './config';

const editor = grapesjs.init(config);
const allowScripts = Boolean(window.grapesjsAllowScripts);
let pendingChange = null;

const extractContent = html => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const styles = Array.from(doc.querySelectorAll('style'));
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
  const css = styles.map(style => style.textContent || '').join('\n');

  styles.forEach(style => style.remove());
  links.forEach(link => link.remove());

  if (!allowScripts) {
    Array.from(doc.querySelectorAll('script')).forEach(script => script.remove());
  }

  const bodyHtml = doc.body ? doc.body.innerHTML : '';
  const components = bodyHtml && bodyHtml.trim().length ? bodyHtml : html;

  return { components, css };
};

const syncExternalStyles = stylesheetLinks => {
  const canvasDoc = editor.Canvas.getDocument();
  if (!canvasDoc) {
    return;
  }

  Array.from(canvasDoc.querySelectorAll('link[data-gjs-external-style]')).forEach(el =>
    el.parentNode.removeChild(el)
  );

  (stylesheetLinks || []).forEach(href => {
    if (!href) return;
    const link = canvasDoc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-gjs-external-style', 'true');
    canvasDoc.head.appendChild(link);
  });
};

const applyChange = (html, stylesheetLinks = []) => {
  const { components, css } = extractContent(html);
  editor.setComponents(components);
  editor.setStyle(css || '');
  syncExternalStyles(stylesheetLinks);
};

const scheduleChange = (html, stylesheetLinks) => {
  const canvasDoc = editor.Canvas.getDocument();
  if (!canvasDoc) {
    pendingChange = { html, stylesheetLinks };
    return;
  }

  applyChange(html, stylesheetLinks);
};

editor.on('update', function() {
  document.body.classList.remove('loading');
});

editor.on('load', function() {
  if (pendingChange) {
    applyChange(pendingChange.html, pendingChange.stylesheetLinks);
    pendingChange = null;
  }
});

window.addEventListener('message', event => {
  const message = event.data;

  switch (message.command) {
    case 'callExport':
      editor.runCommand('call-vscode-export');
      return;
    case 'change':
      scheduleChange(message.content, message.stylesheets);
      return;
    case 'loading':
      document.body.classList.add('loading');
      return;
  }
});
