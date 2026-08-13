import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Authenticator, IconsProvider, useAuthenticator } from '@aws-amplify/ui-react';
import {
  confirmResetPassword,
  resetPassword,
  signIn,
  signInWithRedirect,
  signUp,
} from 'aws-amplify/auth';
import { Modal } from 'react-bootstrap';
import { publicTripApiFetch, tripApiFetch } from '../api/tripApi';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/TrekATripLogo.png';
import './AuthModal.css';

const getFormFields = (email = '') => ({
  signUp: {
    name: {
      order: 1,
      label: 'Name',
      placeholder: 'Name',
      isRequired: true,
    },
    email: {
      order: 2,
      label: 'Email',
      placeholder: 'Email',
      defaultValue: email,
      isReadOnly: true,
      isRequired: true,
    },
    password: {
      order: 3,
      label: 'Password',
      placeholder: 'Password',
      showPasswordButtonLabel: 'Toggle password visibility',
      passwordIsHiddenLabel: 'Password hidden',
      passwordIsShownLabel: 'Password revealed',
      isRequired: true,
    },
    confirm_password: {
      order: 4,
      label: 'Reenter password',
      placeholder: 'Reenter password',
      showPasswordButtonLabel: 'Toggle password visibility',
      passwordIsHiddenLabel: 'Password hidden',
      passwordIsShownLabel: 'Password revealed',
      isRequired: true,
    },
  },
  signIn: {
    username: {
      label: 'Email',
      placeholder: 'Email',
      defaultValue: email,
    },
    password: {
      label: 'Password',
      placeholder: ' ',
      showPasswordButtonLabel: 'Toggle password visibility',
      passwordIsHiddenLabel: 'Password hidden',
      passwordIsShownLabel: 'Password revealed',
    },
  },
  confirmSignUp: {
    confirmation_code: {
      label: 'Verification code',
      placeholder: 'Enter verification code',
    },
  },
  forgotPassword: {
    username: {
      label: 'Email',
      placeholder: 'Email',
      defaultValue: email,
    },
  },
  confirmResetPassword: {
    confirmation_code: {
      label: 'Verification code',
      placeholder: 'Enter verification code',
    },
  },
});

function SignInFooter() {
  const { toForgotPassword } = useAuthenticator((context) => [
    context.toForgotPassword,
  ]);

  return (
    <div className="auth-form-footer">
      <button type="button" className="auth-text-link" onClick={toForgotPassword}>
        Forgot your password?
      </button>
    </div>
  );
}

function SignUpFooter() {
  return null;
}

const authenticatorComponents = {
  Header() {
    return null;
  },
  SignIn: {
    Header() {
      return null;
    },
    Footer: SignInFooter,
  },
  SignUp: {
    Header() {
      return null;
    },
    Footer: SignUpFooter,
  },
};

function GoogleIcon() {
  return (
    <svg className="auth-google-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
    </svg>
  );
}

