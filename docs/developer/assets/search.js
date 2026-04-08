(function () {
  const CURRENT_SITE = window.location.hostname.startsWith('developer.') ? 'developer' : 'docs';

  function resolveEndpoint() {
    if (typeof window.PHOTON_DOCS_SEARCH_ENDPOINT === 'string' && window.PHOTON_DOCS_SEARCH_ENDPOINT.trim()) {
      return window.PHOTON_DOCS_SEARCH_ENDPOINT.trim();
    }
    if (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
      return 'http://127.0.0.1:8788/api/docs/search';
    }
    return 'https://faucet.photonbolt.xyz/api/docs/search';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildUrl(result) {
    const targetHost = result.host || (result.site === 'developer' ? 'developer.photonbolt.xyz' : 'docs.photonbolt.xyz');
    if (targetHost === window.location.host) {
      return result.url;
    }
    return `https://${targetHost}${result.url}`;
  }

  function mountSearch() {
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'photon-search-launcher';
    launcher.innerHTML = '<span>Search Docs</span><span class="photon-search-keyhint">Ctrl K</span>';

    const shell = document.createElement('div');
    shell.className = 'photon-search-shell';
    shell.innerHTML = `
      <div class="photon-search-backdrop"></div>
      <div class="photon-search-panel" role="dialog" aria-modal="true" aria-label="Search PhotonBolt docs">
        <div class="photon-search-head">
          <div class="photon-search-headline">
            <span>PhotonBolt Documentation Search</span>
            <button type="button" class="photon-search-close">ESC</button>
          </div>
          <label class="photon-search-form">
            <span class="photon-search-site-pill">${CURRENT_SITE === 'developer' ? 'Developer focus' : 'Docs focus'}</span>
            <input class="photon-search-input" type="search" placeholder="Search connect apps, balances, RGB, API, Lightning..." autocomplete="off" />
          </label>
        </div>
        <div class="photon-search-results">
          <div class="photon-search-state">Type at least 2 characters to search across docs.photonbolt.xyz and developer.photonbolt.xyz.</div>
        </div>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(shell);

    const backdrop = shell.querySelector('.photon-search-backdrop');
    const closeButton = shell.querySelector('.photon-search-close');
    const input = shell.querySelector('.photon-search-input');
    const resultsNode = shell.querySelector('.photon-search-results');
    const endpoint = resolveEndpoint();
    let activeIndex = -1;
    let liveResults = [];
    let debounceTimer = null;
    let requestCounter = 0;

    function renderState(message) {
      activeIndex = -1;
      liveResults = [];
      resultsNode.innerHTML = `<div class="photon-search-state">${escapeHtml(message)}</div>`;
    }

    function renderResults(results) {
      liveResults = results;
      activeIndex = results.length ? 0 : -1;

      if (!results.length) {
        renderState('No matching documents found. Try terms like connect apps, getBalance, rgb transfer, or lightning invoice.');
        return;
      }

      resultsNode.innerHTML = results.map((result, index) => `
        <a class="photon-search-result${index === activeIndex ? ' is-active' : ''}" href="${escapeHtml(buildUrl(result))}">
          <div class="photon-search-result-top">
            <div class="photon-search-result-title">${escapeHtml(result.title || 'Untitled')}</div>
            <div class="photon-search-result-badges">
              <span class="photon-search-badge">${escapeHtml(result.site)}</span>
              ${result.category ? `<span class="photon-search-badge">${escapeHtml(result.category)}</span>` : ''}
            </div>
          </div>
          <div class="photon-search-result-summary">${result.snippet || escapeHtml(result.summary || '')}</div>
          <div class="photon-search-result-url">${escapeHtml(result.host)}${escapeHtml(result.url)}</div>
        </a>
      `).join('');
    }

    function syncActiveResult() {
      const links = resultsNode.querySelectorAll('.photon-search-result');
      links.forEach((link, index) => {
        link.classList.toggle('is-active', index === activeIndex);
      });
    }

    async function runSearch(query) {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        renderState('Type at least 2 characters to search across docs.photonbolt.xyz and developer.photonbolt.xyz.');
        return;
      }

      const currentRequest = ++requestCounter;
      renderState('Searching...');

      try {
        const params = new URLSearchParams({
          q: trimmed,
          currentSite: CURRENT_SITE,
          limit: '8'
        });
        const response = await fetch(`${endpoint}?${params.toString()}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json();
        if (currentRequest !== requestCounter) return;
        if (!response.ok || payload.ok === false) {
          renderState(payload.error || 'Search request failed.');
          return;
        }
        renderResults(Array.isArray(payload.results) ? payload.results : []);
      } catch (error) {
        renderState(error && error.message ? error.message : 'Search request failed.');
      }
    }

    function openSearch() {
      shell.classList.add('is-open');
      requestAnimationFrame(() => input.focus());
      if (input.value.trim().length >= 2) {
        runSearch(input.value);
      }
    }

    function closeSearch() {
      shell.classList.remove('is-open');
    }

    launcher.addEventListener('click', openSearch);
    backdrop.addEventListener('click', closeSearch);
    closeButton.addEventListener('click', closeSearch);

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(input.value), 220);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && liveResults.length) {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % liveResults.length;
        syncActiveResult();
      } else if (event.key === 'ArrowUp' && liveResults.length) {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + liveResults.length) % liveResults.length;
        syncActiveResult();
      } else if (event.key === 'Enter' && liveResults.length && activeIndex >= 0) {
        event.preventDefault();
        window.location.href = buildUrl(liveResults[activeIndex]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeSearch();
      }
    });

    document.addEventListener('keydown', (event) => {
      const isHotkey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      const slashHotkey = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
      const target = event.target;
      const isEditable = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      if (isHotkey || (slashHotkey && !isEditable && !shell.classList.contains('is-open'))) {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && shell.classList.contains('is-open')) {
        closeSearch();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSearch);
  } else {
    mountSearch();
  }
})();
