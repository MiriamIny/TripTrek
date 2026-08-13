import { useEffect, useState } from 'react';
import {
  Navbar,
  Nav,
  Container,
  Dropdown,
  Offcanvas,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import { Link, NavLink } from 'react-router-dom';
import logo from '../assets/TrekATripLogo.png'
import { useAuth } from '../context/AuthContext';

const NavigationBar = () => {
  const { user, userAttributes = {}, signOut, isAuthenticated, openAuth } = useAuth();

  const name = userAttributes.name || user?.attributes?.name || '';
  const email = userAttributes.email || user?.attributes?.email || user?.signInDetails?.loginId || '';
  const picture = userAttributes.picture || user?.attributes?.picture || '';
  const displayName = name || email.split('@')[0] || 'User';
  const firstLetter = displayName.charAt(0).toUpperCase();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    window.matchMedia('(min-width: 992px)').matches,
  );
  const showProfilePicture = picture && picture !== failedAvatarUrl;
  const closeMenu = () => setIsMenuOpen(false);

  const navLinkClass = ({ isActive }) =>
    `nav-link main-nav-link${isActive ? ' main-nav-link--active' : ''}`;

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 992px)');
    const handleBreakpointChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) setIsMenuOpen(false);
    };

    setIsDesktop(desktopQuery.matches);
    desktopQuery.addEventListener('change', handleBreakpointChange);
    return () => desktopQuery.removeEventListener('change', handleBreakpointChange);
  }, []);

  return (
    <Navbar
      expand="lg"
      expanded={isMenuOpen}
      onToggle={setIsMenuOpen}
      className="main-navbar bg-light-sand shadow-sm"
    >
      <Container fluid>
        <Navbar.Brand
          as={Link}
          to="/"
          className="d-flex align-items-center text-forest-green"
          onClick={closeMenu}
        >
          <img
            src={logo}
            alt="Trek A Trip"
            className="main-navbar-logo d-inline-block align-top me-2"
          />
        </Navbar.Brand>
        
        <Navbar.Toggle className="main-navbar-toggle" aria-controls="main-navbar-nav" />
        <Navbar.Offcanvas
          id="main-navbar-nav"
          aria-labelledby="main-navbar-nav-label"
          placement="end"
          className="main-navbar-offcanvas"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title id="main-navbar-nav-label">Menu</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            <Nav className="main-nav ms-auto align-items-lg-center">
              <NavLink to="/" end className={navLinkClass} onClick={closeMenu}>
                <span className="main-nav-link-label">Home</span>
              </NavLink>
              <NavLink to="/trips" className={navLinkClass} onClick={closeMenu}>
                <span className="main-nav-link-label">Trips</span>
              </NavLink>
              <NavLink to="/about" className={navLinkClass} onClick={closeMenu}>
                <span className="main-nav-link-label">About</span>
              </NavLink>
              <NavLink to="/contact" className={navLinkClass} onClick={closeMenu}>
                <span className="main-nav-link-label">Contact Us</span>
              </NavLink>

              <div className="nav-account ms-lg-3">
                {isAuthenticated ? (
                  <Dropdown align="end">
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

                    <Dropdown.Menu className="account-menu">
                      <Dropdown.Header>
                        <strong className="d-block text-slate-gray">{displayName}</strong>
                        {email && (
                          <span className="d-block text-muted fw-normal small">{email}</span>
                        )}
                      </Dropdown.Header>
                      <Dropdown.Divider />
                      <Dropdown.Item
                        className="account-menu-sign-out"
                        onClick={() => {
                          closeMenu();
                          signOut();
                        }}
                      >
                        Sign Out
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                ) : (
                  <OverlayTrigger
                    placement={isDesktop ? 'bottom' : 'right'}
                    popperConfig={{
                      modifiers: [
                        { name: 'preventOverflow', options: { padding: 8 } },
                        {
                          name: 'flip',
                          options: {
                            fallbackPlacements: isDesktop
                              ? ['bottom-end', 'bottom-start', 'top']
                              : ['right-start', 'left', 'top'],
                          },
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
                      className="account-avatar account-avatar--guest"
                      aria-label="Sign in or create account"
                      onClick={() => {
                        closeMenu();
                        openAuth();
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" />
                      </svg>
                    </button>
                  </OverlayTrigger>
                )}
              </div>
            </Nav>
          </Offcanvas.Body>
        </Navbar.Offcanvas>
      </Container>
    </Navbar>
  );
};

export default NavigationBar;
