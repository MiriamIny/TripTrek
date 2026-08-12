import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ContactUs from './ContactUs';

describe('ContactUs component', () => {
  it('renders the contact introduction and support topics', () => {
    render(<ContactUs />);

    expect(screen.getByRole('heading', { name: /let’s make your next trip easier/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /planning questions/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /account support/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ideas & feedback/i })).toBeInTheDocument();
  });

  it('renders accessible form fields and the submit button', () => {
    render(<ContactUs />);

    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/what can we help with/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toHaveAttribute('aria-describedby', 'contact-message-hint');
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  it('offers the expected contact topics', async () => {
    render(<ContactUs />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/what can we help with/i));

    expect(screen.getByRole('option', { name: /trip planning/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('option', { name: /account and sign-in/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /feedback or an idea/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /something else/i })).toBeInTheDocument();
  });

  it('allows completing the form', async () => {
    render(<ContactUs />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText(/^name$/i);
    const emailInput = screen.getByLabelText(/^email$/i);
    const subjectInput = screen.getByLabelText(/what can we help with/i);
    const messageInput = screen.getByLabelText(/^message$/i);

    await user.type(nameInput, 'Jane Doe');
    await user.type(emailInput, 'jane@example.com');
    await user.click(subjectInput);
    await user.click(screen.getByRole('option', { name: /trip planning/i }));
    await user.type(messageInput, 'I would like help planning a trip.');

    expect(nameInput).toHaveValue('Jane Doe');
    expect(emailInput).toHaveValue('jane@example.com');
    expect(subjectInput).toHaveTextContent('Trip planning');
    expect(document.querySelector('input[name="subject"]')).toHaveValue('planning');
    expect(messageInput).toHaveValue('I would like help planning a trip.');
  });
});
