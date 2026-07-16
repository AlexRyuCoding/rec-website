// Standalone so Edge middleware can import it without pulling in next-auth.
// ALLOWED_ADMIN_EMAILS is a comma-separated list of staff Google accounts;
// it is re-checked on every request, so removing an email revokes access
// immediately (not just at next sign-in).
export function allowedAdminEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  return !!email && allowedAdminEmails().has(email.toLowerCase());
}
