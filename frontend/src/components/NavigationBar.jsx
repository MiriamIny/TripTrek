import { useState } from 'react';
import { Navbar, Nav, Container, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import logo from '../assets/TripTrekLogo.png'
import { useAuth } from '../context/AuthContext';

const NavigationBar = () => {
  const { user, userAttributes = {}, signOut, isAuthenticated, openAuth } = useAuth();

  const name = userAttributes.name || user?.attributes?.name || '';
  const email = userAttributes.email || user?.attributes?.email || user?.signInDetails?.loginId || '';
  const picture = userAttributes.picture || user?.attributes?.picture || '';
  const displayName = name || email.split('@')[0] || 'User';
  const firstLetter = displayName.charAt(0).toUpperCase();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('');
  const showProfilePicture = picture && picture !== failedAvatarUrl;

  return (
    <Navbar expand="lg" className="bg-light-sand shadow-sm">
      <Container fluid>
        <Navbar.Brand as={Link} to="/" className="d-flex align-items-center text-forest-green">
          <img
            src={logo}
            alt="TripTrek"
            style={{ maxHeight: '80px' }}
            className="d-inline-block align-top me-2"
          />
        </Navbar.Brand>
        
        <Navbar.Toggle aria-controls="main-navbar-nav" />
        <Navbar.Collapse id="main-navbar-nav">
          <Nav className="ms-auto align-items-center">
            <Nav.Link as={Link} to="/" className="text-slate-gray">Home</Nav.Link>
            <Nav.Link as={Link} to="/trips" className="text-slate-gray">Trips</Nav.Link>
            <Nav.Link as={Link} to="/about" className="text-slate-gray">About</Nav.Link>
            <Nav.Link as={Link} to="/contact" className="text-slate-gray">Contact Us</Nav.Link>
            
            {isAuthenticated ? (
              <Dropdown align="end" className="ms-lg-3">
                <Dropdown.Toggle
                  as="div"
                  id="user-dropdown"
                  bsPrefix="none"
                  aria-label={`Open account menu for ${displayName}`}
                  className="account-avatar"
                >
                  {showProfilePicture ? (
                    <img
                      src={picture}
                      alt=""
                      className="account-avatar-image"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedAvatarUrl(picture)}
                    />
                  ) : firstLetter}
                </Dropdown.Toggle>

                <Dropdown.Menu>
                  <Dropdown.Header>
                    <strong className="d-block text-slate-gray">{displayName}</strong>
                    {email && (
                      <span className="d-block text-muted fw-normal small">{email}</span>
                    )}
                  </Dropdown.Header>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={signOut}>Sign Out</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            ) : (
              <OverlayTrigger
                placement="bottom"
                popperConfig={{
                  modifiers: [
                    { name: 'preventOverflow', options: { padding: 8 } },
                    {
                      name: 'flip',
                      options: { fallbackPlacements: ['bottom-end', 'bottom-start', 'top'] },
                    },
                  ],
                }}
                overlay={(
                  <Tooltip id="guest-account-tooltip" className="guest-account-tooltip">
                    Sign in or create account
                  </Tooltip>
                )}
              >
                <button
                  type="button"
                  className="account-avatar account-avatar--guest ms-lg-3"
                  aria-label="Sign in or create account"
                  onClick={openAuth}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" />
                  </svg>
                </button>
              </OverlayTrigger>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default NavigationBar;