function EyeOpenIcon() {
  return (
    <svg className="auth-password-eye" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg className="auth-password-eye" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.4 4.4 19.6 19.6M9.8 6.2A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.2 2.9M14.5 17.7A9.8 9.8 0 0 1 12 18c-6 0-9.5-6-9.5-6a16.8 16.8 0 0 1 3.1-3.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

const passwordIcons = {
  passwordField: {
    visibility: <EyeClosedIcon />,
    visibilityOff: <EyeOpenIcon />,
  },
};

const authenticatorServices = {
  async handleSignUp(input) {
    try {
      return await signUp(input);
    } catch (error) {
      if (['UsernameExistsException', 'AliasExistsException'].includes(error?.name)) {
        throw new Error(
          'An account already exists for this email. Continue with Google, or choose Sign in and Forgot your password to add an email password.',
        );
      }
      throw error;
    }
  },
};

const inlineSignInComponents = {
  Header() {
    return null;
  },
  SignIn: {
    Header() {
      return null;
    },
    Footer: SignInFooter,
  },
};

function GooglePasswordSetup({ email, onBack, onComplete }) {
  const [confirmationCode, setConfirmationCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage('Passwords must match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: confirmationCode.trim(),
        newPassword: password,
      });
      await signIn({ username: email, password });
      await tripApiFetch('accountLookup', { method: 'PATCH' });
      onComplete();
    } catch (error) {
      console.error('Unable to add an email password:', error);
      setErrorMessage(error?.message || 'We could not add your password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-email-stage auth-sign-up-stage auth-google-password-stage">
      <button
        type="button"
        className="auth-back-button auth-back-button--icon"
        onClick={onBack}
        aria-label="Back"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
      </button>
      <img src={logo} alt="Trek A Trip" className="auth-logo auth-sign-up-logo" />
      <h3 className="auth-sign-up-heading">Verify your email to add a password</h3>
      <p className="auth-google-account-copy">
        A Google account already uses <strong>{email}</strong>. We sent a verification code to that
        address so you can safely add email-and-password sign in to the same account.
      </p>
      <form className="auth-google-password-form" onSubmit={submit}>
        <label htmlFor="auth-google-email">Email address</label>
        <input id="auth-google-email" type="email" value={email} readOnly aria-readonly="true" />
        <label htmlFor="auth-google-code">Verification code</label>
        <input
          id="auth-google-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={confirmationCode}
          onChange={(event) => setConfirmationCode(event.target.value)}
          required
        />
        <label htmlFor="auth-google-password">Password</label>
        <input
          id="auth-google-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label htmlFor="auth-google-confirm-password">Reenter password</label>
        <input
          id="auth-google-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        {errorMessage && <p className="auth-email-error" role="alert">{errorMessage}</p>}
        <button type="submit" className="auth-choice-button auth-email-button" disabled={isSubmitting}>
          {isSubmitting ? 'Adding password...' : 'Add password'}
        </button>
      </form>
    </div>
  );
}

function PasswordRequirements() {
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({
    left: 12,
    top: 12,
    width: 280,
    placement: 'right',
  });

  useEffect(() => {
    if (!isVisible) return undefined;

    const updateTooltipPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const viewportPadding = 12;
      const gap = 10;
      const triggerRect = trigger.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - viewportPadding * 2);
      const tooltipHeight = tooltipRef.current?.getBoundingClientRect().height || 128;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - viewportPadding - width);
      const maxTop = Math.max(viewportPadding, window.innerHeight - viewportPadding - tooltipHeight);

      let placement = 'right';
      let left = triggerRect.right + gap;
      let top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;

      if (left + width > window.innerWidth - viewportPadding) {
        placement = 'bottom';
        left = Math.min(Math.max(triggerRect.left, viewportPadding), maxLeft);
        top = triggerRect.bottom + gap;

        if (top + tooltipHeight > window.innerHeight - viewportPadding) {
          placement = 'top';
          top = triggerRect.top - gap - tooltipHeight;
        }
      }

      setTooltipPosition({
        left: Math.min(Math.max(left, viewportPadding), maxLeft),
        top: Math.min(Math.max(top, viewportPadding), maxTop),
        width,
        placement,
      });
    };

    updateTooltipPosition();
    const animationFrame = window.requestAnimationFrame(updateTooltipPosition);
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [isVisible]);

  const tooltip = (
    <div
      ref={tooltipRef}
      id="password-requirements-tooltip"
      className={`password-requirements-tooltip${isVisible ? ' password-requirements-tooltip--visible' : ''}`}
      data-placement={tooltipPosition.placement}
      role="tooltip"
      style={{
        left: tooltipPosition.left,
        top: tooltipPosition.top,
        width: tooltipPosition.width,
      }}
    >
      <strong>Password requirements</strong>
      <ul>
        <li>At least 8 characters</li>
        <li>One uppercase and one lowercase letter</li>
        <li>One number and one special character</li>
      </ul>
    </div>
  );

  return (
    <div
      className="password-requirements"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className="password-requirements-trigger"
        aria-label="View password requirements"
        aria-describedby="password-requirements-tooltip"
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10.5v6M12 7.5h.01" />
        </svg>
      </button>
      {createPortal(tooltip, document.body)}
    </div>
  );
}

