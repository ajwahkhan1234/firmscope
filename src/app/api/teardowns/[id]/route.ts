import { getTeardown } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const teardown = await getTeardown(id);
  if (!teardown) {
    return Response.json({ error: "Teardown not found." }, { status: 404 });
  }
  return Response.json({ teardown });
}
