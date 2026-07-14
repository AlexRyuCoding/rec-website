import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface PinRow {
  id: string;
  pin: string;
  first_name: string;
  last_name: string;
  pb_client_id: string | null;
}

// All patients that have a PIN, paginated: PostgREST silently caps a
// single query at 1,000 rows, which would make later patients unmatchable.
export async function fetchAllPatientsWithPins(
  supabase: SupabaseClient
): Promise<PinRow[]> {
  const rows: PinRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("patients")
      .select("id, pin, first_name, last_name, pb_client_id")
      .not("pin", "is", null)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error("patients page fetch failed");
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
