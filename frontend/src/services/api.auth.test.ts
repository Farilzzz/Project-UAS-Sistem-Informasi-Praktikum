import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api';

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it.each(['replacement token', 'same token after logout'])(
  'preserves the new session when an old request returns 401: %s',
  async (transition) => {
    let reply!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { reply = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient();
    const unauthorized = vi.fn();
    client.setUnauthorizedHandler(unauthorized);
    client.setToken('old-token');
    const pending = client.getMe();
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    if (transition === 'same token after logout') client.clearSession();
    const newToken = transition === 'replacement token' ? 'new-token' : 'old-token';
    client.setToken(newToken);
    sessionStorage.setItem('gdss_user', JSON.stringify({ id: 2 }));

    reply(new Response(JSON.stringify({ success: false, message: 'expired' }), { status: 401 }));
    await rejected;

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer old-token' } });
    expect(client.getToken()).toBe(newToken);
    expect(sessionStorage.getItem('gdss_token')).toBe(newToken);
    expect(client.getStoredUser()).toEqual({ id: 2 });
    expect(unauthorized).not.toHaveBeenCalled();
  },
);
