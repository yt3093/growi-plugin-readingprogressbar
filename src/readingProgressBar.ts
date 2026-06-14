import './styles/readingProgressBar.css';

const BAR_ID = 'growi-reading-progress-bar';

const HEADER_SELECTORS = [
  '.grw-navbar',
  'nav.navbar',
  'header[role="banner"]',
  'header',
];

function getPrimaryColor(): string {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return (
    style.getPropertyValue('--bs-primary').trim() ||
    style.getPropertyValue('--primary').trim() ||
    '#3091c7'
  );
}

function getHeaderHeight(): number {
  for (const selector of HEADER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el.getBoundingClientRect().height;
  }
  return 0;
}

function shouldHideBar(): boolean {
  const path = location.pathname;
  // 管理画面: /admin または /admin/ 以下
  if (path === '/admin' || path.startsWith('/admin/')) return true;
  // 編集モード
  if (
    location.hash === '#edit' ||
    path.endsWith('/edit') ||
    document.body.classList.contains('editing') ||
    document.body.classList.contains('grw-editor-mode')
  ) return true;
  return false;
}

export function createReadingProgressBar(): { mount(): void; unmount(): void } {
  let bar: HTMLDivElement | null = null;
  let inner: HTMLDivElement | null = null;
  let rafId: number | null = null;
  let observer: MutationObserver | null = null;
  let observerRafId: number | null = null;

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  function updateBar(): void {
    rafId = null;
    if (!bar || !inner) return;

    if (shouldHideBar()) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = '';

    const headerHeight = getHeaderHeight();
    bar.style.top = `${headerHeight}px`;

    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
    const percent = Math.round(ratio * 100);
    inner.style.width = `${percent}%`;
    bar.setAttribute('aria-valuenow', String(percent));
  }

  function scheduleUpdate(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(updateBar);
  }

  function onNavigation(): void {
    // ページ遷移後は scrollY がリセットされるため次フレームで再計算
    requestAnimationFrame(() => {
      scheduleUpdate();
    });
  }

  function mount(): void {
    if (document.getElementById(BAR_ID)) return;

    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'growi-reading-progress-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', '0');
    bar.setAttribute('aria-label', '読書進捗');

    const color = getPrimaryColor();
    bar.style.setProperty('--growi-reading-progress-color', color);

    inner = document.createElement('div');
    inner.className = 'growi-reading-progress-bar__inner';
    bar.appendChild(inner);
    document.body.appendChild(bar);

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    window.addEventListener('popstate', onNavigation);
    // hash のみ変わる場合（#edit → '' 等）は hashchange で検知
    window.addEventListener('hashchange', onNavigation);

    history.pushState = function (...args) {
      originalPushState(...args);
      window.dispatchEvent(new Event('growi-rpb-navigate'));
    };
    history.replaceState = function (...args) {
      originalReplaceState(...args);
      window.dispatchEvent(new Event('growi-rpb-navigate'));
    };
    window.addEventListener('growi-rpb-navigate', onNavigation);

    observer = new MutationObserver(() => {
      if (observerRafId !== null) return;
      observerRafId = requestAnimationFrame(() => {
        observerRafId = null;
        scheduleUpdate();
      });
    });
    // body の class 変化（editing クラスの付け外し）も検知するため attributes を有効化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    scheduleUpdate();
  }

  function unmount(): void {
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    window.removeEventListener('popstate', onNavigation);
    window.removeEventListener('hashchange', onNavigation);
    window.removeEventListener('growi-rpb-navigate', onNavigation);

    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;

    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (observerRafId !== null) {
      cancelAnimationFrame(observerRafId);
      observerRafId = null;
    }

    const existing = document.getElementById(BAR_ID);
    if (existing) existing.remove();
    bar = null;
    inner = null;
  }

  return { mount, unmount };
}
