import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@aws-amplify/ui-react/styles.css';
import './index.css';
import './auth-styles.css'; 

import { Amplify } from 'aws-amplify';
import awsconfig from './aws-exports';
import { Authenticator } from '@aws-amplify/ui-react';
import { AuthProvider } from './context/AuthContext';

Amplify.configure(awsconfig);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Authenticator.Provider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Authenticator.Provider>
  </React.StrictMode>
);
