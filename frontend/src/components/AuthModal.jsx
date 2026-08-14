import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Authenticator, IconsProvider, useAuthenticator } from '@aws-amplify/ui-react';
import {
  confirmSignUp,
  confirmResetPassword,
  resendSignUpCode,
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
      placeholder: ' ',
    },
  },
  forgotPassword: {
    username: {
      label: 'Email',
      placeholder: ' ',
      defaultValue: email,
    },
  },
  confirmResetPassword: {
    confirmation_code: {
      label: 'Verification code',
      placeholder: ' ',
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

function AuthFloatingField({
  id,
  label,
  className = '',
  endAdornment = null,
  ...inputProps
}) {
  return (
    <div className={`auth-floating-field${endAdornment ? ' auth-floating-field--with-end' : ''}${className ? ` ${className}` : ''}`}>
      <input id={id} placeholder=" " {...inputProps} />
      <label htmlFor={id}>{label}</label>
      {endAdornment}
    </div>
  );
}

function AuthPasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = 'new-password',
  showRequirements = false,
  ...inputProps
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const accessibilityLabel = isRevealed
    ? `${label} revealed. Hide ${label.toLowerCase()}`
    : `${label} hidden. Reveal ${label.toLowerCase()}`;

  return (
    <AuthFloatingField
      id={id}
      label={label}
      className={`auth-floating-password-field${showRequirements ? ' auth-floating-password-field--with-requirements' : ''}`}
      type={isRevealed ? 'text' : 'password'}
      autoComplete={autoComplete}
      value={value}
      onChange={onChange}
      {...inputProps}
      required
      endAdornment={(
        <>
          {showRequirements && (
            <span className="auth-password-requirements-control">
              <PasswordRequirements />
            </span>
          )}
          <button
            type="button"
            className="auth-password-toggle"
            aria-label={accessibilityLabel}
            title={accessibilityLabel}
            aria-pressed={isRevealed}
            onClick={() => setIsRevealed((current) => !current)}
          >
            {isRevealed ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </button>
        </>
      )}
    />
  );
}

const passwordIcons = {
  passwordField: {
    visibility: <EyeClosedIcon />,
    visibilityOff: <EyeOpenIcon />,
  },
};

const SIGN_IN_TIMEOUT_MS = 20000;

const withTimeout = (promise, milliseconds, message) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
};

function EmailPasswordSignIn({ email, onComplete, onForgotPassword, onUnknownAccount }) {
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const result = await withTimeout(
        signIn({ username: email, password }),
        SIGN_IN_TIMEOUT_MS,
        'Sign in is taking longer than expected. Check your connection and try again.',
      );
      if (result?.isSignedIn || result?.nextStep?.signInStep === 'DONE') {
        onComplete();
        return;
      }

      if (result?.nextStep?.signInStep === 'RESET_PASSWORD') {
        onForgotPassword();
        return;
      }

      throw new Error('Cognito needs another sign-in step that this account does not currently support.');
    } catch (error) {
      console.error('Unable to sign in with email:', error);
      if (error?.name === 'UserNotFoundException') {
        onUnknownAccount();
        return;
      }
      if (error?.name === 'NotAuthorizedException') {
        setErrorMessage('Incorrect email or password. Please try again.');
      } else if (error?.name === 'UserNotConfirmedException') {
        setErrorMessage('This email still needs to be verified before you can sign in.');
      } else {
        setErrorMessage(error?.message || 'We could not sign you in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-inline-password-form" onSubmit={submit} noValidate>
      <AuthPasswordField
        id="auth-sign-in-password"
        label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
      />
      {errorMessage && <p className="auth-email-error" role="alert">{errorMessage}</p>}
      <button type="submit" className="auth-choice-button auth-email-button" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>
      <button type="button" className="auth-text-link auth-forgot-password" onClick={onForgotPassword}>
        Forgot your password?
      </button>
    </form>
  );
}

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
        <AuthFloatingField
          id="auth-google-email"
          label="Email address"
          type="email"
          value={email}
          readOnly
          aria-readonly="true"
        />
        <AuthFloatingField
          id="auth-google-code"
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={confirmationCode}
          onChange={(event) => setConfirmationCode(event.target.value)}
          required
        />
        <AuthPasswordField
          id="auth-google-password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <AuthPasswordField
          id="auth-google-confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
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
  const [portalRoot, setPortalRoot] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({
    left: 12,
    top: 12,
    width: 280,
    placement: 'bottom',
  });

  useEffect(() => {
    if (!isVisible) return undefined;

    const updateTooltipPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const container = trigger.closest('.auth-email-stage.auth-sign-up-stage');
      if (!container) return;
      setPortalRoot(container);

      const containerPadding = 12;
      const gap = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const width = Math.min(280, containerRect.width - containerPadding * 2);
      const tooltipHeight = tooltipRef.current?.getBoundingClientRect().height || 128;
      const maxLeft = Math.max(containerPadding, containerRect.width - containerPadding - width);
      const maxTop = Math.max(containerPadding, containerRect.height - containerPadding - tooltipHeight);
      let placement = 'bottom';
      let left = triggerRect.left - containerRect.left + triggerRect.width / 2 - width / 2;
      let top = triggerRect.bottom - containerRect.top + gap;

      if (top + tooltipHeight > containerRect.height - containerPadding) {
        placement = 'top';
        top = triggerRect.top - containerRect.top - gap - tooltipHeight;
      }

      setTooltipPosition({
        left: Math.min(Math.max(left, containerPadding), maxLeft),
        top: Math.min(Math.max(top, containerPadding), maxTop),
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
      {portalRoot && createPortal(tooltip, portalRoot)}
    </div>
  );
}

const passwordErrorFor = (password) => {
  const missing = [];
  if (password.length < 8) missing.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter');
  if (!/\d/.test(password)) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('a special character');
  return missing.length ? `Password needs ${missing.join(', ')}.` : '';
};

function CreateAccountForm({ email, onBack, onComplete }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');

  const setFieldError = (field, message) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  };

  const clearFieldError = (field) => {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: '' } : current));
  };

  const finishSignUp = async () => {
    const result = await withTimeout(
      signIn({ username: email, password }),
      SIGN_IN_TIMEOUT_MS,
      'Sign in is taking longer than expected. Check your connection and try again.',
    );
    if (!result?.isSignedIn && result?.nextStep?.signInStep !== 'DONE') {
      throw new Error('Your account was created, but sign in needs another step. Please return and sign in.');
    }
    window.sessionStorage.setItem('trek-a-trip:new-account-welcome', JSON.stringify({
      email,
      name: name.trim(),
    }));
    onComplete();
  };

  const submitAccount = async (event) => {
    event.preventDefault();
    const nextErrors = {
      name: name.trim() ? '' : 'Enter your name.',
      password: passwordErrorFor(password),
      confirmPassword: !confirmPassword
        ? 'Confirm your password.'
        : password === confirmPassword ? '' : 'Passwords do not match.',
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || isSubmitting) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name: name.trim(),
          },
        },
      });
      if (result?.isSignUpComplete || result?.nextStep?.signUpStep === 'DONE') {
        await finishSignUp();
      } else if (result?.nextStep?.signUpStep === 'CONFIRM_SIGN_UP') {
        setIsConfirming(true);
      } else {
        throw new Error('Cognito needs another account-creation step that is not currently supported.');
      }
    } catch (error) {
      console.error('Unable to create account:', error);
      if (['UsernameExistsException', 'AliasExistsException'].includes(error?.name)) {
        setFormError('An account already exists for this email. Go back and continue with that email to sign in.');
      } else {
        setFormError(error?.message || 'We could not create your account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitConfirmation = async (event) => {
    event.preventDefault();
    const codeError = confirmationCode.trim() ? '' : 'Enter the verification code.';
    setFieldError('confirmationCode', codeError);
    if (codeError || isSubmitting) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      await confirmSignUp({ username: email, confirmationCode: confirmationCode.trim() });
      await finishSignUp();
    } catch (error) {
      console.error('Unable to confirm account:', error);
      setFormError(error?.message || 'We could not verify your email. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      await resendSignUpCode({ username: email });
    } catch (error) {
      console.error('Unable to resend verification code:', error);
      setFormError(error?.message || 'We could not resend the code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isConfirming) {
    return (
      <>
        <button
          type="button"
          className="auth-back-button auth-back-button--icon"
          onClick={() => {
            setIsConfirming(false);
            setConfirmationCode('');
            setFieldError('confirmationCode', '');
            setFormError('');
          }}
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
        </button>
        <img src={logo} alt="Trek A Trip" className="auth-logo auth-sign-up-logo" />
        <h3 className="auth-sign-up-heading">Check your email</h3>
        <p className="auth-google-account-copy">
          Enter the verification code sent to <strong>{email}</strong>.
        </p>
        <form className="auth-create-account-form" onSubmit={submitConfirmation} noValidate>
          <AuthFloatingField
            id="auth-sign-up-code"
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={confirmationCode}
            onChange={(event) => setConfirmationCode(event.target.value)}
            onFocus={() => clearFieldError('confirmationCode')}
            onBlur={() => setFieldError(
              'confirmationCode',
              confirmationCode.trim() ? '' : 'Enter the verification code.',
            )}
            aria-invalid={Boolean(fieldErrors.confirmationCode)}
            aria-describedby={fieldErrors.confirmationCode ? 'auth-sign-up-code-error' : undefined}
            required
          />
          {fieldErrors.confirmationCode && (
            <p id="auth-sign-up-code-error" className="auth-email-error" role="alert">
              {fieldErrors.confirmationCode}
            </p>
          )}
          {formError && <p className="auth-email-error" role="alert">{formError}</p>}
          <button type="submit" className="auth-choice-button auth-email-button" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Verify email'}
          </button>
          <button type="button" className="auth-text-link auth-resend-code" onClick={resendCode} disabled={isSubmitting}>
            Resend code
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="auth-back-button auth-back-button--icon"
        onClick={onBack}
        aria-label="Back"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
      </button>
      <img src={logo} alt="Trek A Trip" className="auth-logo auth-sign-up-logo" />
      <h3 className="auth-sign-up-heading">Get started by creating an account</h3>
      <form className="auth-create-account-form" onSubmit={submitAccount} noValidate>
        <AuthFloatingField
          id="auth-sign-up-name"
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={() => clearFieldError('name')}
          onBlur={() => setFieldError('name', name.trim() ? '' : 'Enter your name.')}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? 'auth-sign-up-name-error' : undefined}
          required
        />
        {fieldErrors.name && <p id="auth-sign-up-name-error" className="auth-email-error" role="alert">{fieldErrors.name}</p>}
        <AuthFloatingField
          id="auth-sign-up-email"
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          readOnly
          aria-readonly="true"
        />
        <AuthPasswordField
          id="auth-sign-up-password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onFocus={() => clearFieldError('password')}
          onBlur={() => setFieldError('password', passwordErrorFor(password))}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? 'auth-sign-up-password-error' : undefined}
          showRequirements
        />
        {fieldErrors.password && <p id="auth-sign-up-password-error" className="auth-email-error" role="alert">{fieldErrors.password}</p>}
        <AuthPasswordField
          id="auth-sign-up-confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onFocus={() => clearFieldError('confirmPassword')}
          onBlur={() => setFieldError(
            'confirmPassword',
            !confirmPassword
              ? 'Confirm your password.'
              : password === confirmPassword ? '' : 'Passwords do not match.',
          )}
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
          aria-describedby={fieldErrors.confirmPassword ? 'auth-sign-up-confirm-error' : undefined}
        />
        {fieldErrors.confirmPassword && (
          <p id="auth-sign-up-confirm-error" className="auth-email-error" role="alert">
            {fieldErrors.confirmPassword}
          </p>
        )}
        {formError && <p className="auth-email-error" role="alert">{formError}</p>}
        <button type="submit" className="auth-choice-button auth-email-button" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </>
  );
}

function AuthenticatorCopy({ containerRef }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateCopy = () => {
      container.querySelectorAll('[data-amplify-form] .amplify-field').forEach((field) => {
        field.classList.add('auth-floating-amplify-field');
      });

      const signInForm = container.querySelector(
        'form[data-amplify-form][data-amplify-authenticator-signin]',
      );
      const submitButton = signInForm?.querySelector('.amplify-button--primary');
      if (submitButton && submitButton.textContent?.trim() === 'Sign in') {
        submitButton.textContent = 'Sign in';
      }
      const passwordInput = signInForm?.querySelector('input[name="password"]');
      const passwordField = passwordInput?.closest('.amplify-passwordfield');
      if (passwordField) passwordField.classList.add('auth-inline-password-field');
    };

    updateCopy();
    const observer = new MutationObserver(updateCopy);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef]);

  return null;
}

