import { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';

function UserInfo() {
  const [name, setName] = useState('');

  useEffect(() => {
    async function loadUser() {
      try {
        const attributes = await fetchUserAttributes();
        setName(attributes.name || '');
      } catch (err) {
        console.log('Error fetching user', err);
      }
    }

    loadUser();
  }, []);

  return (
    <div>
      <h2>Welcome{name ? `, ${name}` : ''}!</h2>
    </div>
  );
}

export default UserInfo;