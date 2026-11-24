"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  parseThemeChoice,
  resolveTheme,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  ThemeChoice,
} from "@/lib/staff-theme";

// How long the cross-fade class stays on <html> (staff-theme.css): a
// little longer than the slowest thing it fades, the photo (420 ms).
const THEMING_MS = 460;

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// Storage can be blocked outright (Safari private windows): then the page
// simply has no remembered choice.
function storedChoice(fallback: ThemeChoice): ThemeChoice {
  try {
    return parseThemeChoice(
      window.localStorage.getItem(THEME_STORAGE_KEY),
      fallback
    );
  } catch {
    return fallback;
  }
}

// No matchMedia counts as dark, like the pre-paint script.
function systemPrefersDark(): boolean {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  return !media || media.matches;
}

// The theme of a staff page. While the page is mounted, <html> carries
// data-staff-theme="light" | "dark" — every colour of the staff look hangs
// off that attribute — and it is taken off again when the page is left,
// so the kiosk, the TV and the public site can never be themed by it.
// (The same idea as the kiosk's html.kiosk-locked.)
//
// `fallback` is what the page does when nothing has been chosen on this
// browser: the dashboard follows the computer ("system").
//
// The right theme is already on <html> before this runs — the page's
// layout inlines themeBootScript() — so there is no flash; this hook
// keeps it right afterwards: the switch, the OS changing its mind while
// "system" is chosen, and the choice being changed in another tab.
export function useStaffTheme(fallback: ThemeChoice = "system"): {
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(fallback);
  const choiceRef = useRef<ThemeChoice>(fallback);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Put the resolved theme on <html>; `fade` cross-fades the change.
  const apply = useCallback((fade: boolean) => {
    const root = document.documentElement;
    const next = resolveTheme(choiceRef.current, systemPrefersDark());
    if (root.getAttribute(THEME_ATTRIBUTE) === next) return;
    if (fade) {
      root.classList.add("staff-theming");
      clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(
        () => root.classList.remove("staff-theming"),
        THEMING_MS
      );
    }
    root.setAttribute(THEME_ATTRIBUTE, next);
  }, []);

  useBrowserLayoutEffect(() => {
    const root = document.documentElement;
    choiceRef.current = storedChoice(fallback);
    setChoiceState(choiceRef.current);
    apply(false);

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => apply(true);
    media?.addEventListener?.("change", onSystem);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      choiceRef.current = parseThemeChoice(e.newValue, fallback);
      setChoiceState(choiceRef.current);
      apply(true);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      media?.removeEventListener?.("change", onSystem);
      window.removeEventListener("storage", onStorage);
      clearTimeout(fadeTimer.current);
      root.classList.remove("staff-theming");
      root.removeAttribute(THEME_ATTRIBUTE);
    };
  }, [fallback, apply]);

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      // Pressing the item already shown is not a choice. It must not be
      // stored as one: on the rooms board "nothing chosen" means dark,
      // and a stored "system" would make the wall tablets follow the
      // sunset (the dashboard shows "system" for both).
      if (next === choiceRef.current) return;
      choiceRef.current = next;
      setChoiceState(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Not remembered, then — the switch still works until reload.
      }
      apply(true);
    },
    [apply]
  );

  return { choice, setChoice };
}
