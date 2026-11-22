import { loginPathFor } from "./staff-session";

// The server said this browser is no longer signed in (401): go to the
// login page, and come back to this page afterwards. A full page load on
// purpose — whatever the page was showing is gone with the session.
export function goToStaffLogin(): void {
  window.location.href = loginPathFor(
    window.location.pathname + window.location.search
  );
}
