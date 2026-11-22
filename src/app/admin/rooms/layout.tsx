import { themeBootScript } from "@/lib/staff-theme";
import "../staff-theme.css";

// The rooms board's frame is themed like the dashboard (CLAUDE.md, "Staff
// look"); the script puts the theme on <html> before the first paint.
//
// "dark" = what the board does when nothing has been chosen on this
// device. NOT "match this tablet": the wall iPads are set to automatic
// appearance, and the board would change its look at sunset by itself.
// A choice made with the switch (on the board or the dashboard) wins.
export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript("dark") }} />
      {children}
    </>
  );
}
