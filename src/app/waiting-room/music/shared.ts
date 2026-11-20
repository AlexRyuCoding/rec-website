// Small helpers shared by the three players.

// Browsers hold back sound until the page has been clicked or a key
// pressed. Players that were refused listen for the next one and try
// again inside it. Returns the unsubscribe function.
export function onGesture(handler: () => void): () => void {
  document.addEventListener("keydown", handler);
  document.addEventListener("pointerdown", handler);
  return () => {
    document.removeEventListener("keydown", handler);
    document.removeEventListener("pointerdown", handler);
  };
}

// Third-party player code is loaded only when its source is chosen, once
// per page. A failed load is forgotten so the next attempt starts fresh.
const scripts = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scripts.delete(src);
      script.remove();
      reject(new Error("script failed to load"));
    };
    document.head.appendChild(script);
  });
  scripts.set(src, loading);
  return loading;
}

// Player objects belong to someone else's code and may already be torn
// down when we call them; a failed call must never take the screen down.
export function quietly(action: () => unknown): void {
  try {
    const result = action();
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // Nothing to do: the next state reading shows what happened.
  }
}
