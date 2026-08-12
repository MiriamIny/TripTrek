import { useEffect, useRef, useState } from 'react';
import './ContactUs.css';

const contactTopics = [
  {
    title: 'Planning questions',
    description: 'Something about building or organizing a trip.',
  },
  {
    title: 'Account support',
    description: 'Help with signing in or managing your account.',
  },
  {
    title: 'Ideas & feedback',
    description: 'A feature request or thought that could improve TripTrek.',
  },
];

const subjectOptions = [
  { value: 'planning', label: 'Trip planning' },
  { value: 'account', label: 'Account and sign-in' },
  { value: 'feedback', label: 'Feedback or an idea' },
  { value: 'other', label: 'Something else' },
];

function ContactTopicSelect() {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState('');
  const selectRef = useRef(null);
  const selectedOption = subjectOptions.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!selectRef.current?.contains(event.target)) setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  const chooseOption = (option) => {
    setValue(option.value);
    setIsOpen(false);
  };

  return (
    <div className="contact-select-wrap" ref={selectRef}>
      <input type="hidden" name="subject" value={value} />
      <button
        type="button"
        id="contact-subject"
        className={`contact-select-trigger${value ? '' : ' is-placeholder'}`}
        aria-labelledby="contact-subject-label contact-subject-value"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="contact-subject-options"
        aria-required="true"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          }
          if (event.key === 'Escape') setIsOpen(false);
        }}
      >
        <span id="contact-subject-value">{selectedOption?.label ?? 'Choose a topic'}</span>
        <span className="contact-select-chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <ul id="contact-subject-options" className="contact-select-options" role="listbox">
          {subjectOptions.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {value === option.value && (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 12 4 4 8-8" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactUs() {
  return (
    <main className="contact-page">
      <section className="contact-shell" aria-labelledby="contact-heading">
        <div className="contact-intro">
          <div className="contact-intro-copy">
            <p className="contact-eyebrow">Get in touch</p>
            <h1 id="contact-heading">Let’s make your next trip easier.</h1>
            <p className="contact-lede">
              Questions, feedback, or a planning snag—we’d love to hear what’s on your mind.
            </p>
          </div>

          <div className="contact-topics" aria-label="Things you can contact us about">
            {contactTopics.map((topic) => (
              <article className="contact-topic" key={topic.title}>
                <span aria-hidden="true" />
                <div>
                  <h2>{topic.title}</h2>
                  <p>{topic.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="contact-route" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="contact-form-panel">
          <div className="contact-form-heading">
            <p>Send us a note</p>
            <h2>How can we help?</h2>
          </div>

          <form className="contact-form" onSubmit={(event) => event.preventDefault()}>
            <div className="contact-field-row">
              <div className="contact-field">
                <label htmlFor="contact-name">Name</label>
                <input
                  type="text"
                  id="contact-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  required
                />
              </div>

              <div className="contact-field">
                <label htmlFor="contact-email">Email</label>
                <input
                  type="email"
                  id="contact-email"
                  name="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div className="contact-field">
              <label id="contact-subject-label">What can we help with?</label>
              <ContactTopicSelect />
            </div>

            <div className="contact-field">
              <div className="contact-label-row">
                <label htmlFor="contact-message">Message</label>
                <span id="contact-message-hint">Please don’t include sensitive information.</span>
              </div>
              <textarea
                id="contact-message"
                name="message"
                rows="6"
                maxLength="1500"
                aria-describedby="contact-message-hint"
                placeholder="Tell us a little more..."
                required
              />
            </div>

            <button type="submit" className="contact-submit">
              <span>Send message</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default ContactUs;
