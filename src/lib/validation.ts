import { z } from "zod";

const PHONE_RE = /^\+?[\d\s().-]{7,30}$/;

// Empty string → undefined, so optional fields accept "" from the form.
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const requestFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(200).email(),
  phone: z.string().trim().regex(PHONE_RE, "Invalid phone number"),
  message: z.string().trim().min(1).max(2000),
  // Honeypot — must parse cleanly; the route decides what to do with it.
  company: z.string().max(200).optional().default(""),
});

export const grievanceFormSchema = z.object({
  name: optionalTrimmed(100),
  email: optionalTrimmed(200).pipe(z.string().email().optional()),
  phone: optionalTrimmed(30).pipe(
    z.string().regex(PHONE_RE, "Invalid phone number").optional()
  ),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  company: z.string().max(200).optional().default(""),
});

export type RequestFormData = z.infer<typeof requestFormSchema>;
export type GrievanceFormData = z.infer<typeof grievanceFormSchema>;

export function getClientIp(req: Request): string {
  // x-real-ip is set by the hosting edge (Vercel) and can't be client-spoofed;
  // the first x-forwarded-for entry can be, so it's only a fallback.
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
