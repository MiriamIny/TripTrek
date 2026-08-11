const isLocal = window.location.hostname === 'localhost';

const awsconfig = {
  aws_project_region: 'us-east-1',
  aws_cognito_region: 'us-east-1',
  aws_user_pools_id: 'us-east-1_Ks6i9yln5',
  aws_user_pools_web_client_id: '3n8imnlps0an3lj9rp2umi7bu6',
  oauth: {
    domain: 'trekatrip.auth.us-east-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: isLocal
      ? 'http://localhost:5173/'
      : 'https://main.d2jqd7far0nraw.amplifyapp.com/',
    redirectSignOut: isLocal
      ? 'http://localhost:5173/'
      : 'https://main.d2jqd7far0nraw.amplifyapp.com/',
    responseType: 'code',
  },
};

export default awsconfig;
