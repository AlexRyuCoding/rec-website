import { staffRoute } from "@/lib/staff-route";
import { sealForRecipient } from "@/lib/secret-export";

// TEMPORARY — for the move to Google Cloud; delete once the move is done.
//
// The new host needs the same NEXTAUTH_SECRET as this one: the kiosk's
// quick PIN lookup is keyed with it (pin-lookup.ts), and with a different
// key every PIN is checked against every patient — 7 to 8 seconds in the
// rehearsal. The value cannot be read back out of this host's settings,
// so the running site hands it over sealed: encrypted with the public key
// below, whose private half exists only in the new host's secret store.
// What this returns is unreadable to anyone else, including the staff
// member who fetches it and anyone who sees it on the way.
//
// Staff only, never cached. It holds no patient information.
const RECIPIENT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAk/YvEtoHW+UmT9O7/YGy
ggF87iXFacgOvNNNH7GcaT11PvfHaop16qIAg4Cjt1ouDtofRPk6XtUJD3m6Yu+Q
WNVw3DbIz5LwEL56hX4rvBLsNq8La3Ign/E2E4Dh2T+GMchCNcBslF4W/S/bfXUX
eUCENny24BROCj8J2e4BIGpaDG9FWhSQckc89LRzzcf2VDB/in8Xf3PCtnOBZOGZ
x0wySaa1WnAKYS4fh1fG9hAA/VMjf7QE5KwFKYwuiJMQjMfz44dxULLMD6w2+7FB
XnRhC10wKsKnEuU/X1AzdKla93bcWFgj5ZKDwCK9dIiOggarq84yR/tdzHn88lrK
8Wjqd8RlvyufiST6s8kpP7vjqrX0j7tGGiP3JGR+yCBitjUyf5fTHR98iP3o5uop
nEkhBXLWrO8DJIsb23chgpWK8CRDLn7d5Y9l/k23Tb+8PFWzT5SmuqjyWOqWgZTM
Y2MHivdHgyfnGpHjLRaG/mWED2HmA8LD28UvyqLSb54/AgMBAAE=
-----END PUBLIC KEY-----
`.trim();

export const GET = staffRoute(async () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return new Response("not available", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
    });
  }
  return new Response(sealForRecipient(secret, RECIPIENT_PUBLIC_KEY), {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
  });
});
