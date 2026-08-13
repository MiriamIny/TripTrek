import { useEffect, useId, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export default function PlaceAddressAutocomplete({ value, onChange, destination = '', ...inputProps }) {
  const placesLibrary = useMapsLibrary('places');
  const listboxId = useId();
  const sessionToken = useRef(null);
  const requestId = useRef(0);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const input = value.trim();
    if (!placesLibrary || input.length < 2 || !isOpen) {
      setSuggestions([]);
      setIsLoading(false);
      return undefined;
    }

    if (!sessionToken.current) sessionToken.current = new placesLibrary.AutocompleteSessionToken();
    const currentRequest = ++requestId.current;
    const timeout = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        const response = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: destination ? `${input}, ${destination}` : input,
          sessionToken: sessionToken.current,
        });
        if (currentRequest !== requestId.current) return;
        setSuggestions((response.suggestions || []).filter((item) => item.placePrediction).slice(0, 5));
        setActiveIndex(-1);
      } catch (error) {
        if (currentRequest === requestId.current) {
          console.warn('Unable to load address suggestions:', error);
          setSuggestions([]);
        }
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [destination, isOpen, placesLibrary, value]);

  const selectSuggestion = async (suggestion) => {
    const place = suggestion.placePrediction.toPlace();
    try {
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      const displayName = place.displayName?.trim();
      const formattedAddress = place.formattedAddress?.trim();
      onChange(
        displayName && formattedAddress && !formattedAddress.toLowerCase().includes(displayName.toLowerCase())
          ? `${displayName}, ${formattedAddress}`
          : formattedAddress || displayName || suggestion.placePrediction.text.toString(),
      );
    } catch (error) {
      console.warn('Unable to load selected place details:', error);
      onChange(suggestion.placePrediction.text.toString());
    }
    sessionToken.current = null;
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="place-address-autocomplete">
      <input
        {...inputProps}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && suggestions.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        onFocus={(event) => {
          setIsOpen(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setIsOpen(false), 120);
          inputProps.onBlur?.(event);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && suggestions.length) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp' && suggestions.length) {
            event.preventDefault();
            setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
          } else if (event.key === 'Escape') {
            setIsOpen(false);
          } else {
            inputProps.onKeyDown?.(event);
          }
        }}
      />
      {isOpen && (suggestions.length > 0 || isLoading) && (
        <div className="place-address-suggestions-wrap">
          {isLoading && !suggestions.length ? (
            <span className="place-address-suggestions-status" role="status">Finding places&hellip;</span>
          ) : (
            <ul id={listboxId} className="place-address-suggestions" role="listbox">
              {suggestions.map((suggestion, index) => (
                <li
                  id={`${listboxId}-option-${index}`}
                  key={`${suggestion.placePrediction.placeId}-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" />
                      <circle cx="12" cy="10" r="2" />
                    </svg>
                    <span>{suggestion.placePrediction.text.toString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
