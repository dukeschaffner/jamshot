import type { IssueDoc } from './types';

async function parseJson(res: Response) {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data && typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : text || res.statusText;
    throw new Error(msg);
  }
  return data;
}

export async function fetchIssues(): Promise<{ issues: IssueDoc[] }> {
  const res = await fetch('/api/issues');
  return parseJson(res) as Promise<{ issues: IssueDoc[] }>;
}

export async function fetchDirectories(): Promise<{ directories: string[] }> {
  const res = await fetch('/api/directories');
  return parseJson(res) as Promise<{ directories: string[] }>;
}

export async function fetchAreas(): Promise<{ areas: string[] }> {
  const res = await fetch('/api/reference/areas');
  return parseJson(res) as Promise<{ areas: string[] }>;
}

export async function fetchIssue(path: string): Promise<IssueDoc> {
  const q = new URLSearchParams({ path });
  const res = await fetch(`/api/issues/one?${q}`);
  return parseJson(res) as Promise<IssueDoc>;
}

export async function createIssue(body: {
  directory: string;
  title: string;
  type: string;
  status: string;
  priority: number;
  area: string;
  tags: string[];
  content: string;
}): Promise<{ relativePath: string }> {
  const res = await fetch('/api/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res) as Promise<{ relativePath: string }>;
}

export async function updateIssue(body: {
  oldRelativePath: string;
  directory: string;
  title: string;
  type: string;
  status: string;
  priority: number;
  area: string;
  tags: string[];
  content: string;
}): Promise<{ relativePath: string }> {
  const res = await fetch('/api/issues', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res) as Promise<{ relativePath: string }>;
}

export async function deleteIssue(relativePath: string): Promise<void> {
  const q = new URLSearchParams({ path: relativePath });
  const res = await fetch(`/api/issues?${q}`, { method: 'DELETE' });
  await parseJson(res);
}
