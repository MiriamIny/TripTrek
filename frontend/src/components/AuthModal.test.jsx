import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import {
  confirmSignUp,
  confirmResetPassword,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';
import { publicTripApiFetch, tripApiFetch } from '../api/tripApi';
import AuthModal from './AuthModal';

const authContextState = vi.hoisted(() => ({
  isAuthModalOpen: true,
  closeAuth: vi.fn(),
}));

const authenticatorNavigation = vi.hoisted(() => ({
  toSignIn: vi.fn(),
  toSignUp: vi.fn(),
  toForgotPassword: vi.fn(),
}));

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
  confirmSignUp: vi.fn(),
  confirmResetPassword: vi.fn(),
  resendSignUpCode: vi.fn(),
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
  useAuth: () => authContextState,
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
    authContextState.isAuthModalOpen = true;
    authContextState.closeAuth = vi.fn();
    useAuthenticator.mockReturnValue(authenticatorNavigation);
    publicTripApiFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ accountType: 'password' }),
    });
    signIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    signUp.mockResolvedValue({
      isSignUpComplete: false,
      nextStep: { signUpStep: 'CONFIRM_SIGN_UP' },
    });
    confirmSignUp.mockResolvedValue({ isSignUpComplete: true });
    resendSignUpCode.mockResolvedValue({});
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
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(publicTripApiFetch).toHaveBeenCalledWith('accountLookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'miriam@example.com' }),
    }));
    expect(screen.queryByRole('button', { name: 'Continue with email' })).not.toBeInTheDocument();
    expect(authenticatorNavigation.toSignIn).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith({
      username: 'miriam@example.com',
      password: 'Password1!',
    }));
    expect(authContextState.closeAuth).toHaveBeenCalled();
  });

  it('always releases the sign-in loading state when Cognito rejects the password', async () => {
    const error = new Error('Incorrect username or password.');
    error.name = 'NotAuthorizedException';
    signIn.mockRejectedValueOnce(error);
    render(<AuthModal />);
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));

    fireEvent.change(await screen.findByLabelText('Password'), {
      target: { value: 'WrongPassword1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Signing in...' })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('miriam@example.com');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
    const requirementsButton = await screen.findByRole('button', {
      name: 'View password requirements',
    });
    expect(requirementsButton).toHaveAttribute(
      'aria-describedby',
      'password-requirements-tooltip',
    );
    fireEvent.mouseEnter(requirementsButton.closest('.password-requirements'));
    await waitFor(() => {
      expect(screen.getByRole('tooltip').parentElement).toHaveClass('auth-sign-up-stage');
    });
    expect(screen.queryByText(/passwords match/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue('');
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
    const passwordInput = screen.getByLabelText('Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm password');
    expect(passwordInput).toHaveAttribute('placeholder', ' ');
    expect(confirmPasswordInput).toHaveAttribute('placeholder', ' ');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Password hidden. Reveal password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Password revealed. Hide password' })).toBeInTheDocument();
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'NewPassword1!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'NewPassword1!' } });
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

    const error = new Error('User already exists');
    error.name = 'UsernameExistsException';
    signUp.mockRejectedValueOnce(error);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Miriam Iny' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Go back and continue with that email/);
  });

  it('prefills the newly checked email after returning from account creation', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    publicTripApiFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({ accountType: 'none' }),
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
      target: { value: 'different@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));

    await waitFor(() => expect(publicTripApiFetch).toHaveBeenLastCalledWith(
      'accountLookup',
      expect.objectContaining({ body: JSON.stringify({ email: 'different@example.com' }) }),
    ));
    expect(await screen.findByRole('heading', { name: 'Get started by creating an account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('different@example.com');
    expect(screen.getByLabelText('Email address')).not.toHaveValue('miriam@example.com');
  });

  it('shows only password errors after blur and removes them while the user fixes the field', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();

    const password = screen.getByLabelText('Password');
    const confirmation = screen.getByLabelText('Confirm password');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(password, { target: { value: 'short' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.blur(password);
    expect(screen.getByRole('alert')).toHaveTextContent(/Password needs/);

    fireEvent.focus(password);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(password, { target: { value: 'Password1!' } });
    fireEvent.blur(password);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/passwords match/i)).not.toBeInTheDocument();

    fireEvent.change(confirmation, { target: { value: 'Different1!' } });
    fireEvent.blur(confirmation);
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    fireEvent.focus(confirmation);
    fireEvent.change(confirmation, { target: { value: 'Password1!' } });
    fireEvent.blur(confirmation);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/passwords match/i)).not.toBeInTheDocument();
  });

  it('creates and confirms the exact checked email with name and password', async () => {
    render(<AuthModal />);
    await openSignUpForUnknownEmail();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Miriam Iny' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      username: 'miriam@example.com',
      password: 'Password1!',
      options: {
        userAttributes: {
          email: 'miriam@example.com',
          name: 'Miriam Iny',
        },
      },
    }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    await waitFor(() => expect(confirmSignUp).toHaveBeenCalledWith({
      username: 'miriam@example.com',
      confirmationCode: '123456',
    }));
    expect(signIn).toHaveBeenCalledWith({
      username: 'miriam@example.com',
      password: 'Password1!',
    });
    expect(authContextState.closeAuth).toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem('trek-a-trip:new-account-welcome'))).toEqual({
      email: 'miriam@example.com',
      name: 'Miriam Iny',
    });
  });

  it('always reopens on a clear first-choice screen', async () => {
    const { rerender } = render(<AuthModal />);
    await openSignUpForUnknownEmail();

    authContextState.isAuthModalOpen = false;
    rerender(<AuthModal />);
    authContextState.isAuthModalOpen = true;
    rerender(<AuthModal />);

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue('');
    expect(screen.queryByRole('heading', { name: 'Get started by creating an account' })).not.toBeInTheDocument();
  });
});
