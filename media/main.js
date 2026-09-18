// @ts-check
(function () {
  // @ts-ignore - provided by VS Code
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));

  /**
   * Tiny element helper. Text is always set via textContent, never innerHTML.
   * @param {string} tag
   * @param {Record<string, any>} [props]
   * @param {(Node | string | null | undefined | false)[]} [children]
   */
  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') Object.assign(el.style, value);
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, String(value));
    }
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child);
    }
    return el;
  }

  const send = (type) => vscode.postMessage({ type });

  function section(title, children) {
    return h('section', { class: 'section' }, [h('h3', { class: 'section-title', text: title }), ...children]);
  }

  function renderAccount(state) {
    if (!state.account) return null;
    return section('Account', [
      h('div', { class: 'account-primary', text: state.account.primary, title: state.account.primary }),
      state.account.secondary && h('div', { class: 'muted', text: state.account.secondary }),
    ]);
  }

  function renderQuota(state) {
    if (state.signedOut) {
      return section('Usage', [
        h('p', { class: 'muted', text: 'Sign in to Codex to see your quota. Run "codex login" in a terminal, then refresh.' }),
      ]);
    }
    if (state.quotaGroups.length === 0) return null;
    const groups = state.quotaGroups.map((group) =>
      h('div', { class: 'quota-group' }, [
        group.title && h('div', { class: 'group-title', text: group.title }),
        ...group.windows.map((w) =>
          h('div', { class: `meter level-${w.level}` }, [
            h('div', { class: 'meter-head' }, [
              h('span', { class: 'meter-label', text: w.label }),
              h('span', { class: 'meter-value', text: w.percentText }),
            ]),
            h(
              'div',
              {
                class: 'bar',
                role: 'progressbar',
                'aria-label': w.label,
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': Math.round(w.percent),
              },
              [h('div', { class: 'bar-fill', style: { width: `${w.percent}%` } })]
            ),
            w.resetText && h('div', { class: 'muted small', text: w.resetText }),
          ])
        ),
        group.creditsText && h('div', { class: 'muted small', text: group.creditsText }),
      ])
    );
    return section('Usage', groups);
  }

  function renderTokens(state) {
    const t = state.tokens;
    if (!t) return null;
    const rows = h(
      'dl',
      { class: 'stats' },
      t.rows.flatMap((r) => [h('dt', { text: r.label }), h('dd', { text: r.value })])
    );
    const chart = h(
      'div',
      { class: 'chart', role: 'img', 'aria-label': 'Tokens per day, last 14 days' },
      t.chart.map((d) =>
        h('div', { class: `chart-col${d.isToday ? ' today' : ''}`, title: d.title }, [
          h('div', { class: 'chart-bar', style: { height: `${Math.max(d.tokens > 0 ? 4 : 0, d.ratio * 100)}%` } }),
        ])
      )
    );
    return section('Tokens', [
      rows,
      h('div', { class: 'chart-caption muted small', text: 'Last 14 days' }),
      chart,
      t.sourceNote && h('p', { class: 'muted small note', text: t.sourceNote }),
    ]);
  }

  function renderErrors(state) {
    if (state.errors.length === 0) return null;
    return h('div', { class: 'errors', role: 'alert' }, [
      ...state.errors.map((e) => h('div', { text: e })),
      h('div', { class: 'error-actions' }, [
        h('a', { href: '#', text: 'Show log', onclick: (ev) => { ev.preventDefault(); send('showLog'); } }),
        h('a', { href: '#', text: 'Restart server', onclick: (ev) => { ev.preventDefault(); send('restart'); } }),
        h('a', { href: '#', text: 'Settings', onclick: (ev) => { ev.preventDefault(); send('openSettings'); } }),
      ]),
    ]);
  }

  function renderFooter(state) {
    return h('footer', { class: 'footer' }, [
      h('span', {
        class: 'muted small',
        text: state.refreshing ? 'Updating…' : state.updatedText ? `Last updated: ${state.updatedText}` : '',
      }),
      h('button', {
        class: `refresh${state.refreshing ? ' spinning' : ''}`,
        title: 'Refresh',
        'aria-label': 'Refresh',
        disabled: state.refreshing,
        text: '↻ Refresh',
        onclick: () => send('refresh'),
      }),
    ]);
  }

  function render(state) {
    vscode.setState(state);
    if (state.phase === 'loading') {
      root.replaceChildren(h('p', { class: 'muted loading', text: 'Connecting to Codex…' }));
      return;
    }
    root.replaceChildren(
      ...[renderErrors(state), renderAccount(state), renderQuota(state), renderTokens(state), renderFooter(state)].filter(
        Boolean
      )
    );
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'state') render(event.data.state);
  });

  const previous = vscode.getState();
  if (previous) render(previous);
  send('ready');
})();
