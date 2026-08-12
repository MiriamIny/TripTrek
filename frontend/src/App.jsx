import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Import your page components
import Home from './pages/Home';
import About from './pages/About';
import ContactUs from './pages/ContactUs';
import TripList from './pages/TripList';
import TripDetail from './pages/TripDetail';
import NavigationBar from './components/NavigationBar';
import { TripProvider } from './context/TripContext'; 
import Chatbot from './components/chatbot/Chatbot';
import AuthModal from './components/AuthModal';

function App() {
  // No need to pass user props anymore
  return (
    <TripProvider>
      <Router>
        <div>
          <NavigationBar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<ContactUs />} />
            <Route path="/trips" element={<TripList />} />
            <Route path="/trips/:tripId" element={<TripDetail />} />
          </Routes>
        </div>
        <Chatbot />
        <AuthModal />
      </Router>
    </TripProvider>
  );
}

export default App;

