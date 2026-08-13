import { Link } from 'react-router-dom';
import './About.css';

const principles = [
  {
    number: '01',
    title: 'Clarity without rigidity',
    description: 'A good itinerary gives your trip direction while leaving room for the moments you never planned.',
  },
  {
    number: '02',
    title: 'Everything in one place',
    description: 'Dates, activities, and destination details should feel connected—not scattered across tabs and notes.',
  },
  {
    number: '03',
    title: 'Planning can be part of the fun',
    description: 'Looking ahead should build excitement for the journey, not become another item on your to-do list.',
  },
];

const About = () => {
  return (
    <main className="about-page">
      <section className="about-hero" aria-labelledby="about-heading">
        <div className="about-hero-copy">
          <p className="about-eyebrow">About Trek A Trip</p>
          <h1 id="about-heading">Planning should feel like the beginning of the adventure.</h1>
          <p className="about-intro">
            Trek A Trip was created to make planning a trip feel clear, personal, and genuinely
            exciting—from the first idea to the day you leave.
          </p>
          <Link className="about-hero-link" to="/trips">
            Start planning
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="about-hero-visual">
          <img
            src="/images/about-flight.jpg"
            alt="Airplane wing above the clouds during a golden-hour flight"
          />
          <div className="about-hero-quote">
            <span aria-hidden="true">“</span>
            <p>The best journeys start long before takeoff.</p>
          </div>
        </div>
      </section>

      <section className="about-origin" aria-labelledby="about-origin-heading">
        <div className="about-origin-heading">
          <p>Why Trek A Trip exists</p>
          <h2 id="about-origin-heading">Less juggling. More looking forward.</h2>
        </div>
        <div className="about-origin-copy">
          <p>
            Ever wish your trip was thoughtfully planned instead of pieced together day by day?
            Or wanted to skip the endless back-and-forth about where to go and what to see?
          </p>
          <p>
            We did too. Trek A Trip brings the shape of a journey into one calm view, so you can
            build each day, keep the important details close, and head out knowing what comes next.
          </p>
        </div>
      </section>

      <section className="about-principles" aria-labelledby="about-principles-heading">
        <header>
          <p>What guides us</p>
          <h2 id="about-principles-heading">Designed around the way travel should feel.</h2>
        </header>
        <div className="about-principles-grid">
          {principles.map((principle) => (
            <article className="about-principle" key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-journey" aria-labelledby="about-journey-heading">
        <div className="about-journey-image">
          <img
            src="/images/about-digital-planning-portrait.jpg"
            alt="Laptop displaying a digital trip itinerary beside a map, coffee, camera, sunhat, sunglasses, and passport"
          />
        </div>
        <div className="about-journey-copy">
          <p>From idea to itinerary</p>
          <h2 id="about-journey-heading">Your trip is yours. The plan should be too.</h2>
          <p>
            Trek A Trip gives you a simple structure for turning inspiration into something useful.
            Start with a destination, shape the days around what matters to you, and keep refining
            until the plan feels right.
          </p>
          <p className="about-journey-emphasis">
            Let’s make trip planning part of the fun—and your vacation the best one yet.
          </p>
        </div>
      </section>

      <section className="about-final" aria-labelledby="about-final-heading">
        <div>
          <p>Ready when you are</p>
          <h2 id="about-final-heading">Where will your next plan take you?</h2>
        </div>
        <Link to="/trips">Plan your next trip</Link>
      </section>
    </main>
  );
};

export default About;
