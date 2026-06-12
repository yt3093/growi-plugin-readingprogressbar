import { createReadingProgressBar } from './src/readingProgressBar';

const bar = createReadingProgressBar();

const activate = (): void => {
  bar.mount();
};

const deactivate = (): void => {
  bar.unmount();
};

window.pluginActivators = window.pluginActivators ?? {};
window.pluginActivators['growi-plugin-readingprogressbar'] = { activate, deactivate };
