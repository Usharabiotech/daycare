import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/types';

/** Wraps a route handler: JSON responses, DomainError → HTTP status, anything else → 500. */
export async function handle<T>(fn: () => Promise<T>, status = 200) {
  try {
    const data = await fn();
    return NextResponse.json({ data }, { status });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new DomainError('Request body must be JSON.');
  }
}
