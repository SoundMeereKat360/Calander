import React, { useEffect, useState } from 'react';
import './App.css';
import Calendar from './components/Calendar';
import EventForm from './components/EventForm';
import AIScheduler from './components/AIScheduler';
import CanvasSettings from './components/CanvasSettings';
import ChatBot from './components/ChatBot';

const DAILY_QUOTES = [
  'Small steps, done consistently, build remarkable semesters.',
  'You do not need a perfect plan to make meaningful progress today.',
  'A focused hour now can save a stressful night later.',
  'Momentum grows every time you keep one promise to yourself.',
  'The work you start calmly today becomes confidence tomorrow.',
  'A clear calendar makes room for a clearer mind.',
  'Progress feels quiet while it is happening, but it still counts.',
  'Consistency beats intensity when the goal is a strong semester.',
  'Each deadline met is proof that you can trust your own effort.',
  'Good days are built from small decisions repeated on purpose.',
  'You are closer to organized than you were yesterday.',
  'Make today easier for future you, one task at a time.'
];

function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentlyDeleted, setRecentlyDeleted] = useState([]);
  const [showUndo, setShowUndo] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [sortMode, setSortMode] = useState('date');
  const [courseColors, setCourseColors] = useState({});
  const [availableCourses, setAvailableCourses] = useState([]);
  const [headerTime, setHeaderTime] = useState(new Date());
  const [primaryUserName, setPrimaryUserName] = useState('');
  const [subscriptionUrl, setSubscriptionUrl] = useState('');
  const [subscriptionRefreshTime, setSubscriptionRefreshTime] = useState('');
  const [refreshingSubscription, setRefreshingSubscription] = useState(false);
  const [hiddenCourseNames, setHiddenCourseNames] = useState([]);

  useEffect(() => {
    fetchEvents();
    fetchSubscriptionUrl();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setHeaderTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dayStamp = `${headerTime.getFullYear()}-${headerTime.getMonth()}-${headerTime.getDate()}`;
  const quoteIndex = Math.abs(Array.from(dayStamp).reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % DAILY_QUOTES.length;
  const headerQuote = DAILY_QUOTES[quoteIndex];

  const getDefaultColor = (courseName) => {
    const palette = ['#667eea', '#38a169', '#f6ad55', '#ed64a6', '#2b6cb0', '#d53f8c', '#4a5568', '#2c7a7b'];
    const index = Math.abs(Array.from(courseName || 'A').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % palette.length;
    return palette[index];
  };

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchSubscriptionUrl = async () => {
    try {
      const response = await fetch('/api/calendar/subscription');
      const data = await response.json();
      setSubscriptionUrl(data.feedUrl || '');
      setSubscriptionRefreshTime(data.lastRefreshedAt || '');
    } catch (error) {
      console.error('Error fetching subscription URL:', error);
    }
  };

  const addEvent = async (event) => {
    try {
      setLoading(true);
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      const data = await response.json();
      setEvents((prev) => [...prev, data.event]);
      if (data.event.course) {
        setAvailableCourses((prev) => (
          prev.includes(data.event.course)
            ? prev
            : [...prev, data.event.course].sort((a, b) => a.localeCompare(b))
        ));
      }
    } catch (error) {
      console.error('Error adding event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCoursesLoaded = (courses) => {
    setCourseColors((prev) => {
      const next = { ...prev };
      courses.forEach((course) => {
        if (!next[course.name]) {
          next[course.name] = getDefaultColor(course.name);
        }
      });
      return next;
    });
    setAvailableCourses((prev) => {
      const merged = new Set(prev);
      courses.forEach((course) => merged.add(course.name));
      return Array.from(merged).sort((a, b) => a.localeCompare(b));
    });
  };

  const handleCourseColorChange = (courseName, color) => {
    setCourseColors((prev) => ({ ...prev, [courseName]: color }));
  };

  const filteredEvents = useMemo(
    () => events.filter((event) => !event.course || !hiddenCourseNames.includes(event.course)),
    [events, hiddenCourseNames]
  );

  const handleSyncAssignments = (canvasEvents) => {
    setEvents((prev) => {
      const nonCanvasEvents = prev.filter((event) => !String(event.id || '').startsWith('canvas_'));
      return [...nonCanvasEvents, ...canvasEvents];
    });
    setCourseColors((prev) => {
      const next = { ...prev };
      canvasEvents.forEach((event) => {
        if (event.course && !next[event.course]) {
          next[event.course] = getDefaultColor(event.course);
        }
      });
      return next;
    });
    setAvailableCourses((prev) => {
      const merged = new Set(prev);
      canvasEvents.forEach((event) => {
        if (event.course) {
          merged.add(event.course);
        }
      });
      return Array.from(merged).sort((a, b) => a.localeCompare(b));
    });
    setLastSync(new Date());
    fetchEvents();
  };

  const handleDeleteEvent = (eventId) => {
    const eventToDelete = events.find((event) => event.id === eventId);
    if (eventToDelete) {
      setEvents((prev) => prev.filter((event) => event.id !== eventId));
      setRecentlyDeleted([eventToDelete]);
      setShowUndo(true);

      setTimeout(() => setShowUndo(false), 10000);
    }
  };

  const handleUndoDelete = () => {
    if (recentlyDeleted.length > 0) {
      setEvents((prev) => [...prev, ...recentlyDeleted]);
      setRecentlyDeleted([]);
      setShowUndo(false);
    }
  };

  const handleToggleComplete = (eventId) => {
    setEvents((prev) => prev.map((event) => (
      event.id === eventId
        ? { ...event, completed: !event.completed }
        : event
    )));
  };

  const handleCopySubscriptionUrl = async () => {
    if (!subscriptionUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      alert('Subscription URL copied. Add it in iPhone Calendar under Add Subscription Calendar.');
    } catch (error) {
      console.error('Error copying subscription URL:', error);
      alert(subscriptionUrl);
    }
  };

  const handleRefreshSubscription = async () => {
    try {
      setRefreshingSubscription(true);
      const response = await fetch('/api/calendar/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh subscription feed');
      }

      setSubscriptionRefreshTime(data.refreshedAt || new Date().toISOString());
      await fetchEvents();
      alert(`Subscription feed updated with ${data.syncedEvents || 0} synced events.`);
    } catch (error) {
      console.error('Error refreshing subscription feed:', error);
      alert(error.message || 'Failed to refresh subscription feed');
    } finally {
      setRefreshingSubscription(false);
    }
  };

  const handleHiddenCoursesChange = (courseNames) => {
    setHiddenCourseNames(courseNames);
  };

  const handleResyncHiddenCourses = async (courseNames) => {
    const response = await fetch('/api/calendar/resync-hidden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenCourses: courseNames })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to resync hidden courses');
    }

    const visibleEvents = (data.events || []).filter((event) => !courseNames.includes(event.course));
    handleSyncAssignments(visibleEvents);
    await fetchSubscriptionUrl();
    return data;
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <h1>AI Calendar Agent</h1>
          <p>{primaryUserName ? `Welcome, ${primaryUserName}` : 'Welcome back'}</p>
          <div className="header-quote">{headerQuote}</div>
          <div className="header-actions">
            {lastSync && <span className="sync-badge">Last sync: {lastSync.toLocaleString()}</span>}
            {showUndo && (
              <button onClick={handleUndoDelete} className="undo-btn">
                Undo Delete
              </button>
            )}
          </div>
        </div>

        <div className="header-meta">
          <span>{headerTime.toLocaleDateString()}</span>
          <span>{headerTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </header>

      <div className="container">
        <div className="left-panel">
          <EventForm onAddEvent={addEvent} loading={loading} courses={availableCourses} />

          <div className="sort-control">
            <label htmlFor="sortMode">Sort calendar by:</label>
            <select id="sortMode" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="date">Date</option>
              <option value="class">Class</option>
            </select>
          </div>

          <button onClick={handleCopySubscriptionUrl} className="subscription-btn" disabled={!subscriptionUrl}>
            Copy Subscription URL
          </button>

          <button
            onClick={handleRefreshSubscription}
            className="subscription-refresh-btn"
            disabled={refreshingSubscription}
          >
            {refreshingSubscription ? 'Updating Subscription...' : 'Update Subscription Feed'}
          </button>

          {subscriptionRefreshTime && (
            <div className="subscription-refresh-time">
              Feed updated: {new Date(subscriptionRefreshTime).toLocaleString()}
            </div>
          )}

          <AIScheduler />
        </div>

        <div className="right-panel">
          <Calendar
            events={filteredEvents}
            onDeleteEvent={handleDeleteEvent}
            onToggleComplete={handleToggleComplete}
            sortMode={sortMode}
            courseColors={courseColors}
          />
        </div>

        <div className="side-panel">
          <CanvasSettings
            onSyncAssignments={handleSyncAssignments}
            onCoursesLoaded={handleCoursesLoaded}
            courseColors={courseColors}
            onCourseColorChange={handleCourseColorChange}
            onPrimaryUserChange={setPrimaryUserName}
            onHiddenCoursesChange={handleHiddenCoursesChange}
            onResyncHiddenCourses={handleResyncHiddenCourses}
          />
        </div>
      </div>

      <ChatBot />
    </div>
  );
}

export default App;
