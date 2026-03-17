export function createWidgetContainer(): {
  host: HTMLElement;
  shadowRoot: ShadowRoot;
  mountPoint: HTMLElement;
} {
  // Create host element
  const host = document.createElement('div');
  host.id = 'agentforge-widget';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';

  // Attach shadow DOM
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Create mount point inside shadow
  const mountPoint = document.createElement('div');
  mountPoint.id = 'agentforge-root';
  shadowRoot.appendChild(mountPoint);

  // Append to document body
  document.body.appendChild(host);

  return { host, shadowRoot, mountPoint };
}

export function injectStyles(shadowRoot: ShadowRoot, css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  shadowRoot.insertBefore(style, shadowRoot.firstChild);
}
