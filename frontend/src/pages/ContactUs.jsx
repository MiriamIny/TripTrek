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
              <label htmlFor="contact-subject">What can we help with?</label>
              <div className="contact-select-wrap">
                <select id="contact-subject" name="subject" defaultValue="" required>
                  <option value="" disabled>Choose a topic</option>
                  <option value="planning">Trip planning</option>
                  <option value="account">Account and sign-in</option>
                  <option value="feedback">Feedback or an idea</option>
                  <option value="other">Something else</option>
                </select>
              </div>
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
