import { ProjectPlayback } from '@/features/player';

interface ProjectPlayPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ template?: string | string[] }>;
}

export default async function ProjectPlayPage({ params, searchParams }: ProjectPlayPageProps) {
  const [{ projectId }, { template }] = await Promise.all([params, searchParams]);
  return (
    <main className="h-dvh w-full">
      <ProjectPlayback projectId={projectId} storeTemplateId={typeof template === 'string' ? template : null} />
    </main>
  );
}
