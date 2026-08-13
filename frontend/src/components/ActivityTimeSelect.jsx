import { useEffect, useRef, useState } from 'react';

const HOURS = ['12', ...Array.from({ length: 11 }, (_, index) => String(index + 1))];
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

const getTimeParts = (value) => {
  if (value) {
    const [hourValue, minuteValue] = value.split(':').map(Number);
    return {
      hour: String(hourValue % 12 || 12),
      minute: String(minuteValue).padStart(2, '0'),
      period: hourValue >= 12 ? 'PM' : 'AM',
    };
  }

  return {
    hour: '12',
    minute: '00',
    period: 'AM',
  };
};

const formatDisplayTime = (value) => {
  if (!value) return 'No time';
  const { hour, minute, period } = getTimeParts(value);
  return `${hour}:${minute} ${period}`;
};

const toTwentyFourHourTime = ({ hour, minute, period }) => {
  const numericHour = Number(hour) % 12 + (period === 'PM' ? 12 : 0);
  return `${String(numericHour).padStart(2, '0')}:${minute}`;
};

export default function ActivityTimeSelect({ value = '', onChange, ariaLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingTime, setPendingTime] = useState(() => getTimeParts(value));
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    setPendingTime(getTimeParts(value));
    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    const frame = window.requestAnimationFrame(() => {
      pickerRef.current?.querySelectorAll('[data-selected="true"]').forEach((option) => {
        option.scrollIntoView?.({ block: 'center' });
      });
    });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen, value]);

  const closeAndFocus = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const applyTime = () => {
    onChange(toTwentyFourHourTime(pendingTime));
    closeAndFocus();
  };

  const clearTime = () => {
    onChange('');
    closeAndFocus();
  };

  const selectCenteredOption = (event, field, options) => {
    const listbox = event.currentTarget;
    const itemHeight = Number.parseFloat(
      window.getComputedStyle(listbox).getPropertyValue('--time-wheel-item-height'),
    ) || 36;
    const selectedIndex = Math.max(
      0,
      Math.min(options.length - 1, Math.round(listbox.scrollTop / itemHeight)),
    );
    const nextValue = options[selectedIndex];

    setPendingTime((current) => (
      current[field] === nextValue ? current : { ...current, [field]: nextValue }
    ));
  };

  const chooseOption = (event, field, nextValue) => {
    setPendingTime((current) => ({ ...current, [field]: nextValue }));
    event.currentTarget.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className="activity-time-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`activity-time-trigger${isOpen ? ' is-open' : ''}${value ? ' has-value' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg className="activity-time-clock-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3.5 2" />
        </svg>
        <span>{formatDisplayTime(value)}</span>
        {value ? (
          <svg className="activity-time-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 10 4 4 4-4" />
          </svg>
        ) : (
          <span className="activity-time-flexible-label">Flexible</span>
        )}
      </button>

      {isOpen && (
        <div className="activity-time-wheel" role="dialog" aria-label="Select activity time">
          <header>
            <div>
              <strong>Select time</strong>
              <small>Scroll each column</small>
            </div>
            <button type="button" aria-label="Close time picker" onClick={closeAndFocus}>×</button>
          </header>

          <div className="activity-time-wheel-columns">
            <div className="activity-time-wheel-column">
              <span>Hour</span>
              <div
                role="listbox"
                aria-label="Hour"
                onScroll={(event) => selectCenteredOption(event, 'hour', HOURS)}
              >
                {HOURS.map((hour) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={pendingTime.hour === hour}
                    data-selected={pendingTime.hour === hour}
                    className={pendingTime.hour === hour ? 'is-selected' : ''}
                    key={hour}
                    onClick={(event) => chooseOption(event, 'hour', hour)}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>

            <div className="activity-time-wheel-column">
              <span>Minute</span>
              <div
                role="listbox"
                aria-label="Minute"
                onScroll={(event) => selectCenteredOption(event, 'minute', MINUTES)}
              >
                {MINUTES.map((minute) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={pendingTime.minute === minute}
                    data-selected={pendingTime.minute === minute}
                    className={pendingTime.minute === minute ? 'is-selected' : ''}
                    key={minute}
                    onClick={(event) => chooseOption(event, 'minute', minute)}
                  >
                    {minute}
                  </button>
                ))}
              </div>
            </div>

            <div className="activity-time-wheel-column activity-time-wheel-period">
              <span>Period</span>
              <div
                role="listbox"
                aria-label="AM or PM"
                onScroll={(event) => selectCenteredOption(event, 'period', PERIODS)}
              >
                {PERIODS.map((period) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={pendingTime.period === period}
                    data-selected={pendingTime.period === period}
                    className={pendingTime.period === period ? 'is-selected' : ''}
                    key={period}
                    onClick={(event) => chooseOption(event, 'period', period)}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <footer>
            <button type="button" className="activity-time-no-time" onClick={clearTime}>No time</button>
            <button type="button" className="activity-time-done" onClick={applyTime}>Done</button>
          </footer>
        </div>
      )}
    </div>
  );
}
