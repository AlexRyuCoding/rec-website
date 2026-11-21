// Search while typing: wait until typing pauses, then search — and make
// sure only the reply to the LATEST text is ever shown. Replies can come
// back out of order (a slow "ann" after a fast "ann lic"); an older one
// must never overwrite a newer one. No React here, so it can be tested
// with fake timers.

export interface SearchRunner {
  // The text in the box changed.
  type(text: string): void;
  // Enter / the Search button: search now, even for the same text.
  submit(text: string): void;
  // Stop everything (the page is going away).
  cancel(): void;
}

export interface SearchRunnerOptions<T> {
  // How long typing has to pause before a search is sent.
  delayMs: number;
  // Shorter text (after trimming) is not searched.
  minLength: number;
  run: (text: string, signal: AbortSignal) => Promise<T>;
  onStart: (text: string) => void;
  onResult: (result: T, text: string) => void;
  onError: (error: unknown, text: string) => void;
  // The text became too short: there is nothing to show.
  onClear: () => void;
}

export function createSearchRunner<T>(
  options: SearchRunnerOptions<T>
): SearchRunner {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;
  // The text of the newest search sent; its reply is the only one wanted.
  let latestText: string | null = null;
  // Goes up with every search and every clear; a reply is delivered only
  // if nothing happened since its request went out.
  let generation = 0;

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const abandon = () => {
    generation++;
    inFlight?.abort();
    inFlight = null;
  };

  const send = (text: string) => {
    abandon();
    const mine = generation;
    const controller = new AbortController();
    inFlight = controller;
    latestText = text;
    options.onStart(text);
    options.run(text, controller.signal).then(
      (result) => {
        if (mine !== generation) return;
        inFlight = null;
        options.onResult(result, text);
      },
      (error) => {
        if (mine !== generation) return;
        inFlight = null;
        options.onError(error, text);
      }
    );
  };

  return {
    type(raw) {
      stopTimer();
      const text = raw.trim();
      if (text.length < options.minLength) {
        abandon();
        latestText = null;
        options.onClear();
        return;
      }
      // Already searched (or searching) exactly this: a space typed after
      // the word, or a letter typed and deleted again.
      if (text === latestText) return;
      timer = setTimeout(() => {
        timer = null;
        send(text);
      }, options.delayMs);
    },
    submit(raw) {
      stopTimer();
      const text = raw.trim();
      if (text.length < options.minLength) return;
      send(text);
    },
    cancel() {
      stopTimer();
      abandon();
    },
  };
}
