import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
  fetchUserAttributes: vi.fn(),
}));

function ProfileProbe() {
  const { userAttributes } = useAuth();
  return (
    <span>
      {`${userAttributes.name || ''}|${userAttributes.email || ''}|${userAttributes.picture || ''}`}
    </span>
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
  });
});
