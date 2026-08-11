import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import './auth-styles.css'; 

import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import awsconfig from './aws-exports';
import { Authenticator } from '@aws-amplify/ui-react';
import { AuthProvider } from './context/AuthContext';
import logo from './assets/TripTrekLogo.png';

Amplify.configure(awsconfig);

// Listen for sign-in events and reload the app
Hub.listen('auth', ({ payload }) => {
  const { event } = payload;
  if (event === 'signIn') {
    console.log('Sign-in event detected, reloading...');
    window.location.reload();
  }
});

import { TripProvider } from './context/TripContext.jsx';


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Authenticator
      loginMechanisms={['email']}
      signUpAttributes={['email', 'name']}
      formFields={{
        signUp: {
          name: {
            order: 1,
            label: 'Name',
            placeholder: 'Your name',
            isRequired: true,
          },
          email: {
            order: 1,
            placeholder: 'name@example.com',
            isRequired: true,
          },
          password: {
            order: 2,
            placeholder: 'Enter password',
            isRequired: true,
          },
          confirm_password: {
            order: 3,
            placeholder: 'Reenter password',
            isRequired: true,
          },
        },
        signIn: {
          username: {
            placeholder: 'name@example.com',
          },
          password: {
            placeholder: 'Enter password',
          },
        },
      }}
      components={{
        Header() {
          return (
            <div className="auth-header">
              <img src={logo} alt="TripTrek" className="auth-logo" />
            </div>
          );
        },
      }}
    >
      {({ signOut, user }) => {
        return (
          <AuthProvider user={user} signOut={signOut}>
            <App />
          </AuthProvider>
        );
      }}
    </Authenticator>
  </React.StrictMode>
);
