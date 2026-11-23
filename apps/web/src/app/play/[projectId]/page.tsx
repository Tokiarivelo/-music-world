import { ProjectPlayback } from '@/features/player';

export default async function ProjectPlayPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <main className="h-dvh w-full">
      <ProjectPlayback projectId={projectId} />
    </main>
  );
}
