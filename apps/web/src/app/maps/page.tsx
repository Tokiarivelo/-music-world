import { MapShell } from '@/features/map-creator';

type Param = string | string[] | undefined;
const one = (value: Param): string | null => (typeof value === 'string' && value !== '' ? value : null);

export default async function MapsPage({ searchParams }: { searchParams: Promise<{ from?: Param; open?: Param }> }) {
  const { from, open } = await searchParams;
  return (
    <main className="w-full">
      <MapShell from={one(from)} open={one(open)} />
    </main>
  );
}
