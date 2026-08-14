import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthenticator } from '@aws-amplify/ui-react';
import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signOut as cognitoSignOut,
} from 'aws-amplify/auth';
import { tripApiFetch } from '../api/tripApi';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
  fetchUserAttributes: vi.fn(),
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../api/tripApi', () => ({ tripApiFetch: vi.fn() }));

function ProfileProbe() {
  const { authNotice, userAttributes } = useAuth();
  return (
    <>
      <span>{`${userAttributes.name || ''}|${userAttributes.email || ''}|${userAttributes.picture || ''}`}</span>
      {authNotice && <span>{authNotice.title}</span>}
    </>
  );
}

function SignOutProbe() {
  const { isAuthenticated, signOut, user } = useAuth();
  return (
    <>
      <span>{isAuthenticated ? `Signed in:${user?.userId}` : 'Signed out'}</span>
      <button type="button" onClick={signOut}>Sign out</button>
    </>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('clears direct email sessions and updates the UI without a refresh', async () => {
    const providerSignOut = vi.fn().mockResolvedValue(undefined);
    useAuthenticator.mockReturnValue({
      user: { userId: 'email-user' },
      signOut: providerSignOut,
      authStatus: 'authenticated',
    });
    cognitoSignOut.mockResolvedValue(undefined);
    fetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { email: 'email@example.com' } } },
    });
    fetchUserAttributes.mockResolvedValue({ email: 'email@example.com' });
    tripApiFetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ profile: {} }) });

    render(<AuthProvider><SignOutProbe /></AuthProvider>);
    expect(screen.getByText('Signed in:email-user')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    await waitFor(() => {
      expect(cognitoSignOut).toHaveBeenCalledTimes(1);
      expect(providerSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('uses ID-token claims when the Cognito user-attributes request is unavailable', async () => {
    useAuthenticator.mockReturnValue({
      user: { userId: 'google-user' },
      signOut: vi.fn(),
      authStatus: 'authenticated',
    });
    fetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            name: 'Miriam Iny',
            email: 'miriaminy123@gmail.com',
            picture: 'https://example.com/miriam.jpg',
          },
        },
      },
    });
    fetchUserAttributes.mockRejectedValue(new Error('Access token scope unavailable'));
    tripApiFetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ merged: false }) });

    render(
      <AuthProvider>
        <ProfileProbe />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(
        'Miriam Iny|miriaminy123@gmail.com|https://example.com/miriam.jpg',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Welcome back, Miriam Iny!')).toBeInTheDocument();
  });

  it('shows the merge notice only when the backend consumes a pending first-link event', async () => {
    useAuthenticator.mockReturnValue({
      user: { userId: 'merged-user' },
      signOut: vi.fn(),
      authStatus: 'authenticated',
    });
    fetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { name: 'Miriam Iny', email: 'miriam@example.com' } } },
    });
    fetchUserAttributes.mockResolvedValue({ name: 'Miriam Iny', email: 'miriam@example.com' });
    tripApiFetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ merged: true }) });

    render(<AuthProvider><ProfileProbe /></AuthProvider>);
    expect(await screen.findByText('Your accounts are connected')).toBeInTheDocument();
    expect(tripApiFetch).toHaveBeenCalledWith('accountLookup');
  });

  it('resolves the Cognito user and profile after a direct password sign-in', async () => {
    useAuthenticator.mockReturnValue({
      user: undefined,
      signOut: vi.fn(),
      authStatus: 'authenticated',
    });
    getCurrentUser.mockResolvedValue({ userId: 'resolved-password-user' });
    fetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { name: 'Shoshana Katz', email: 'shoshana@example.com' } } },
    });
    fetchUserAttributes.mockResolvedValue({
      name: 'Shoshana Katz',
      email: 'shoshana@example.com',
    });
    tripApiFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        merged: false,
        profile: { name: 'Shoshana Katz' },
      }),
    });

    render(<AuthProvider><ProfileProbe /></AuthProvider>);

    expect(await screen.findByText('Shoshana Katz|shoshana@example.com|')).toBeInTheDocument();
    expect(await screen.findByText('Welcome back, Shoshana Katz!')).toBeInTheDocument();
    expect(getCurrentUser).toHaveBeenCalledOnce();
  });

  it('preserves the entered name in the first-time welcome message', async () => {
    window.sessionStorage.setItem('trek-a-trip:new-account-welcome', JSON.stringify({
      email: 'shoshana@example.com',
      name: 'Shoshana Katz',
    }));
    useAuthenticator.mockReturnValue({
      user: { userId: 'new-user' },
      signOut: vi.fn(),
      authStatus: 'authenticated',
    });
    fetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { name: 'Shoshana Katz', email: 'shoshana@example.com' } } },
    });
    fetchUserAttributes.mockResolvedValue({ name: 'Shoshana Katz', email: 'shoshana@example.com' });
    tripApiFetch.mockResolvedValue({ json: vi.fn().mockResolvedValue({ merged: false }) });

    render(<AuthProvider><ProfileProbe /></AuthProvider>);

    expect(await screen.findByText('Welcome, Shoshana Katz!')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('trek-a-trip:new-account-welcome')).toBeNull();
  });
});
