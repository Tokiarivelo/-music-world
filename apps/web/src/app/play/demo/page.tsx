import { DemoPlayback } from '@/features/player';

export default async function DemoPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>;
}) {
  const { template } = await searchParams;
  return (
    <main className="h-dvh w-full">
      <DemoPlayback storeTemplateId={typeof template === 'string' ? template : null} />
    </main>
  );
}
