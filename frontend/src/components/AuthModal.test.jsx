import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Authenticator } from '@aws-amplify/ui-react';
import { signInWithRedirect } from 'aws-amplify/auth';
import AuthModal from './AuthModal';

vi.mock('@aws-amplify/ui-react', () => ({
  Authenticator: vi.fn(() => (
    <div data-testid="authenticator">
      <div className="amplify-passwordfield">
        <label className="amplify-label">Password</label>
      </div>
    </div>
  )),
  IconsProvider: ({ children }) => children,
  useAuthenticator: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  signInWithRedirect: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthModalOpen: true,
    closeAuth: vi.fn(),
  }),
}));

vi.mock('../assets/TripTrekLogo.png', () => ({
  default: 'mocked-logo-path',
}));

describe('AuthModal', () => {
  it('shows the standard Google-or-email choice for sign in', () => {
    render(<AuthModal />);

    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByText(/Don't have an account?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
    expect(screen.queryByTestId('authenticator')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
    expect(screen.queryByRole('button', { name: 'View password requirements' })).not.toBeInTheDocument();
  });

  it('starts the Google redirect with the Google provider', async () => {
    render(<AuthModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(signInWithRedirect).toHaveBeenCalledWith({
        provider: 'Google',
        options: { prompt: 'SELECT_ACCOUNT' },
      });
    });
  });

  it('opens the Cognito email form in the selected mode', async () => {
    render(<AuthModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Create one' }));
    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByText(/Already have an account?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));

    expect(screen.getByTestId('authenticator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Google or email options' })).toBeInTheDocument();
    const requirementsButton = await screen.findByRole('button', {
      name: 'View password requirements',
    });
    expect(requirementsButton).toHaveAttribute(
      'aria-describedby',
      'password-requirements-tooltip',
    );
    expect(requirementsButton.closest('.password-requirements-host')?.previousElementSibling).toHaveTextContent(
      'Password',
    );
    fireEvent.mouseEnter(requirementsButton.parentElement);
    expect(screen.getByRole('tooltip')).toHaveClass('password-requirements-tooltip--visible');
    expect(screen.getByRole('tooltip').parentElement).toBe(document.body);
    expect(Authenticator).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: 'signUp',
        loginMechanisms: ['email'],
        formFields: expect.objectContaining({
          signIn: expect.objectContaining({
            password: expect.objectContaining({
              passwordIsHiddenLabel: 'Password hidden',
              passwordIsShownLabel: 'Password revealed',
            }),
          }),
        }),
      }),
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to Google or email options' }));
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByTestId('authenticator')).not.toBeInTheDocument();
  });
});
