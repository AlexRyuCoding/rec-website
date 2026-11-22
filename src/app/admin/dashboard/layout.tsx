import { themeBootScript } from "@/lib/staff-theme";
import "../staff-theme.css";

// The dashboard is themed (light / dark / match this computer). The
// script puts the right theme on <html> before the page first paints, so
// it never flashes the other one; use-staff-theme.ts keeps it right from
// then on and takes it off again when the dashboard is left.
//
// It is an inline script on purpose (the site's content-security policy
// allows those): anything loaded separately would run too late.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      {children}
    </>
  );
}