function PasswordRequirementsPortal({ containerRef, enabled }) {
  const [portalHost, setPortalHost] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setPortalHost(null);
      return undefined;
    }

    const container = containerRef.current;
    if (!container) return undefined;
    let host;

    const locatePasswordField = () => {
      const passwordField = container.querySelector('.amplify-passwordfield');
      const passwordLabel = passwordField?.querySelector('.amplify-label');

      if (!passwordField || !passwordLabel) {
        setPortalHost(null);
        return;
      }

      host = passwordField.querySelector('[data-password-requirements-host]');
      if (!host) {
        host = document.createElement('span');
        host.className = 'password-requirements-host';
        host.dataset.passwordRequirementsHost = '';
        passwordLabel.insertAdjacentElement('afterend', host);
      }

      setPortalHost(host);
    };

    locatePasswordField();
    const observer = new MutationObserver(locatePasswordField);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      host?.remove();
    };
  }, [containerRef, enabled]);

  if (!enabled || !portalHost) return null;

  return createPortal(<PasswordRequirements />, portalHost);
}

function AuthenticatorCopy({ containerRef, hideUsername = false, lockEmail = false }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateCopy = () => {
      const signInForm = container.querySelector(
        'form[data-amplify-form][data-amplify-authenticator-signin]',
      );
      const submitButton = signInForm?.querySelector('.amplify-button--primary');
      if (submitButton && submitButton.textContent?.trim() === 'Sign in') {
        submitButton.textContent = 'Sign in';
      }
      const usernameInput = signInForm?.querySelector('input[name="username"]');
      const usernameField = usernameInput?.closest('.amplify-field');
      if (hideUsername && usernameField) usernameField.classList.add('auth-prefilled-email-field');

      const passwordInput = signInForm?.querySelector('input[name="password"]');
      const passwordField = passwordInput?.closest('.amplify-passwordfield');
      if (passwordField) passwordField.classList.add('auth-inline-password-field');

      const signUpEmailInput = container.querySelector(
        'form[data-amplify-form][data-amplify-authenticator-signup] input[name="email"]',
      );
      if (lockEmail && signUpEmailInput) {
        signUpEmailInput.readOnly = true;
        signUpEmailInput.setAttribute('aria-readonly', 'true');
        signUpEmailInput.closest('.amplify-field')?.classList.add('auth-verified-email-field');
      }
    };

    updateCopy();
    const observer = new MutationObserver(updateCopy);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, hideUsername, lockEmail]);

  return null;
}

