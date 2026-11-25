import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { api } from '@/services/api';

vi.mock('@/services/api', () => ({ api: {
  getStoredUser: vi.fn(), getToken: vi.fn(), getMe: vi.fn(), logout: vi.fn(),
  clearSession: vi.fn(), setStoredUser: vi.fn(), login: vi.fn(), setUnauthorizedHandler: vi.fn(),
} }));
const first = { id: 1, username: 'dm1', name: 'One', role: 'chair' as const };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getStoredUser).mockReturnValue(first);
  vi.mocked(api.getToken).mockReturnValue('old');
  vi.mocked(api.getMe).mockResolvedValue({ success: true, data: first, message: '' });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(() => useAuth(), { wrapper: ({ children }) =>
    <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider> });
  return { client, ...hook };
}
it.each(['logout', 'unauthorized', 'login'] as const)('clears cached and late query data on %s', async (transition) => {
  const { client, result } = setup();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  client.setQueryData(['private'], 'old identity');
  let resolve!: (value: string) => void;
  const pending = client.fetchQuery({ queryKey: ['late'], queryFn: () => new Promise<string>(r => { resolve = r; }) }).catch(() => undefined);
  await act(async () => {
    if (transition === 'logout') await result.current.logout();
    if (transition === 'unauthorized') vi.mocked(api.setUnauthorizedHandler).mock.calls[vi.mocked(api.setUnauthorizedHandler).mock.calls.length - 1][0]();
    if (transition === 'login') {
      vi.mocked(api.login).mockResolvedValue({ success: true, message: '', data: { token: 'new', token_type: 'Bearer', expires_in: 3600, user: { ...first, id: 2 } } });
      await result.current.login('dm2', 'password');
    }
  });
  resolve('late old identity');
  await pending;
  expect(client.getQueryData(['private'])).toBeUndefined();
  expect(client.getQueryData(['late'])).toBeUndefined();
});
