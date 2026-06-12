export type GrowiFacade = {
  markdownRenderer?: unknown;
};

declare global {
  interface Window {
    growiFacade?: GrowiFacade;
    pluginActivators?: Record<string, { activate(): void; deactivate(): void }>;
  }
}

export {};
