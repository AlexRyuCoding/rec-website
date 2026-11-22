"use client";
import { useEffect, useState } from "react";

// The photograph behind a staff page — one per theme, fixed to the window
// while the page scrolls over it (styles: staff-theme.css, .staff-backdrop).
//
// Only the photo of the theme on screen is asked for at first. The other
// one is fetched once the page has finished loading (data-all), so that a
// later switch of theme can cross-fade into it.
//
// `under`: put the photo behind the page's content (the page's root must
// be `isolate`) rather than relying on the content being raised above it.
// For a page with layers of its own — see .staff-backdrop-under.
export default function Backdrop({ under = false }: { under?: boolean }) {
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (document.readyState === "complete") {
      setAll(true);
      return;
    }
    const loaded = () => setAll(true);
    window.addEventListener("load", loaded, { once: true });
    return () => window.removeEventListener("load", loaded);
  }, []);

  return (
    <div
      className={`staff-backdrop ${under ? "staff-backdrop-under" : ""}`}
      aria-hidden="true"
      data-all={all ? "" : undefined}
    >
      <i className="staff-backdrop-light" />
      <i className="staff-backdrop-dark" />
    </div>
  );
}
