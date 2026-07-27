import { Workspace } from "@/components/workspace/workspace";

export const dynamic = "force-dynamic";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  return <Workspace initialUrl={url ?? ""} />;
}
