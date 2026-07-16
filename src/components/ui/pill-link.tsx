import Link from "next/link";

const VARIANTS = {
  light: "bg-island text-ink",
  dark: "bg-surface text-cream",
  gold: "bg-gold text-canvas",
} as const;

interface PillLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  external?: boolean;
  className?: string;
}

// Label is duplicated in two stacked spans that roll up on hover (design
// system's signature pill interaction).
function RollingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative block overflow-hidden">
      <span className="block transition-transform duration-300 ease-default group-hover:-translate-y-[105%]">
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 block translate-y-[105%] transition-transform duration-300 ease-default group-hover:translate-y-0"
      >
        {children}
      </span>
    </span>
  );
}

export default function PillLink({
  href,
  children,
  variant = "light",
  external = false,
  className = "",
}: PillLinkProps) {
  const classes = `group inline-block rounded-full px-6 py-4 text-sm font-bold leading-none ${VARIANTS[variant]} ${className}`;
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        <RollingLabel>{children}</RollingLabel>
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      <RollingLabel>{children}</RollingLabel>
    </Link>
  );
}
