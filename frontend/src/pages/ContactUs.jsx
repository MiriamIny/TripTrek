
import './ContactUs.css';

function ContactUs() {
  return (
    <main className="contact-page">
      <div className="contact-content container">
        <header className="contact-header">
          <h1>Contact Us</h1>
          <p>
          Have questions about your itinerary or need help planning your next trip? Reach out to us!
          </p>
        </header>

        <form className="contact-form" onSubmit={(event) => event.preventDefault()}>
          <div className="contact-field">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Your name"
              required
            />
          </div>
          <div className="contact-field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              placeholder="name@example.com"
              required
            />
          </div>
          <div className="contact-field">
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              name="message"
              rows="6"
              placeholder="How can we help?"
              required
            />
          </div>
          <button type="submit" className="contact-submit">Send Message</button>
        </form>
      </div>
    </main>
  );
}

export default ContactUs;
