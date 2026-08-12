const redirectUrl = `${window.location.origin}/`;

const awsconfig = {
  aws_project_region: 'us-east-1',
  aws_cognito_region: 'us-east-1',
  aws_user_pools_id: 'us-east-1_Ks6i9yln5',
  aws_user_pools_web_client_id: '3n8imnlps0an3lj9rp2umi7bu6',
  oauth: {
    domain: 'auth.trekatrip.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: redirectUrl,
    redirectSignOut: redirectUrl,
    responseType: 'code',
  },
};

export default awsconfig;
