import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import About from './About';

describe('About component', () => {
  const renderAbout = () => render(<About />, { wrapper: MemoryRouter });

  it('introduces the purpose of Trek A Trip', () => {
    renderAbout();

    expect(screen.getByText(/about trek a trip/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /planning should feel like the beginning of the adventure/i,
      }),
    ).toBeInTheDocument();
  });

  it('explains why Trek A Trip exists', () => {
    renderAbout();

    expect(screen.getByText(/ever wish your trip was thoughtfully planned/i)).toBeInTheDocument();
    expect(screen.getByText(/trek a trip brings the shape of a journey/i)).toBeInTheDocument();
  });

  it('presents the three product principles', () => {
    renderAbout();

    expect(screen.getByRole('heading', { name: /clarity without rigidity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /everything in one place/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /planning can be part of the fun/i }),
    ).toBeInTheDocument();
  });

  it('links both calls to action to the Trips page', () => {
    renderAbout();

    expect(screen.getByRole('link', { name: /start planning/i })).toHaveAttribute('href', '/trips');
    expect(screen.getByRole('link', { name: /plan your next trip/i })).toHaveAttribute(
      'href',
      '/trips',
    );
  });

  it('keeps the closing Trek A Trip message', () => {
    renderAbout();

    expect(screen.getByText(/let’s make trip planning part of the fun/i)).toBeInTheDocument();
  });
});
