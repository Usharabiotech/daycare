export function Flash({ searchParams }: { searchParams?: { ok?: string; error?: string } }) {
  if (searchParams?.error) return <div className="flash error" role="alert">{searchParams.error}</div>;
  if (searchParams?.ok) return <div className="flash ok" role="status">{searchParams.ok}</div>;
  return null;
}
