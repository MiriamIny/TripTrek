import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Authenticator, IconsProvider, useAuthenticator } from '@aws-amplify/ui-react';
import { signInWithRedirect, signUp } from 'aws-amplify/auth';
import { Modal } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/TrekATripLogo.png';
import './AuthModal.css';

const getFormFields = (email = '') => ({
  signUp: {
    name: {
      order: 1,
      label: 'Name',
      placeholder: 'Your name',
      isRequired: true,
    },
    email: {
      order: 2,
      label: 'Email',
      placeholder: 'Email',
      defaultValue: email,
      isRequired: true,
    },
    password: {
      order: 3,
      placeholder: 'Enter password',
      showPasswordButtonLabel: 'Toggle password visibility',
      passwordIsHiddenLabel: 'Password hidden',
      passwordIsShownLabel: 'Password revealed',
      isRequired: true,
    },
    confirm_password: {
      order: 4,
      label: 'Confirm password',
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
      placeholder: 'Enter password',
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

const AuthModeContext = createContext(() => {});

function SignInFooter() {
  const setAuthMode = useContext(AuthModeContext);
  const { toForgotPassword, toSignUp } = useAuthenticator((context) => [
    context.toForgotPassword,
    context.toSignUp,
  ]);

  return (
    <div className="auth-form-footer">
      <button type="button" className="auth-text-link" onClick={toForgotPassword}>
        Forgot your password?
      </button>
      <p>
        Don&apos;t have an account?{' '}
        <button
          type="button"
          className="auth-text-link auth-text-link--strong"
          onClick={() => {
            setAuthMode('signUp');
            toSignUp();
          }}
        >
          Create one
        </button>
      </p>
    </div>
  );
}

function SignUpFooter() {
  const setAuthMode = useContext(AuthModeContext);
  const { toSignIn } = useAuthenticator((context) => [context.toSignIn]);

  return (
    <div className="auth-form-footer">
      <p>
        Already have an account?{' '}
        <button
          type="button"
          className="auth-text-link auth-text-link--strong"
          onClick={() => {
            setAuthMode('signIn');
            toSignIn();
          }}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

const authenticatorComponents = {
  Header() {
    return (
      <div className="auth-header">
        <img src={logo} alt="Trek A Trip" className="auth-logo" />
      </div>
    );
  },
  SignIn: {
    Header() {
      return <h3 className="auth-stage-heading">Enter your password</h3>;
    },
    Footer: SignInFooter,
  },
  SignUp: {
    Header() {
      return <h3 className="auth-stage-heading">Get started</h3>;
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

function AuthenticatorCopy({ containerRef }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateCopy = () => {
      const signInForm = container.querySelector(
        'form[data-amplify-form][data-amplify-authenticator-signin]',
      );
      const submitButton = signInForm?.querySelector('.amplify-button--primary');
      if (submitButton && submitButton.textContent?.trim() === 'Sign in') {
        submitButton.textContent = 'Log in';
      }
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
  const [authMode, setAuthMode] = useState('signIn');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const emailStageRef = useRef(null);

  const selectMode = (mode) => {
    setAuthMode(mode);
    setShowEmailForm(false);
    setGoogleError('');
    setEmailError('');
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
    setAuthMode('signIn');
    setShowEmailForm(false);
    setIsGoogleLoading(false);
    setGoogleError('');
    setEmailError('');
    closeAuth();
  };

  const continueWithEmail = (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !event.currentTarget.checkValidity()) {
      setEmailError('Enter a valid email address to continue.');
      return;
    }

    window.sessionStorage.removeItem('trek-a-trip:google-sign-in-pending');
    setEmail(normalizedEmail);
    setEmailError('');
    setShowEmailForm(true);
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
          {authMode === 'signIn' ? 'Sign In' : 'Create Account'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {showEmailForm ? (
          <div className="auth-email-stage" ref={emailStageRef}>
            <AuthModeContext.Provider value={setAuthMode}>
              <IconsProvider icons={passwordIcons}>
                <Authenticator
                  key={authMode}
                  initialState={authMode}
                  loginMechanisms={['email']}
                  signUpAttributes={['email', 'name']}
                  formFields={getFormFields(email)}
                  components={authenticatorComponents}
                  services={authenticatorServices}
                />
              </IconsProvider>
            </AuthModeContext.Provider>
            <PasswordRequirementsPortal
              containerRef={emailStageRef}
              enabled={authMode === 'signUp'}
            />
            <AuthenticatorCopy containerRef={emailStageRef} />
          </div>
        ) : (
          <section className="auth-choice" aria-labelledby="auth-choice-title">
            <img src={logo} alt="Trek A Trip" className="auth-logo" />
            <div className="auth-mode-tabs" role="tablist" aria-label="Account action">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signIn'}
                className={authMode === 'signIn' ? 'active' : ''}
                onClick={() => selectMode('signIn')}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signUp'}
                className={authMode === 'signUp' ? 'active' : ''}
                onClick={() => selectMode('signUp')}
              >
                Create Account
              </button>
            </div>

            <h2 id="auth-choice-title">
              {authMode === 'signIn' ? 'Welcome back!' : 'Get started!'}
            </h2>

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
              <label htmlFor="auth-email">Enter your email</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                required
                aria-describedby={emailError ? 'auth-email-error' : undefined}
                aria-invalid={Boolean(emailError)}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError('');
                }}
              />
              {emailError && (
                <p id="auth-email-error" className="auth-email-error" role="alert">{emailError}</p>
              )}
              <button type="submit" className="auth-choice-button auth-email-button">
                Continue with email
              </button>
            </form>

            {googleError && <p className="auth-choice-error" role="alert">{googleError}</p>}

            <p className="auth-mode-prompt">
              {authMode === 'signIn' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={() => selectMode('signUp')}>Create one</button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={() => selectMode('signIn')}>Sign in</button>
                </>
              )}
            </p>
          </section>
        )}
      </Modal.Body>
    </Modal>
  );
}
