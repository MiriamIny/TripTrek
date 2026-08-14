import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { tripApiFetch } from '../api/tripApi';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
  fetchUserAttributes: vi.fn(),
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

describe('AuthProvider', () => {
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
});
