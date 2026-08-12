import { forwardRef } from 'react';
import DatePicker from 'react-datepicker';
import { addYears, format, parse, startOfDay } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';

const parseTripDate = (value) => (
  value ? parse(value, 'MM/dd/yyyy', new Date()) : null
);

const formatRange = (startDate, endDate) => {
  if (!startDate) return '';
  if (!endDate) return `${format(startDate, 'MMM d, yyyy')} – choose end date`;
  return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
};

const DateTrigger = forwardRef(function DateTrigger({ displayValue, onClick, placeholder, id }, ref) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      className={`trip-date-trigger${displayValue ? ' has-value' : ''}`}
      onClick={onClick}
    >
      <svg className="trip-date-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
      </svg>
      <span>{displayValue || placeholder}</span>
      <svg className="trip-date-trigger-chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 10 4 4 4-4" />
      </svg>
    </button>
  );
});

export default function TripDatePicker({ id, startDate, endDate, onChange, placeholder }) {
  const selectedStartDate = parseTripDate(startDate);
  const selectedEndDate = parseTripDate(endDate);
  const today = startOfDay(new Date());

  return (
    <DatePicker
      id={id}
      selected={selectedStartDate}
      startDate={selectedStartDate}
      endDate={selectedEndDate}
      minDate={today}
      maxDate={addYears(today, 20)}
      onChange={([nextStartDate, nextEndDate]) => onChange(
        nextStartDate ? format(nextStartDate, 'MM/dd/yyyy') : '',
        nextEndDate ? format(nextEndDate, 'MM/dd/yyyy') : '',
      )}
      customInput={(
        <DateTrigger
          placeholder={placeholder}
          displayValue={formatRange(selectedStartDate, selectedEndDate)}
        />
      )}
      calendarClassName="trip-calendar"
      popperClassName="trip-calendar-popper"
      popperPlacement="bottom-start"
      monthsShown={1}
      showPopperArrow={false}
      calendarStartDay={0}
      selectsRange
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
    />
  );
}
