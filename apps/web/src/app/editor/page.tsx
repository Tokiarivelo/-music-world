import { EditorShell } from '@/features/template-editor';

type Param = string | string[] | undefined;
const one = (value: Param): string | null => (typeof value === 'string' && value !== '' ? value : null);

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ from?: Param; project?: Param }> }) {
  const { from, project } = await searchParams;
  return (
    <main className="w-full">
      <EditorShell from={one(from)} projectId={one(project)} />
    </main>
  );
}
