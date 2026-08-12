import { createContext, useContext, useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { user, signOut: amplifySignOut, authStatus } = useAuthenticator((context) => [
    context.user,
    context.authStatus,
  ]);
  const [userAttributes, setUserAttributes] = useState(user?.attributes || {});
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
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
    if (isAuthenticated) setIsAuthModalOpen(false);
  }, [isAuthenticated]);

  const signOut = async () => {
    await amplifySignOut();
    setUserAttributes({});
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userAttributes,
        signOut,
        authStatus,
        isAuthenticated,
        isAuthModalOpen,
        openAuth: () => setIsAuthModalOpen(true),
        closeAuth: () => setIsAuthModalOpen(false),
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
