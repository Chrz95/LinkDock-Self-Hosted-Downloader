(() => {
  if (globalThis.linkDockCloseOverlays) {
    globalThis.linkDockCloseOverlays();
    return false;
  }

  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const css = `
    .control { position: fixed; z-index: 2147483647; color: #f4f7ed; font: 13px system-ui, sans-serif;
      color-scheme: dark; }
    button, select { font: inherit; border-radius: 6px; }
    button { cursor: pointer; border: 1px solid #74834e; background: #202d23; color: #eff5dc; padding: 5px 9px; }
    button:hover { background: #344733; }
    button:disabled { opacity: .7; cursor: wait; }
    :focus-visible { outline: 2px solid #d8e7a4; outline-offset: 2px; }
    .panel { position: absolute; right: 0; top: calc(100% + 5px); width: min(210px, calc(100vw - 16px));
      box-sizing: border-box; background: #17211b; border: 1px solid #58674c; border-radius: 9px; padding: 10px;
      box-shadow: 0 4px 18px #0008; }
    .above .panel { top: auto; bottom: calc(100% + 5px); }
    label { display: grid; gap: 3px; margin-bottom: 8px; }
    select { width: 100%; border: 1px solid #58674c; padding: 4px; }
    .status { margin: 6px 0 0; overflow-wrap: anywhere; }
    .status:empty { margin: 0; }
    [hidden] { display: none !important; }
  `;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  shadow.adoptedStyleSheets = [sheet];
  document.documentElement.append(host);

  const controls = new Map();
  const events = new AbortController();
  let openPanel;
  let frame = 0;
  const fileSuffix =
    /\.(?:7z|apk|bin|csv|dmg|docx?|epub|exe|gz|iso|m4a|mkv|mov|mp[34]|msi|pdf|rar|tar|torrent|wav|webm|xlsx?|zip)$/iu;
  const downloadLabel = /\b(download|save file)\b/iu;
  const videoQualities = ['best', '2160', '1440', '1080', '720', '480', '360'];
  const audioQualities = ['mp3-128', 'mp3-192', 'mp3-320'];
  const layout = {
    maximumControls: 24,
    minimumTargetSize: 12,
    viewportGap: 4,
    videoInset: 8,
    linkOffset: 29,
    minimumControlWidth: 145,
    panelClearance: 225,
  };

  /** Parses a page-provided link that the station can request independently. */
  function webUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    try {
      const url = new URL(value, document.baseURI);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
        return url;
      }
    } catch {
      // Invalid URLs are ineligible.
    }
  }

  /** Uses the watch page for platform players and a web media source when one is exposed. */
  function videoUrl(video) {
    const page = new URL(location.href);
    const youtube = /(?:^|\.)youtube\.com$/iu.test(page.hostname);
    const vimeo = /(?:^|\.)vimeo\.com$/iu.test(page.hostname);
    if (
      (youtube &&
        ((page.pathname === '/watch' && page.searchParams.has('v')) ||
          /^\/(shorts|live|embed)\//u.test(page.pathname))) ||
      (vimeo && /\/\d+(?:\/|$)/u.test(page.pathname))
    ) {
      return page;
    }
    return (
      webUrl(
        video.currentSrc || video.getAttribute('src') || video.querySelector('source[src]')?.getAttribute('src'),
      ) ?? webUrl(page.href)
    );
  }

  /** Recognizes download links and controls that expose a real URL in the page. */
  function fileUrl(target) {
    const explicit = target.getAttribute('data-download-url');
    const url = webUrl(explicit ?? target.getAttribute('href') ?? target.getAttribute('data-href'));
    if (!url) {
      return;
    }
    const page = new URL(location.href);
    if (url.origin === page.origin && url.pathname === page.pathname && url.search === page.search && !explicit) {
      return;
    }
    const label = target.getAttribute('aria-label') || target.getAttribute('title') || target.textContent;
    if (explicit || target.hasAttribute('download') || fileSuffix.test(url.pathname) || downloadLabel.test(label)) {
      return url;
    }
  }

  /** Creates an extension control with text only. */
  function element(tag, text) {
    const item = document.createElement(tag);
    if (text) {
      item.textContent = text;
    }
    return item;
  }

  /** Appends a labeled native select to the video options. */
  function selectField(panel, labelText) {
    const label = element('label', labelText);
    const select = element('select');
    label.append(select);
    panel.append(label);
    return select;
  }

  /** Rebuilds quality choices for the selected output type. */
  function fillQuality(quality, audio) {
    quality.replaceChildren(
      ...(audio ? audioQualities : videoQualities).map((value) => {
        const label = audio
          ? `${value.replace('mp3-', '')} kbps`
          : value === 'best'
            ? 'Best available'
            : `Up to ${value}p`;
        return new Option(label, value);
      }),
    );
    quality.value = audio ? 'mp3-192' : '1080';
  }

  /** Adds a single overlay to a visible video or download control. */
  function createControl(target, isVideo) {
    const root = element('div');
    root.className = 'control';
    const toggle = element('button', isVideo ? 'LinkDock video' : 'Send to LinkDock');
    toggle.type = 'button';
    const panel = element('div');
    panel.className = 'panel';
    panel.hidden = true;
    const status = element('p');
    status.className = 'status';
    status.setAttribute('role', 'status');
    let quality;
    let send = toggle;

    if (isVideo) {
      toggle.setAttribute('aria-expanded', 'false');
      const output = selectField(panel, 'Output');
      output.append(new Option('Video', 'video'), new Option('Audio (MP3)', 'audio'));
      quality = selectField(panel, 'Quality');
      fillQuality(quality, false);
      output.addEventListener('change', () => fillQuality(quality, output.value === 'audio'));
      send = element('button', 'Send to LinkDock');
      send.type = 'button';
      panel.append(send);
    }
    panel.append(status);
    root.append(toggle, panel);
    shadow.append(root);

    /** Shows one panel at a time and keeps it above overlapping overlays. */
    function show() {
      if (openPanel && openPanel !== close) {
        openPanel();
      }
      openPanel = close;
      panel.hidden = false;
      shadow.append(root);
      if (isVideo) {
        toggle.setAttribute('aria-expanded', 'true');
      }
    }

    /** Closes this panel. */
    function close() {
      panel.hidden = true;
      if (isVideo) {
        toggle.setAttribute('aria-expanded', 'false');
      }
      if (openPanel === close) {
        openPanel = undefined;
      }
    }

    if (isVideo) {
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!event.isTrusted) {
          return;
        }
        if (panel.hidden) {
          show();
        } else {
          close();
        }
      });
    }
    root.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape' && !panel.hidden) {
        close();
        toggle.focus();
      }
    });
    send.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!event.isTrusted || send.disabled) {
        return;
      }
      show();
      const url = isVideo ? videoUrl(target) : fileUrl(target);
      if (!url) {
        status.textContent = 'This control no longer has a file link.';
        return;
      }
      url.hash = '';
      send.disabled = true;
      status.textContent = 'Sending…';
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'linkdock-overlay-download',
          url: url.href,
          sourceType: isVideo ? 'video' : 'direct',
          ...(quality && { quality: quality.value }),
        });
        status.textContent = result?.message ?? 'Could not reach LinkDock. Check your connection.';
      } catch {
        status.textContent = 'Could not reach the companion. Reopen it and show the buttons again.';
      } finally {
        send.disabled = false;
      }
    });
    return { root, close };
  }

  /** Keeps overlays aligned to visible page targets as the page changes. */
  function update() {
    frame = 0;
    const visible = new Set();
    const candidates = document.querySelectorAll(
      'video, a[href], [data-download-url], button[data-href], [role="button"][data-href]',
    );
    for (const target of candidates) {
      if (visible.size >= layout.maximumControls) {
        break;
      }
      const video = target.localName === 'video';
      if (!video && !fileUrl(target)) {
        continue;
      }
      const bounds = target.getBoundingClientRect();
      if (
        bounds.width < layout.minimumTargetSize ||
        bounds.height < layout.minimumTargetSize ||
        bounds.bottom <= 0 ||
        bounds.top >= innerHeight ||
        bounds.right <= 0 ||
        bounds.left >= innerWidth ||
        getComputedStyle(target).visibility !== 'visible'
      ) {
        continue;
      }
      visible.add(target);
      const control = controls.get(target) ?? createControl(target, video);
      controls.set(target, control);
      const top = Math.max(layout.viewportGap, video ? bounds.top + layout.videoInset : bounds.top - layout.linkOffset);
      control.root.style.top = `${top}px`;
      const right = Math.min(innerWidth - layout.minimumControlWidth, innerWidth - bounds.right + layout.viewportGap);
      control.root.style.right = `${Math.max(layout.viewportGap, right)}px`;
      control.root.classList.toggle('above', top > innerHeight - layout.panelClearance);
    }
    for (const [target, control] of controls) {
      if (!visible.has(target)) {
        control.close();
        control.root.remove();
        controls.delete(target);
      }
    }
  }

  /** Coalesces page changes into one layout pass per frame. */
  function schedule() {
    if (!frame) {
      frame = requestAnimationFrame(update);
    }
  }

  const changes = new MutationObserver(schedule);
  changes.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'href', 'download', 'data-download-url', 'data-href', 'hidden', 'class', 'style'],
  });
  window.addEventListener('scroll', schedule, { capture: true, passive: true, signal: events.signal });
  window.addEventListener('resize', schedule, { signal: events.signal });
  document.addEventListener('loadedmetadata', schedule, { capture: true, signal: events.signal });
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.composedPath().includes(host)) {
        openPanel?.();
      }
    },
    { capture: true, signal: events.signal },
  );

  globalThis.linkDockCloseOverlays = () => {
    events.abort();
    changes.disconnect();
    cancelAnimationFrame(frame);
    host.remove();
    delete globalThis.linkDockCloseOverlays;
  };
  update();
  return true;
})();