export default function AuthModal() {
  const { isAuthModalOpen, closeAuth } = useAuth();
  const [authStage, setAuthStage] = useState('choice');
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const authContentRef = useRef(null);

  const openSignUp = () => {
    setAuthStage('signUp');
    setEmailError('');
    setSuccessMessage('');
    setGoogleError('');
  };

  const returnToChoice = () => {
    setAuthStage('choice');
    setShowPassword(false);
    setEmailError('');
    setSuccessMessage('');
  };

  const continueWithGoogle = async () => {
    setGoogleError('');
    setIsGoogleLoading(true);

    try {
      window.sessionStorage.setItem('trek-a-trip:google-sign-in-pending', String(Date.now()));
      await signInWithRedirect({
        provider: 'Google',
        options: { prompt: 'SELECT_ACCOUNT' },
      });
    } catch (error) {
      window.sessionStorage.removeItem('trek-a-trip:google-sign-in-pending');
      console.error('Unable to start Google sign-in:', error);
      setGoogleError('Google sign-in could not be started. Please try again or continue with email.');
      setIsGoogleLoading(false);
    }
  };

  const handleClose = () => {
    setAuthStage('choice');
    setShowPassword(false);
    setIsGoogleLoading(false);
    setIsEmailLoading(false);
    setGoogleError('');
    setEmailError('');
    setSuccessMessage('');
    closeAuth();
  };

  const continueWithEmail = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !event.currentTarget.checkValidity()) {
      setEmailError('Enter a valid email address to continue.');
      return;
    }

    window.sessionStorage.removeItem('trek-a-trip:google-sign-in-pending');
    setEmail(normalizedEmail);
    setEmailError('');
    setSuccessMessage('');
    setIsEmailLoading(true);

    try {
      const response = await publicTripApiFetch('accountLookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const { accountType } = await response.json();

      if (accountType === 'none') {
        openSignUp();
      } else if (accountType === 'google') {
        const result = await resetPassword({ username: normalizedEmail });
        if (
          result.nextStep?.resetPasswordStep !== 'CONFIRM_RESET_PASSWORD_WITH_CODE'
          && !result.isPasswordReset
        ) {
          throw new Error('Cognito did not start email verification. Please try again.');
        }
        setAuthStage('googlePassword');
      } else if (accountType === 'password') {
        setShowPassword(true);
      } else {
        throw new Error('The account check returned an invalid response.');
      }
    } catch (error) {
      console.error('Unable to continue with email:', error);
      setEmailError(error?.message || 'We could not check that email. Please try again.');
    } finally {
      setIsEmailLoading(false);
    }
  };

  const services = {
    ...authenticatorServices,
    async handleSignIn(input) {
      try {
        return await signIn(input);
      } catch (error) {
        if (error?.name === 'UserNotFoundException') openSignUp();
        throw error;
      }
    },
  };

  return (
    <Modal
      show={isAuthModalOpen}
      onHide={handleClose}
      centered
      size="lg"
      className="auth-modal"
      aria-labelledby="auth-modal-title"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" id="auth-modal-title">
          Sign in or create account
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {authStage === 'googlePassword' ? (
          <GooglePasswordSetup
            email={email}
            onBack={returnToChoice}
            onComplete={() => {
              setSuccessMessage('Password added. You are now signed in.');
            }}
          />
        ) : authStage === 'signUp' ? (
          <div className="auth-email-stage auth-sign-up-stage" ref={authContentRef}>
            <button
              type="button"
              className="auth-back-button auth-back-button--icon"
              onClick={returnToChoice}
              aria-label="Back"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
            </button>
            <img src={logo} alt="Trek A Trip" className="auth-logo auth-sign-up-logo" />
            <h3 className="auth-sign-up-heading">Get started by creating an account</h3>
            <IconsProvider icons={passwordIcons}>
              <Authenticator
                key={`sign-up-${email}`}
                initialState="signUp"
                loginMechanisms={['email']}
                signUpAttributes={['name']}
                formFields={getFormFields(email)}
                components={authenticatorComponents}
                services={services}
              />
            </IconsProvider>
            <PasswordRequirementsPortal
              containerRef={authContentRef}
              enabled
            />
            <AuthenticatorCopy containerRef={authContentRef} lockEmail />
          </div>
        ) : (
          <section className="auth-choice" aria-label="Sign in options">
            <img src={logo} alt="Trek A Trip" className="auth-logo" />

            <button
              type="button"
              className="auth-choice-button auth-google-button"
              onClick={continueWithGoogle}
              disabled={isGoogleLoading}
            >
              <GoogleIcon />
              <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>

            <div className="auth-divider"><span>or</span></div>

            <form className="auth-email-choice" onSubmit={continueWithEmail} noValidate>
              <div className="auth-floating-field">
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder=" "
                  value={email}
                  required
                  aria-describedby={emailError ? 'auth-email-error' : undefined}
                  aria-invalid={Boolean(emailError)}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (showPassword) setShowPassword(false);
                    if (emailError) setEmailError('');
                  }}
                />
                <label htmlFor="auth-email">Email address</label>
              </div>
              {emailError && (
                <p id="auth-email-error" className="auth-email-error" role="alert">{emailError}</p>
              )}
              {!showPassword && (
                <button
                  type="submit"
                  className="auth-choice-button auth-email-button"
                  disabled={isEmailLoading}
                >
                  {isEmailLoading ? 'Checking email...' : 'Continue with email'}
                </button>
              )}
            </form>

            {showPassword && (
              <div className="auth-inline-sign-in" ref={authContentRef}>
                <IconsProvider icons={passwordIcons}>
                  <Authenticator
                    key={`sign-in-${email}`}
                    initialState="signIn"
                    loginMechanisms={['email']}
                    formFields={getFormFields(email)}
                    components={inlineSignInComponents}
                    services={services}
                  />
                </IconsProvider>
                <AuthenticatorCopy containerRef={authContentRef} hideUsername />
              </div>
            )}

            {successMessage && <p className="auth-success-message" role="status">{successMessage}</p>}

            {googleError && <p className="auth-choice-error" role="alert">{googleError}</p>}

          </section>
        )}
      </Modal.Body>
    </Modal>
  );
}
