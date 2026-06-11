import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { fetchClientRecord } from "@/lib/practice-better";

// One-time endpoint verification handshake from Practice Better
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("challenge");
  const token = searchParams.get("verification_token");
  const expected = process.env.PB_WEBHOOK_VERIFICATION_TOKEN;

  if (!expected || !challenge || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    challenge,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

// PB-Signature: t=<unix seconds>,v1=<hex hmac of "<t>.<rawBody>">
function isValidSignature(
  header: string | null,
  rawBody: string,
  secret: string
): boolean {
  if (!header) return false;
  const parts = new Map(
    header.split(",").map((p) => p.split("=", 2) as [string, string])
  );
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return (
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
  );
}

// The swagger doc doesn't define the event envelope, so check the
// plausible field names for the record ID.
function extractRecordId(event: Record<string, unknown>): string | null {
  const data = event.data as Record<string, unknown> | undefined;
  const resource = event.resource as Record<string, unknown> | undefined;
  const candidate =
    event.resourceId ?? event.resource_id ?? data?.id ?? resource?.id;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

export async function POST(req: Request) {
  const secret = process.env.PB_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  if (!isValidSignature(req.headers.get("pb-signature"), rawBody, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventType = (event.eventType ?? event.event_type ?? event.type) as
    | string
    | undefined;
  if (eventType !== "client.record.created") {
    return NextResponse.json({ received: true });
  }

  const recordId = extractRecordId(event);
  if (!recordId) {
    return NextResponse.json({ error: "Missing record id" }, { status: 400 });
  }

  try {
    const record = await fetchClientRecord(recordId);
    if (!record) {
      // Record deleted between event and fetch — nothing to sync
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("patients").upsert(
      {
        pb_client_id: record.id,
        first_name: record.profile?.firstName ?? "",
        last_name: record.profile?.lastName ?? "",
        email: record.profile?.emailAddress ?? null,
        phone: record.profile?.mobilePhone ?? record.profile?.homePhone ?? null,
      },
      { onConflict: "pb_client_id" }
    );
    if (error) {
      console.error("Webhook upsert failed:", error.code);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 → Practice Better retries delivery
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
