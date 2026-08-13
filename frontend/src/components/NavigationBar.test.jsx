import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, beforeAll, beforeEach, test, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import NavigationBar from './NavigationBar';
import { useAuth } from '../context/AuthContext';

// Mock the useAuth hook
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

// Mock the logo import
vi.mock('../assets/TrekATripLogo.png', () => ({
  default: 'mocked-logo-path'
}));

describe('NavigationBar', () => {
  const mockSignOut = vi.fn();

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    useAuth.mockReturnValue({
      user: {
        userId: 'generated-cognito-id'
      },
      userAttributes: {
        name: 'Jane Doe',
        email: 'jane@example.com'
      },
      isAuthenticated: true,
      openAuth: vi.fn(),
      signOut: mockSignOut
    });
  });

  const renderNavigationBar = () => {
    return render(
      <BrowserRouter>
        <NavigationBar />
      </BrowserRouter>
    );
  };

  test('renders logo image with alt text', () => {
    renderNavigationBar();
    const logo = screen.getByAltText('Trek A Trip');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'mocked-logo-path');
  });

  test('renders all navigation links', () => {
    renderNavigationBar();
   
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Trips')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact Us')).toBeInTheDocument();
  });

  test('renders user avatar with first letter of name', () => {
    renderNavigationBar();
   
    const avatar = screen.getByText('J');
    expect(avatar).toBeInTheDocument();
  });

  test('uses a mapped Google profile picture when available', () => {
    useAuth.mockReturnValue({
      user: { userId: 'google-user' },
      userAttributes: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        picture: 'https://example.com/jane.jpg'
      },
      isAuthenticated: true,
      openAuth: vi.fn(),
      signOut: mockSignOut
    });

    renderNavigationBar();

    expect(document.querySelector('.account-avatar-image')).toHaveAttribute(
      'src',
      'https://example.com/jane.jpg'
    );
    expect(screen.queryByText('J')).not.toBeInTheDocument();
  });

  test('displays name and email in dropdown header', () => {
    renderNavigationBar();
   
    // Click on the avatar to open dropdown
    const avatar = screen.getByText('J');
    fireEvent.click(avatar);
   
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.queryByText('generated-cognito-id')).not.toBeInTheDocument();
  });

  test('renders sign out option in dropdown', () => {
    renderNavigationBar();
   
    // Click on the avatar to open dropdown
    const avatar = screen.getByText('J');
    fireEvent.click(avatar);
   
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  test('calls signOut when sign out is clicked', () => {
    renderNavigationBar();
   
    // Click on the avatar to open dropdown
    const avatar = screen.getByText('J');
    fireEvent.click(avatar);
   
    // Click sign out
    const signOutButton = screen.getByText('Sign Out');
    fireEvent.click(signOutButton);
   
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test('uses email loginId when profile attributes are unavailable', () => {
    useAuth.mockReturnValue({
      user: {
        signInDetails: {
          loginId: 'user@example.com'
        }
      },
      isAuthenticated: true,
      openAuth: vi.fn(),
      signOut: mockSignOut
    });

    renderNavigationBar();
   
    const avatar = screen.getByText('U');
    expect(avatar).toBeInTheDocument();
   
    fireEvent.click(avatar);
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  test('supports attributes already present on the user object', () => {
    useAuth.mockReturnValue({
      user: {
        attributes: {
          name: 'Taylor Smith',
          email: 'test@example.com'
        }
      },
      isAuthenticated: true,
      openAuth: vi.fn(),
      signOut: mockSignOut
    });

    renderNavigationBar();
   
    const avatar = screen.getByText('T');
    expect(avatar).toBeInTheDocument();
   
    fireEvent.click(avatar);
    expect(screen.getByText('Taylor Smith')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  test('handles a user with no profile fields', () => {
    useAuth.mockReturnValue({
      user: {},
      isAuthenticated: true,
      openAuth: vi.fn(),
      signOut: mockSignOut
    });

    renderNavigationBar();
   
    const avatar = screen.getByText('U');
    expect(avatar).toBeInTheDocument();
   
    fireEvent.click(avatar);
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  test('shows a sign-in control for guests', () => {
    const openAuth = vi.fn();
    useAuth.mockReturnValue({
      user: undefined,
      isAuthenticated: false,
      openAuth,
      signOut: mockSignOut
    });

    renderNavigationBar();

    const accountButton = screen.getByRole('button', { name: 'Sign in or create account' });
    expect(accountButton).toHaveClass('account-avatar--guest');
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();

    fireEvent.click(accountButton);
    expect(openAuth).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  test('navigation links have correct href attributes', () => {
    renderNavigationBar();
   
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /trips/i })).toHaveAttribute('href', '/trips');
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: /contact us/i })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: /home/i })).toHaveClass('main-nav-link--active');
  });

  test('navbar has correct accessibility attributes', () => {
    renderNavigationBar();
   
    const navbar = screen.getByRole('navigation');
    expect(navbar).toBeInTheDocument();
   
    const toggleButton = screen.getByRole('button', { name: /toggle navigation/i });
    expect(toggleButton).toHaveAttribute('aria-controls', 'main-navbar-nav');
  });
});
