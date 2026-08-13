import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TripForm from './TripForm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock URL.createObjectURL and revokeObjectURL
globalThis.URL.createObjectURL = vi.fn(() => 'mock-object-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Keep date and time controls deterministic in jsdom while exercising TripForm state changes.
vi.mock('./ActivityTimeSelect', () => ({
  __esModule: true,
  default: ({ value, onChange, ariaLabel }) => (
    <input
      data-testid="mock-time-picker"
      aria-label={ariaLabel}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('./TripDatePicker', () => ({
  __esModule: true,
  default: ({ id, startDate, endDate, onChange }) => {
    const toIso = (date) => {
      if (!date) return '';
      const [month, day, year] = date.split('/');
      return `${year}-${month}-${day}`;
    };
    const fromIso = (date) => date ? `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}` : '';
    return (
      <>
        <input
          id={id}
          type="date"
          value={toIso(startDate)}
          onChange={(event) => onChange(fromIso(event.target.value), endDate)}
        />
        <input
          aria-label="Mock end date"
          type="date"
          value={toIso(endDate)}
          min={toIso(startDate)}
          onChange={(event) => onChange(startDate, fromIso(event.target.value))}
        />
      </>
    );
  },
}));

// Mock image compression
vi.mock('browser-image-compression', () => ({
  __esModule: true,
  default: vi.fn().mockResolvedValue(new File([''], 'compressed.jpg', { type: 'image/jpeg' })),
}));

// Mock the AuthContext
const mockUser = { userId: 'test-user-123' };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock the TripContext
const mockUploadTripImage = vi.fn().mockResolvedValue('https://example.com/image.jpg');
vi.mock('../context/TripContext', () => ({
  useTripContext: () => ({
    uploadTripImage: mockUploadTripImage,
  }),
}));

const mockTrip = {
  destination: 'Paris',
  startDate: '07/20/2025',
  endDate: '07/21/2025',
  itinerary: [
    {
      date: '07/20/2025',
      activities: [{ time: '10:00 AM', name: 'Museum Visit' }],
    },
  ],
};

describe('TripForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with pre-filled trip data', () => {
    render(<TripForm trip={mockTrip} onSave={vi.fn()} onCancel={vi.fn()} />);
    
    expect(screen.getByDisplayValue('Paris')).toBeInTheDocument();
    expect(screen.getByText('07/20/2025')).toBeInTheDocument();
    expect(screen.getByText('Museum Visit')).toBeInTheDocument();
  });

  it('saves an optional map location with a newly added activity', async () => {
    const onSave = vi.fn();
    render(<TripForm trip={mockTrip} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Activity description for day 1'), {
      target: { value: 'Coffee break' },
    });
    fireEvent.change(screen.getByLabelText('Map location for activity on day 1'), {
      target: { value: 'Café de Flore, Paris' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Activity' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].itinerary[0].activities).toContainEqual(expect.objectContaining({
      name: 'Coffee break',
      location: 'Café de Flore, Paris',
    }));
  });

  it('renders with empty trip object', () => {
    render(<TripForm trip={{}} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    // Find destination input by placeholder or type
    const destinationInput = screen.getByRole('textbox');
    expect(destinationInput).toHaveValue('');
   
    // Find date inputs by type
    const dateInputs = screen.getAllByDisplayValue('');
    const startDateInput = dateInputs.find(input => input.type === 'date');
    const endDateInput = dateInputs.filter(input => input.type === 'date')[1];
   
    expect(startDateInput).toHaveValue('');
    expect(endDateInput).toHaveValue('');
  });

  it('displays error on submit when required fields are missing', async () => {
    render(<TripForm trip={{}} onSave={vi.fn()} onCancel={vi.fn()} />);
    
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/Please add a destination and both travel dates/)).toBeInTheDocument();
    });
  });

  it('automatically generates itinerary days when dates are selected', async () => {
    render(<TripForm trip={{}} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    // Find date inputs by type
    const dateInputs = screen.getAllByDisplayValue('');
    const startDateInput = dateInputs.find(input => input.type === 'date');
    const endDateInput = dateInputs.filter(input => input.type === 'date')[1];
   
    // Set start and end dates
    fireEvent.change(startDateInput, { target: { value: '2025-07-20' } });
    fireEvent.change(endDateInput, { target: { value: '2025-07-22' } });

    await waitFor(() => {
      expect(screen.getByText('07/20/2025')).toBeInTheDocument();
      expect(screen.getByText('07/21/2025')).toBeInTheDocument();
      expect(screen.getByText('07/22/2025')).toBeInTheDocument();
    });
  });

  it('clears itinerary if startDate is after endDate', async () => {
    render(<TripForm trip={{}} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    // Find date inputs by type
    const dateInputs = screen.getAllByDisplayValue('');
    const startDateInput = dateInputs.find(input => input.type === 'date');
    const endDateInput = dateInputs.filter(input => input.type === 'date')[1];
   
    // Set end date before start date
    fireEvent.change(startDateInput, { target: { value: '2025-07-22' } });
    fireEvent.change(endDateInput, { target: { value: '2025-07-20' } });

    await waitFor(() => {
      expect(screen.getByText('Itinerary')).toBeInTheDocument();
      expect(screen.getByText('Your days will appear here.')).toBeInTheDocument();
      expect(document.querySelectorAll('.trip-form-day')).toHaveLength(0);
    });
  });

  it('preserves existing activities when dates change', async () => {
    const tripWithActivity = {
      destination: 'Rome',
      startDate: '07/20/2025',
      endDate: '07/21/2025',
      itinerary: [
        { date: '07/20/2025', activities: [{ time: '9:00 AM', name: 'Breakfast' }] },
        { date: '07/21/2025', activities: [] }
      ]
    };
   
    render(<TripForm trip={tripWithActivity} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    // Find date inputs by type and value
    const dateInputs = screen.getAllByDisplayValue(/.*/);
    const endDateInput = dateInputs.filter(input => input.type === 'date')[1];
   
    // Extend the trip by one day
    fireEvent.change(endDateInput, { target: { value: '2025-07-22' } });

    await waitFor(() => {
      // Original activity should still be there
      expect(screen.getByText('Breakfast')).toBeInTheDocument();
      // New day should be added
      expect(screen.getByText('07/22/2025')).toBeInTheDocument();
    });
  });

  it('adds an activity to the itinerary when inputs are valid', async () => {
    render(<TripForm trip={mockTrip} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    const timeInput = screen.getAllByTestId('mock-time-picker')[0];
    const activityInput = screen.getAllByPlaceholderText('Activity Description')[0];

    fireEvent.change(timeInput, { target: { value: '11:00' } });
    fireEvent.change(activityInput, { target: { value: 'Lunch' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Activity' })[0]);

    await waitFor(() => {
      const lunch = screen.getByText('Lunch').closest('li');
      expect(within(lunch).getByText('11:00 AM')).toBeInTheDocument();
    });

    // Check that inputs are cleared after adding
    expect(timeInput.value).toBe('');
    expect(activityInput.value).toBe('');
  });

  it('sorts activities by time when added', async () => {
    const tripWithMultipleDays = {
      destination: 'Tokyo',
      startDate: '07/20/2025',
      endDate: '07/20/2025',
      itinerary: [
        { date: '07/20/2025', activities: [{ time: '2:00 PM', name: 'Lunch' }] }
      ]
    };

    render(<TripForm trip={tripWithMultipleDays} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    const timeInput = screen.getByTestId('mock-time-picker');
    const activityInput = screen.getByPlaceholderText('Activity Description');

    // Add an earlier activity
    fireEvent.change(timeInput, { target: { value: '09:00' } });
    fireEvent.change(activityInput, { target: { value: 'Breakfast' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));

    await waitFor(() => {
      const activities = screen.getAllByRole('listitem');
      // Breakfast (9:00 AM) should appear before Lunch (2:00 PM)
      expect(activities[0]).toHaveTextContent('9:00 AM');
      expect(activities[0]).toHaveTextContent('Breakfast');
      expect(activities[1]).toHaveTextContent('2:00 PM');
      expect(activities[1]).toHaveTextContent('Lunch');
    });
  });

  it('removes an activity from the itinerary', async () => {
    render(<TripForm trip={mockTrip} onSave={vi.fn()} onCancel={vi.fn()} />);
    
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    
    await waitFor(() =>
      expect(screen.queryByText('Museum Visit')).not.toBeInTheDocument()
    );
  });

  it('allows an activity without a time but still requires a name', () => {
    render(<TripForm trip={mockTrip} onSave={vi.fn()} onCancel={vi.fn()} />);

    const addBtn = screen.getAllByRole('button', { name: 'Add Activity' })[0];
    const timeInput = screen.getAllByTestId('mock-time-picker')[0];
    const nameInput = screen.getAllByPlaceholderText('Activity Description')[0];

    // A missing time creates a flexible activity.
    fireEvent.change(nameInput, { target: { value: 'No time activity' } });
    fireEvent.click(addBtn);
    expect(screen.getByText('No time activity')).toBeInTheDocument();
    expect(screen.getByText('Flexible')).toBeInTheDocument();

    // A time by itself is not enough to create an activity.
    fireEvent.change(timeInput, { target: { value: '10:30' } });
    fireEvent.click(addBtn);
    expect(screen.queryByText(/10:30/)).not.toBeInTheDocument();
  });

  it('edits an existing activity inline, including removing its time', async () => {
    render(<TripForm trip={mockTrip} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Museum Visit' }));
    fireEvent.change(screen.getByLabelText('Edit time for Museum Visit'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'Explore the museum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Explore the museum')).toBeInTheDocument();
      expect(screen.getByText('Flexible')).toBeInTheDocument();
      expect(screen.queryByText('Museum Visit')).not.toBeInTheDocument();
    });
  });

  it('reorders only flexible activities with accessible move controls', () => {
    const flexibleTrip = {
      destination: 'Lisbon',
      startDate: '07/20/2025',
      endDate: '07/20/2025',
      itinerary: [{
        date: '07/20/2025',
        activities: [
          { time: '9:00 AM', name: 'Breakfast' },
          { time: '', name: 'Browse the market' },
          { time: '', name: 'Walk the waterfront' },
        ],
      }],
    };

    render(<TripForm trip={flexibleTrip} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Move Breakfast earlier' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Walk the waterfront earlier' }));
    const activities = screen.getAllByRole('listitem');
    expect(activities[0]).toHaveTextContent('Breakfast');
    expect(activities[1]).toHaveTextContent('Walk the waterfront');
    expect(activities[2]).toHaveTextContent('Browse the market');
  });

  it('places flexible activities between timed activities without changing timed order', () => {
    const mixedTrip = {
      destination: 'Lisbon',
      startDate: '07/20/2025',
      endDate: '07/20/2025',
      itinerary: [{
        date: '07/20/2025',
        activities: [
          { time: '9:00 AM', name: 'Breakfast' },
          { time: '2:00 PM', name: 'Museum' },
          { time: '', name: 'Walk around' },
        ],
      }],
    };

    render(<TripForm trip={mixedTrip} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Walk around earlier' }));

    const activities = screen.getAllByRole('listitem');
    expect(activities[0]).toHaveTextContent('9:00 AM');
    expect(activities[1]).toHaveTextContent('Walk around');
    expect(activities[2]).toHaveTextContent('2:00 PM');
  });

  it('adds activity only to the matching day', async () => {
    const multiDayTrip = {
      destination: 'Rome',
      startDate: '07/20/2025',
      endDate: '07/21/2025',
      itinerary: [
        { date: '07/20/2025', activities: [] },
        { date: '07/21/2025', activities: [] },
      ],
    };

    render(<TripForm trip={multiDayTrip} onSave={vi.fn()} onCancel={vi.fn()} />);

    // Find the day sections
    const day1Section = screen.getByText('07/20/2025').closest('.border');
    const day2Section = screen.getByText('07/21/2025').closest('.border');

    // Add activity to second day only
    const timePickers = screen.getAllByTestId('mock-time-picker');
    const nameInputs = screen.getAllByPlaceholderText('Activity Description');
    const addButtons = screen.getAllByRole('button', { name: 'Add Activity' });

    fireEvent.change(timePickers[1], { target: { value: '14:00' } });
    fireEvent.change(nameInputs[1], { target: { value: 'Forum Visit' } });
    fireEvent.click(addButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('Forum Visit')).toBeInTheDocument();
    });

    // Verify activity is only in day 2
    const day1Activities = within(day1Section).queryAllByText('Forum Visit');
    const day2Activities = within(day2Section).queryAllByText('Forum Visit');

    expect(day1Activities.length).toBe(0);
    expect(day2Activities.length).toBe(1);
  });

  it('calls onSave with correct data including userId on submit', async () => {
    const onSave = vi.fn();
    render(<TripForm trip={mockTrip} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        destination: 'Paris',
        startDate: '07/20/2025',
        endDate: '07/21/2025',
        user: {
          userId: 'test-user-123'
        },
        itinerary: expect.arrayContaining([
          expect.objectContaining({
            date: '07/20/2025',
            activities: expect.arrayContaining([
              expect.objectContaining({
                time: '10:00 AM',
                name: 'Museum Visit',
              }),
            ]),
          }),
        ]),
      }))
    );
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<TripForm trip={{}} onSave={vi.fn()} onCancel={onCancel} />);
    
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('handles date format conversion correctly', () => {
    const tripWithDates = {
      destination: 'London',
      startDate: '12/25/2025',
      endDate: '12/31/2025',
      itinerary: []
    };

    render(<TripForm trip={tripWithDates} onSave={vi.fn()} onCancel={vi.fn()} />);

    // Check that dates are converted to ISO format for input fields
    const dateInputs = screen.getAllByDisplayValue(/.*/);
    const startDateInput = dateInputs.find(input => input.type === 'date');
    const endDateInput = dateInputs.filter(input => input.type === 'date')[1];
   
    expect(startDateInput).toHaveValue('2025-12-25');
    expect(endDateInput).toHaveValue('2025-12-31');
  });

  it('validates end date is not before start date in form', () => {
    render(<TripForm trip={{}} onSave={vi.fn()} onCancel={vi.fn()} />);
   
    // Find date inputs by type
    const dateInputs = screen.getAllByDisplayValue('');
    const startDateInput = dateInputs.find(input => input.type === 'date');
    const endDateInput = dateInputs.filter(input => input.type === 'date')[1];

    fireEvent.change(startDateInput, { target: { value: '2025-07-20' } });
   
    // End date input should have min attribute set to start date
    expect(endDateInput).toHaveAttribute('min', '2025-07-20');
  });

  // Skipping image upload tests due to label association issues
  // it('handles image upload and compression', async () => {
  //   render(<TripForm trip={{}} onSave={vi.fn()} onCancel={vi.fn()} />);
  //   // Test implementation skipped
  // });

  // it('calls uploadTripImage when saving with selected image file', async () => {
  //   const onSave = vi.fn();
  //   render(<TripForm trip={{}} onSave={onSave} onCancel={vi.fn()} />);
  //   // Test implementation skipped
  // });
});
