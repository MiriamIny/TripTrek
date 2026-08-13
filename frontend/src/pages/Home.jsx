import { useNavigate } from 'react-router-dom';
import './Home.css';

const features = [
  {
    title: 'Build it day by day',
    description: 'Turn ideas into a clear itinerary with every activity organized in the right place.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="14" rx="2" />
        <path d="M8 3v5M16 3v5M4 10h16M8 14h3M8 17h6" />
      </svg>
    ),
  },
  {
    title: 'See the journey',
    description: 'Keep your destination and stops connected with a visual map of the trip ahead.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z" />
        <path d="M8 4v13M16 7v13" />
      </svg>
    ),
  },
  {
    title: 'Keep plans together',
    description: 'Dates, activities, notes, and destination details stay in one calm, easy-to-find space.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
];

const inspiration = [
  { name: 'Escape to the coast', image: '/images/beach.jpg', className: 'home-inspiration-card--wide' },
  { name: 'Take the forest trail', image: '/images/hike.jpg' },
  { name: 'Reach new heights', image: '/images/MountEverest.jpg' },
];

const Home = () => {
  const navigate = useNavigate();
  const redirectToTrips = () => navigate('/trips');

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-heading">
        <div className="home-hero-copy">
          <p className="home-eyebrow">
            <span aria-hidden="true">✦</span>
            Your itinerary, made simple
          </p>
          <h1 id="home-heading">
            Your next adventure deserves a <span>beautiful plan.</span>
          </h1>
          <p className="home-hero-intro">
            Bring every day, destination, and must-do moment together—then spend less time
            organizing and more time looking forward to the trip.
          </p>
          <div className="home-hero-actions">
            <button type="button" className="home-primary-cta" onClick={redirectToTrips}>
              Plan Your Next Trip
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M14 7l5 5-5 5" />
              </svg>
            </button>
            <a className="home-secondary-cta" href="#how-it-works">
              See how it works
            </a>
          </div>
          <ul className="home-hero-points" aria-label="Trek A Trip highlights">
            <li><span aria-hidden="true">✓</span> Free to start</li>
            <li><span aria-hidden="true">✓</span> Easy day-by-day planning</li>
            <li><span aria-hidden="true">✓</span> Everything in one place</li>
          </ul>
        </div>

        <div className="home-hero-visual" aria-label="A preview of a planned trip to Venice">
          <div className="home-hero-image-wrap">
            <img src="/images/Venice.jpg" alt="A canal winding through Venice at sunset" />
            <div className="home-image-shade" />
            <div className="home-destination-label">
              <span>Dream destination</span>
              <strong>Venice, Italy</strong>
            </div>
          </div>

          <div className="home-plan-card">
            <div className="home-plan-card-header">
              <div>
                <span>Day 2</span>
                <strong>A perfect day in Venice</strong>
              </div>
              <span className="home-plan-date">Jun 18</span>
            </div>
            <ol className="home-plan-list">
              <li>
                <time>9:00</time>
                <span><strong>Rialto Market</strong><small>Start with espresso nearby</small></span>
              </li>
              <li>
                <time>12:30</time>
                <span><strong>Canal-side lunch</strong><small>San Polo neighborhood</small></span>
              </li>
              <li>
                <time>6:45</time>
                <span><strong>Sunset gondola ride</strong><small>Grand Canal</small></span>
              </li>
            </ol>
          </div>

          <div className="home-ready-badge">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
            <span><strong>Ready to explore</strong>Your plan is all in one place</span>
          </div>
        </div>
      </section>

      <section className="home-features" aria-labelledby="home-features-heading">
        <div className="home-section-heading">
          <p>Plan with confidence</p>
          <h2 id="home-features-heading">From “where should we go?” to ready to depart.</h2>
          <span>Trek A Trip gives your ideas enough structure to become a trip—without making planning feel like work.</span>
        </div>
        <div className="home-feature-grid">
          {features.map((feature) => (
            <article className="home-feature-card" key={feature.title}>
              <div className="home-feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-how" id="how-it-works" aria-labelledby="home-how-heading">
        <div className="home-how-image">
          <img src="/images/Switzerland.jpg" alt="A mountain railway traveling through the Swiss Alps" />
          <div className="home-how-note">
            <span aria-hidden="true">⌖</span>
            <p><strong>One trip, one clear view</strong>Know what comes next wherever you are.</p>
          </div>
        </div>
        <div className="home-how-copy">
          <p className="home-section-kicker">How it works</p>
          <h2 id="home-how-heading">A better trip starts in three simple steps.</h2>
          <ol className="home-step-list">
            <li>
              <span>01</span>
              <div><strong>Choose the adventure</strong><p>Add your destination and travel dates.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>Shape each day</strong><p>Build a flexible itinerary around the moments that matter.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>Go with a plan</strong><p>Keep the details close and enjoy the journey.</p></div>
            </li>
          </ol>
          <button type="button" className="home-text-cta" onClick={redirectToTrips}>
            Start planning
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section className="home-inspiration" aria-labelledby="home-inspiration-heading">
        <div className="home-section-heading home-section-heading--left">
          <p>A little inspiration</p>
          <h2 id="home-inspiration-heading">Where will your next plan take you?</h2>
        </div>
        <div className="home-inspiration-grid">
          {inspiration.map((destination) => (
            <article
              className={`home-inspiration-card ${destination.className || ''}`}
              key={destination.name}
            >
              <img src={destination.image} alt="" />
              <div className="home-image-shade" />
              <h3>{destination.name}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="home-final-cta" aria-labelledby="home-final-heading">
        <div>
          <p>Your next favorite memory starts here.</p>
          <h2 id="home-final-heading">Turn the trip in your head into a plan you can follow.</h2>
        </div>
        <button type="button" onClick={redirectToTrips}>Create your itinerary</button>
      </section>
    </main>
  );
};

export default Home;