export default function AuthModal() {
  const { isAuthModalOpen, closeAuth } = useAuth();
  const authenticatorNavigation = useAuthenticator((context) => [
    context.toSignIn,
    context.toForgotPassword,
  ]);
  const toSignIn = authenticatorNavigation?.toSignIn;
  const toForgotPassword = authenticatorNavigation?.toForgotPassword;
  const [authStage, setAuthStage] = useState('choice');
  const [showPassword, setShowPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [email, setEmail] = useState('');
  const [checkedEmail, setCheckedEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const authContentRef = useRef(null);
  const lookupRequestRef = useRef(0);
  const wasModalOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasModalOpenRef.current;
    wasModalOpenRef.current = isAuthModalOpen;
    if (wasOpen === isAuthModalOpen) return;

    lookupRequestRef.current += 1;
    if (isAuthModalOpen) toSignIn?.();
    setAuthStage('choice');
    setShowPassword(false);
    setIsGoogleLoading(false);
    setIsEmailLoading(false);
    setGoogleError('');
    setEmail('');
    setCheckedEmail('');
    setEmailError('');
    setSuccessMessage('');
  }, [isAuthModalOpen, toSignIn]);

  const openSignUp = () => {
    setAuthStage('signUp');
    setEmailError('');
    setSuccessMessage('');
    setGoogleError('');
  };

  const openForgotPassword = () => {
    toForgotPassword?.();
    setAuthStage('forgotPassword');
    setEmailError('');
    setSuccessMessage('');
    setGoogleError('');
  };

  const returnToChoice = () => {
    lookupRequestRef.current += 1;
    toSignIn?.();
    setAuthStage('choice');
    setShowPassword(false);
    setIsGoogleLoading(false);
    setIsEmailLoading(false);
    setEmail('');
    setCheckedEmail('');
    setEmailError('');
    setSuccessMessage('');
    setGoogleError('');
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
    lookupRequestRef.current += 1;
    toSignIn?.();
    setAuthStage('choice');
    setShowPassword(false);
    setIsGoogleLoading(false);
    setIsEmailLoading(false);
    setGoogleError('');
    setEmailError('');
    setEmail('');
    setCheckedEmail('');
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
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;

    try {
      const response = await publicTripApiFetch('accountLookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const { accountType } = await response.json();
      if (requestId !== lookupRequestRef.current) return;
      setCheckedEmail(normalizedEmail);

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
        toSignIn?.();
        setShowPassword(true);
      } else {
        throw new Error('The account check returned an invalid response.');
      }
    } catch (error) {
      console.error('Unable to continue with email:', error);
      setEmailError(error?.message || 'We could not check that email. Please try again.');
    } finally {
      if (requestId === lookupRequestRef.current) setIsEmailLoading(false);
    }
  };

  const services = {
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
            email={checkedEmail}
            onBack={returnToChoice}
            onComplete={() => {
              setSuccessMessage('Password added. You are now signed in.');
            }}
          />
        ) : authStage === 'forgotPassword' ? (
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
            <h3 className="auth-sign-up-heading">Reset your password</h3>
            <IconsProvider icons={passwordIcons}>
              <Authenticator
                key={`forgot-password-${checkedEmail}`}
                initialState="forgotPassword"
                loginMechanisms={['email']}
                formFields={getFormFields(checkedEmail)}
                components={authenticatorComponents}
                services={services}
              />
            </IconsProvider>
            <AuthenticatorCopy containerRef={authContentRef} />
          </div>
        ) : authStage === 'signUp' ? (
          <div className="auth-email-stage auth-sign-up-stage">
            <CreateAccountForm
              key={`create-account-${checkedEmail}`}
              email={checkedEmail}
              onBack={returnToChoice}
              onComplete={closeAuth}
            />
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
                    lookupRequestRef.current += 1;
                    setEmail(event.target.value);
                    setIsEmailLoading(false);
                    if (showPassword) setShowPassword(false);
                    if (checkedEmail) setCheckedEmail('');
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
                <EmailPasswordSignIn
                  key={`sign-in-${checkedEmail}`}
                  email={checkedEmail}
                  onComplete={closeAuth}
                  onForgotPassword={openForgotPassword}
                  onUnknownAccount={openSignUp}
                />
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
