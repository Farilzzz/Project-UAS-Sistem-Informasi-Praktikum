import { afterEach, expect, it, vi } from 'vitest';
import { ApiClient } from './api';
afterEach(() => vi.unstubAllGlobals());
it('scopes historical result requests without changing current-session defaults', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: null }) });
  vi.stubGlobal('fetch', fetchMock);
  const client = new ApiClient();
  await client.getSawResults(7);
  await client.getBordaResults(7);
  await client.getSawResults();
  await client.getBordaResults();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/results/saw/me?session_id=7', '/api/results/borda?session_id=7',
    '/api/results/saw/me', '/api/results/borda',
  ]);
});
