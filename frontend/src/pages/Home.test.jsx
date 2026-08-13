vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './Home';

describe('Home component', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    mockNavigate.mockClear();
    useNavigate.mockReturnValue(mockNavigate);
  });

  const renderHome = () => render(<Home />, { wrapper: MemoryRouter });

  it('introduces Trek A Trip with a clear landing-page heading', () => {
    renderHome();

    expect(
      screen.getByRole('heading', { name: /your next adventure deserves a beautiful plan/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your itinerary, made simple/i)).toBeInTheDocument();
  });

  it('routes primary and final calls to action to trips', async () => {
    renderHome();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /plan your next trip/i }));
    await user.click(screen.getByRole('button', { name: /create your itinerary/i }));

    expect(mockNavigate).toHaveBeenNthCalledWith(1, '/trips');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/trips');
  });

  it('explains the core planning benefits and steps', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: /build it day by day/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /see the journey/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /keep plans together/i })).toBeInTheDocument();
    expect(screen.getByText(/choose the adventure/i)).toBeInTheDocument();
    expect(screen.getByText(/shape each day/i)).toBeInTheDocument();
    expect(screen.getByText(/go with a plan/i)).toBeInTheDocument();
  });

  it('provides a working in-page link to the how-it-works section', () => {
    renderHome();

    expect(screen.getByRole('link', { name: /see how it works/i })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
  });

  it('features three distinct destinations in the inspiration gallery', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: /escape to the coast/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /take the forest trail/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /reach new heights/i })).toBeInTheDocument();
  });
});
