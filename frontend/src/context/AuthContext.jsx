import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { tripApiFetch } from '../api/tripApi';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { user, signOut: amplifySignOut, authStatus } = useAuthenticator((context) => [
    context.user,
    context.authStatus,
  ]);
  const [userAttributes, setUserAttributes] = useState(user?.attributes || {});
  const [linkedProfile, setLinkedProfile] = useState({});
  const [accountReady, setAccountReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState(null);
  const [mergeNotice, setMergeNotice] = useState(null);
  const [mergeNoticeChecked, setMergeNoticeChecked] = useState(false);
  const welcomePendingRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);
  const isAuthenticated = authStatus === 'authenticated';

  useEffect(() => {
    let isCurrent = true;

    if (!user) {
      setUserAttributes({});
      return () => {
        isCurrent = false;
      };
    }

    const loadUserAttributes = async () => {
      const [sessionResult, attributesResult] = await Promise.allSettled([
        fetchAuthSession(),
        fetchUserAttributes(),
      ]);
      let attributes = { ...(user.attributes || {}) };

      if (sessionResult.status === 'fulfilled') {
        const claims = sessionResult.value.tokens?.idToken?.payload || {};
        if (typeof claims.name === 'string') attributes.name = claims.name;
        if (typeof claims.email === 'string') attributes.email = claims.email;
        if (typeof claims.picture === 'string') attributes.picture = claims.picture;
      }

      if (attributesResult.status === 'fulfilled') {
        attributes = { ...attributes, ...attributesResult.value };
      } else {
        console.warn(
          'Unable to load user attributes from the Cognito user API; using token claims instead:',
          attributesResult.reason,
        );
      }

      if (isCurrent) setUserAttributes(attributes);
    };

    loadUserAttributes();

    return () => {
      isCurrent = false;
    };
  }, [user?.userId]);

  useEffect(() => {
    let isCurrent = true;
    if (!isAuthenticated) {
      setMergeNotice(null);
      setMergeNoticeChecked(false);
      setLinkedProfile({});
      setAccountReady(false);
      return () => { isCurrent = false; };
    }

    setMergeNotice(null);
    setMergeNoticeChecked(false);
    setLinkedProfile({});
    setAccountReady(false);
    tripApiFetch('accountLookup')
      .then((response) => response.json())
      .then((payload) => {
        if (isCurrent && payload.profile && typeof payload.profile === 'object') {
          setLinkedProfile(payload.profile);
        }
        if (isCurrent && (payload.merged === true || payload.notice === 'merged')) {
          setMergeNotice({
            title: 'Your accounts are connected',
            message: 'Google and email sign-in now open the same Trek A Trip account.',
          });
        } else if (isCurrent && payload.notice === 'welcome') {
          setMergeNotice({ title: 'Welcome!' });
        }
        if (isCurrent) {
          setMergeNoticeChecked(true);
          setAccountReady(true);
        }
      })
      .catch((error) => {
        console.warn('Unable to check the one-time account-link notice:', error);
        if (isCurrent) {
          setMergeNoticeChecked(true);
          setAccountReady(true);
        }
      });

    return () => { isCurrent = false; };
  }, [isAuthenticated, user?.userId]);

  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = isAuthenticated;

    if (isAuthenticated) {
      setIsAuthModalOpen(false);
      window.sessionStorage.removeItem('trek-a-trip:google-sign-in-pending');
      if (!wasAuthenticated) welcomePendingRef.current = true;
    } else {
      welcomePendingRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !mergeNoticeChecked || !welcomePendingRef.current) return;

    const storedWelcome = (() => {
      try {
        return JSON.parse(window.sessionStorage.getItem('trek-a-trip:new-account-welcome') || 'null');
      } catch {
        return null;
      }
    })();
    const effectiveAttributes = { ...userAttributes, ...linkedProfile };
    const accountEmail = (effectiveAttributes.email || '').trim().toLowerCase();
    const isNewAccount = storedWelcome?.email === accountEmail;
    if (isNewAccount) window.sessionStorage.removeItem('trek-a-trip:new-account-welcome');
    const displayName = (
      (isNewAccount && storedWelcome.name)
      || effectiveAttributes.name
      || user?.attributes?.name
      || effectiveAttributes.email
      || user?.signInDetails?.loginId
      || ''
    ).trim();
    if (!displayName) return;

    const welcomeName = displayName.includes('@') ? displayName.split('@')[0] : displayName;
    welcomePendingRef.current = false;
    const fallbackNotice = { title: `${isNewAccount ? 'Welcome' : 'Welcome back'}, ${welcomeName}!` };
    setAuthNotice(mergeNotice?.title === 'Welcome!'
      ? { title: `Welcome, ${welcomeName}!` }
      : mergeNotice || fallbackNotice);
  }, [isAuthenticated, linkedProfile, mergeNotice, mergeNoticeChecked, user, userAttributes]);

  const signOut = async () => {
    await amplifySignOut();
    setUserAttributes({});
  };

  const dismissAuthNotice = useCallback(() => setAuthNotice(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userAttributes: { ...userAttributes, ...linkedProfile },
        accountReady,
        signOut,
        authStatus,
        isAuthenticated,
        isAuthModalOpen,
        openAuth: () => setIsAuthModalOpen(true),
        closeAuth: () => setIsAuthModalOpen(false),
        authNotice,
        dismissAuthNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
