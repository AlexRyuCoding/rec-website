// Class strings shared by the kiosk's screens (the check-in flow in
// signin-keypad.tsx and the set-up screens in kiosk-gate.tsx). Sizes
// scale with the viewport height (dvh) so every screen fits a tablet in
// either orientation.

export const primaryButton =
  "flex items-center justify-center gap-2 rounded-full bg-brand-primary px-8 py-[min(1.7dvh,16px)] text-[clamp(1.1rem,2.9dvh,1.5rem)] font-medium text-white data-[pressed=true]:bg-brand-secondary";
export const secondaryButton =
  "flex items-center justify-center gap-2 rounded-full border-2 border-cream/50 px-6 py-[min(1.7dvh,16px)] text-[clamp(1.1rem,2.9dvh,1.5rem)] text-cream data-[pressed=true]:bg-cream/15";
// Screens without the number pad: one centred column.
export const columnClass =
  "flex w-full max-w-[520px] flex-col items-center gap-[min(2dvh,18px)]";
export const headingClass =
  "text-center font-serif text-[clamp(1.7rem,4.6dvh,2.75rem)] leading-tight";
export const leadClass =
  "text-center text-[clamp(1rem,2.5dvh,1.35rem)] leading-snug text-cream/80";
