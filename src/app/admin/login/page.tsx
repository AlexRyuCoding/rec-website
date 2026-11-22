import { loginThemeFallback, themeBootScript } from "@/lib/staff-theme";
import LoginCard from "./LoginCard";
import "../staff-theme.css";

// The staff login page, in the staff look. It has no theme switch of its
// own: it shows the theme chosen on this browser, and with nothing chosen
// it does what the page being signed in to does (loginThemeFallback), so
// signing in never flips the look.
//
// The script puts the theme on <html> before the page first paints — the
// same one the dashboard's layout inlines; it is here, not in a layout,
// because only a page is given the address's ?next=.
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  const fallback = loginThemeFallback(typeof next === "string" ? next : null);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript(fallback) }} />
      <LoginCard themeFallback={fallback} />
    </>
  );
}
