import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Authenticator } from '@aws-amplify/ui-react';
import {
  confirmResetPassword,
  resetPassword,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';
import { publicTripApiFetch, tripApiFetch } from '../api/tripApi';
import AuthModal from './AuthModal';

vi.mock('@aws-amplify/ui-react', () => ({
  Authenticator: vi.fn(({ initialState }) => (
    <div data-testid={`authenticator-${initialState}`}>
      <div className="amplify-passwordfield">
        <label className="amplify-label">Password</label>
      </div>
    </div>
  )),
  IconsProvider: ({ children }) => children,
  useAuthenticator: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  confirmResetPassword: vi.fn(),
  resetPassword: vi.fn(),
  signIn: vi.fn(),
  signInWithRedirect: vi.fn(() => new Promise(() => {})),
  signUp: vi.fn(),
}));

vi.mock('../api/tripApi', () => ({
  publicTripApiFetch: vi.fn(),
  tripApiFetch: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthModalOpen: true,
    closeAuth: vi.fn(),
  }),
}));

vi.mock('../assets/TrekATripLogo.png', () => ({
  default: 'mocked-logo-path',
}));

const enterEmail = () => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
    target: { value: 'miriam@example.com' },
  });
};

const openSignUpForUnknownEmail = async () => {
  publicTripApiFetch.mockResolvedValueOnce({
    json: vi.fn().mockResolvedValue({ accountType: 'none' }),
  });
  enterEmail();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
  await screen.findByRole('heading', { name: 'Get started by creating an account' });
};

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicTripApiFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ accountType: 'password' }),
    });
    signIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    tripApiFetch.mockResolvedValue({});
  });

  it('starts with one sign-in or account-creation view without account mode tabs', () => {
    render(<AuthModal />);

    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveAttribute('placeholder', ' ');
    expect(screen.queryByText(/Plan, save, and share/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('authenticator-signIn')).not.toBeInTheDocument();
  });

  it('expands password sign-in in the same choice card and carries the email forward', async () => {
    render(<AuthModal />);
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));

    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(await screen.findByTestId('authenticator-signIn')).toBeInTheDocument();
    expect(publicTripApiFetch).toHaveBeenCalledWith('accountLookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'miriam@example.com' }),
    }));
    expect(screen.queryByRole('button', { name: 'Continue with email' })).not.toBeInTheDocument();
    expect(Authenticator).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialState: 'signIn',
        loginMechanisms: ['email'],
        formFields: expect.objectContaining({
          signIn: expect.objectContaining({
            username: expect.objectContaining({ defaultValue: 'miriam@example.com' }),
          }),
        }),
      }),
      undefined,
    );
  });

  it('starts the Google redirect with account selection', async () => {
    render(<AuthModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => {
      expect(signInWithRedirect).toHaveBeenCalledWith({
        provider: 'Google',
        options: { prompt: 'SELECT_ACCOUNT' },
      });
    });
  });

  it('opens Get started account creation with email prefilled and a back button', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();

    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Get started by creating an account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByTestId('authenticator-signUp')).toBeInTheDocument();
    const requirementsButton = await screen.findByRole('button', {
      name: 'View password requirements',
    });
    expect(requirementsButton).toHaveAttribute(
      'aria-describedby',
      'password-requirements-tooltip',
    );
    expect(Authenticator).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialState: 'signUp',
        formFields: expect.objectContaining({
          signUp: expect.objectContaining({
            name: expect.objectContaining({
              label: 'Name',
              isRequired: true,
            }),
            email: expect.objectContaining({
              defaultValue: 'miriam@example.com',
              isReadOnly: true,
            }),
            password: expect.objectContaining({
              label: 'Password',
              isRequired: true,
            }),
            confirm_password: expect.objectContaining({
              label: 'Reenter password',
              isRequired: true,
            }),
          }),
        }),
        signUpAttributes: ['name'],
      }),
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeInTheDocument();
  });

  it('advances a definitive unknown email response to account creation', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Get started by creating an account' })).toBeInTheDocument();
    });
  });

  it('routes a Google-linked account through email verification before adding a password', async () => {
    publicTripApiFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({ accountType: 'google' }),
    });
    resetPassword.mockResolvedValueOnce({
      isPasswordReset: false,
      nextStep: { resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' },
    });
    confirmResetPassword.mockResolvedValueOnce();
    render(<AuthModal />);
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));

    expect(await screen.findByRole('heading', {
      name: 'Verify your email to add a password',
    })).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledWith({ username: 'miriam@example.com' });
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'NewPassword1!' } });
    fireEvent.change(screen.getByLabelText('Reenter password'), { target: { value: 'NewPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add password' }));

    await waitFor(() => expect(confirmResetPassword).toHaveBeenCalledWith({
      username: 'miriam@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPassword1!',
    }));
    expect(signIn).toHaveBeenCalledWith({
      username: 'miriam@example.com',
      password: 'NewPassword1!',
    });
    expect(tripApiFetch).toHaveBeenCalledWith('accountLookup', { method: 'PATCH' });
  });

  it('turns a duplicate-email sign-up error into account-linking guidance', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();

    const services = Authenticator.mock.calls.at(-1)[0].services;
    const error = new Error('User already exists');
    error.name = 'UsernameExistsException';
    signUp.mockRejectedValueOnce(error);

    await expect(services.handleSignUp({ username: 'miriam@example.com' })).rejects.toThrow(
      /Go back and continue with that email/,
    );
  });

  it('checks the newly typed email after returning from account creation', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: 'different@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));

    await waitFor(() => expect(publicTripApiFetch).toHaveBeenLastCalledWith(
      'accountLookup',
      expect.objectContaining({ body: JSON.stringify({ email: 'different@example.com' }) }),
    ));
  });
});
