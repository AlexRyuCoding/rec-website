// The waiting-room TV. A public shell with no patient data in it (the
// data API needs a paired screen), but it has no business in a search
// index either.
export const metadata = {
  title: "Waiting Room",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
