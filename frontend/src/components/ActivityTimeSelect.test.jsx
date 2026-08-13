import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ActivityTimeSelect from './ActivityTimeSelect';

describe('ActivityTimeSelect', () => {
  it('selects an exact hour, minute, and period from the scroll wheels', () => {
    const onChange = vi.fn();
    render(<ActivityTimeSelect value="" onChange={onChange} ariaLabel="Activity time" />);

    fireEvent.click(screen.getByRole('button', { name: 'Activity time' }));
    expect(screen.getByRole('listbox', { name: 'Hour' }).querySelector('[aria-selected="true"]'))
      .toHaveTextContent('12');
    expect(screen.getByRole('listbox', { name: 'Minute' }).querySelector('[aria-selected="true"]'))
      .toHaveTextContent('00');
    expect(screen.getByRole('listbox', { name: 'AM or PM' }).querySelector('[aria-selected="true"]'))
      .toHaveTextContent('AM');
    fireEvent.click(screen.getByRole('option', { name: '3' }));
    fireEvent.click(screen.getByRole('option', { name: '37' }));
    fireEvent.click(screen.getByRole('option', { name: 'PM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenCalledWith('15:37');
  });

  it('can clear an existing time back to flexible', () => {
    const onChange = vi.fn();
    render(<ActivityTimeSelect value="09:15" onChange={onChange} ariaLabel="Activity time" />);

    fireEvent.click(screen.getByRole('button', { name: 'Activity time' }));
    fireEvent.click(screen.getByRole('button', { name: 'No time' }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
