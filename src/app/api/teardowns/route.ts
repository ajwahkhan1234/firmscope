import { isSupabaseConfigured, listTeardowns } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({ configured: false, teardowns: [] });
  }
  const teardowns = await listTeardowns(25);
  return Response.json({ configured: true, teardowns });
}
