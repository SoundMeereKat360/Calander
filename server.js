const express = require('express');
const cors = require('cors');
require('dotenv').config();
const CanvasService = require('./services/canvasService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const FEED_TOKEN = process.env.CALENDAR_FEED_TOKEN || 'local-dev-feed-token';
const CLIENT_BUILD_PATH = path.join(__dirname, 'client', 'build');
const HAS_CLIENT_BUILD = fs.existsSync(CLIENT_BUILD_PATH);

// Middleware
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
if (HAS_CLIENT_BUILD) {
  app.use(express.static(CLIENT_BUILD_PATH));
}

// Persistent storage for Canvas tokens
const TOKENS_FILE = path.join(__dirname, 'canvas-tokens.json');
const EVENTS_FILE = path.join(__dirname, 'events.json');
const OVERRIDES_FILE = path.join(__dirname, 'calendar-overrides.json');

// Load tokens from file
let canvasTokens = {};
let manualEvents = [];
let calendarOverrides = {
  completedEventIds: [],
  hiddenCourseNames: []
};
try {
  if (fs.existsSync(TOKENS_FILE)) {
    canvasTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  }
} catch (error) {
  console.error('Error loading canvas tokens:', error);
  canvasTokens = {};
}

try {
  if (fs.existsSync(EVENTS_FILE)) {
    manualEvents = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  }
} catch (error) {
  console.error('Error loading events:', error);
  manualEvents = [];
}

try {
  if (fs.existsSync(OVERRIDES_FILE)) {
    calendarOverrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
  }
} catch (error) {
  console.error('Error loading calendar overrides:', error);
  calendarOverrides = {
    completedEventIds: [],
    hiddenCourseNames: []
  };
}

// Save tokens to file
function saveTokens() {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(canvasTokens, null, 2));
  } catch (error) {
    console.error('Error saving canvas tokens:', error);
  }
}

function saveEvents() {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(manualEvents, null, 2));
  } catch (error) {
    console.error('Error saving events:', error);
  }
}

function normalizeCalendarOverrides(value = {}) {
  const completedEventIds = Array.isArray(value.completedEventIds)
    ? value.completedEventIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const hiddenCourseNames = Array.isArray(value.hiddenCourseNames)
    ? value.hiddenCourseNames.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    completedEventIds: Array.from(new Set(completedEventIds)),
    hiddenCourseNames: Array.from(new Set(hiddenCourseNames))
  };
}

function saveOverrides() {
  try {
    calendarOverrides = normalizeCalendarOverrides(calendarOverrides);
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(calendarOverrides, null, 2));
  } catch (error) {
    console.error('Error saving calendar overrides:', error);
  }
}

calendarOverrides = normalizeCalendarOverrides(calendarOverrides);

function isCourseHidden(courseName) {
  return Boolean(courseName) && calendarOverrides.hiddenCourseNames.includes(String(courseName).trim());
}

function isEventCompleted(eventId) {
  return calendarOverrides.completedEventIds.includes(String(eventId || '').trim());
}

function applyCalendarOverrides(events) {
  return (events || [])
    .filter((event) => !isCourseHidden(event.course))
    .map((event) => ({
      ...event,
      completed: isEventCompleted(event.id) || Boolean(event.completed),
    }));
}

function setEventCompleted(eventId, completed) {
  const eventKey = String(eventId || '').trim();
  if (!eventKey) {
    return;
  }

  if (completed) {
    if (!calendarOverrides.completedEventIds.includes(eventKey)) {
      calendarOverrides.completedEventIds.push(eventKey);
    }
  } else {
    calendarOverrides.completedEventIds = calendarOverrides.completedEventIds.filter((item) => item !== eventKey);
  }
  saveOverrides();
}

function setHiddenCourses(hiddenCourseNames) {
  calendarOverrides.hiddenCourseNames = Array.isArray(hiddenCourseNames) ? hiddenCourseNames : [];
  saveOverrides();
}

function escapeIcsText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsDate(dateString) {
  return new Date(dateString).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function getConnectedCanvasEvents() {
  const events = [];

  for (const [userId, userData] of Object.entries(canvasTokens)) {
    if (!userData || !userData.token) {
      continue;
    }

    try {
      const domain = userData.domain || 'tmcc.instructure.com';
      const baseUrl = `https://${domain}/api/v1`;
      const canvas = new CanvasService(userData.token, baseUrl);
      const accountEvents = await canvas.getCanvasEvents();
      events.push(...accountEvents.map((event) => ({ ...event, accountUser: userId })));
    } catch (error) {
      console.error(`Error building calendar feed for ${userId}:`, error.message);
    }
  }

  return events;
}

async function getAllCalendarEvents() {
  const canvasEvents = await getConnectedCanvasEvents();
  return applyCalendarOverrides([...manualEvents, ...canvasEvents]);
}

function getJarvisModelConfig() {
  const timeoutSecondsRaw = process.env.AI_LOCAL_LLM_TIMEOUT_SECONDS || process.env.AI_LOCAL_LLM_TIMEOUT || '240';
  const timeoutSeconds = Number.parseInt(timeoutSecondsRaw, 10);

  return {
    apiKey: (process.env.AI_LOCAL_LLM_API_KEY || 'EMPTY').trim() || 'EMPTY',
    apiBase: (process.env.AI_LOCAL_LLM_API_BASE || 'http://127.0.0.1:11434/v1').trim().replace(/\/$/, ''),
    model: (process.env.AI_LOCAL_LLM_MODEL || 'qwen3:32b').trim(),
    timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 240000,
  };
}

function extractResponseText(data) {
  if (!data || typeof data !== 'object') {
    return '';
  }
  const direct = data.choices?.[0]?.message?.content;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  if (Array.isArray(direct)) {
    const parts = direct
      .map((item) => (item && typeof item.text === 'string' ? item.text.trim() : ''))
      .filter(Boolean);
    if (parts.length) return parts.join('\n').trim();
  }
  return '';
}

async function askJarvisModel(message) {
  const config = getJarvisModelConfig();

  const allEvents = await getAllCalendarEvents();
  const upcomingEvents = allEvents
    .filter((event) => event.start && new Date(event.start).getTime() >= Date.now() - (24 * 60 * 60 * 1000))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 8)
    .map((event) => ({
      title: event.title,
      start: event.start,
      course: event.course || null,
      type: event.type || null,
    }));

  const connectedAccounts = Object.entries(canvasTokens)
    .filter(([, value]) => value && value.token)
    .map(([userId, value]) => ({
      userId,
      name: value.user?.name || null,
      domain: value.domain || null,
      connectedAt: value.connectedAt || null,
    }));

  const systemPrompt = [
    "You are Jarvis, Dylan's calendar-side AI assistant.",
    "You are embedded inside the Jarvis Calendar app.",
    "Answer naturally and briefly unless more depth is requested.",
    "Stay honest about capabilities.",
    "You can discuss general topics, but when the user asks about schedule, events, Canvas, deadlines, or the subscription feed, ground your answer in the runtime calendar context provided below.",
    "Do not claim to be a generic AI Calendar Assistant.",
    "If a request would require a calendar action that was not already handled locally, explain what is and isn't currently possible in this app.",
  ].join(' ');

  const context = {
    appName: 'Jarvis Calendar',
    subscriptionFeedUrl: `https://aicalander-dkbuhsfjh7gqe8ay.canadacentral-01.azurewebsites.net/api/calendar/feed/${FEED_TOKEN}`,
    connectedCanvasAccounts: connectedAccounts,
    upcomingEvents,
    totalEventsLoaded: allEvents.length,
    localManualEventCount: manualEvents.length,
  };

  const response = await axios.post(
    `${config.apiBase}/chat/completions`,
    {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\n\nCalendar runtime context:\n${JSON.stringify(context, null, 2)}`,
        },
        {
          role: 'user',
          content: String(message || ''),
        },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: config.timeoutMs,
    }
  );

  const text = extractResponseText(response.data);
  return text || null;
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Jarvis Calendar is running' });
});

app.get('/api/preferences', (req, res) => {
  res.json(normalizeCalendarOverrides(calendarOverrides));
});

app.put('/api/preferences', (req, res) => {
  const nextOverrides = normalizeCalendarOverrides({
    ...calendarOverrides,
    ...req.body
  });
  calendarOverrides = nextOverrides;
  saveOverrides();
  res.json({ success: true, overrides: nextOverrides });
});

// Events
app.get('/api/events', async (req, res) => {
  try {
    const events = await getAllCalendarEvents();
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', (req, res) => {
  const event = req.body;
  // Ensure the event has a proper string ID
  if (!event.id) {
    event.id = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  manualEvents.push(event);
  saveEvents();
  res.json({ success: true, event });
});

// Delete event endpoint
app.delete('/api/events/:id', (req, res) => {
  const eventId = req.params.id;
  manualEvents = manualEvents.filter((event) => event.id !== eventId);
  setEventCompleted(eventId, false);
  saveEvents();
  res.json({ success: true, deletedId: eventId });
});

app.patch('/api/events/:id/state', async (req, res) => {
  try {
    const eventId = req.params.id;
    const completed = Boolean(req.body?.completed);
    setEventCompleted(eventId, completed);
    const events = await getAllCalendarEvents();
    const updated = events.find((event) => String(event.id) === String(eventId)) || null;
    res.json({ success: true, eventId, completed, event: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI Scheduling endpoint
app.post('/api/ai/schedule', (req, res) => {
  const { courses, assignments, exams } = req.body;
  
  // Placeholder AI scheduling logic
  const schedule = {
    recommendations: [
      'Study for CS101 exam 2 weeks before',
      'Start Project 1 by April 5th',
      'Review Calculus notes weekly'
    ]
  };
  
  res.json(schedule);
});

// Canvas Integration Endpoints
app.post('/api/canvas/auth', async (req, res) => {
  try {
    const { token, username, domain } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Canvas API token required' });
    }

    const baseUrl = domain ? `https://${domain}/api/v1` : 'https://tmcc.instructure.com/api/v1';
    const canvas = new CanvasService(token, baseUrl);
    const verification = await canvas.verifyToken();

    if (!verification.valid) {
      return res.status(401).json({ error: 'Invalid Canvas token' });
    }

    // Store token persistently
    const userId = username || 'default';
    canvasTokens[userId] = { token, domain: domain || 'tmcc.instructure.com', user: verification.user, connectedAt: new Date().toISOString() };
    saveTokens();

    res.json({
      success: true,
      user: verification.user,
      message: 'Canvas authenticated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/canvas/courses', async (req, res) => {
  try {
    const userId = req.query.username || 'default';
    const userData = canvasTokens[userId];

    if (!userData || !userData.token) {
      return res.status(401).json({ error: 'Not authenticated with Canvas' });
    }

    const domain = userData.domain || 'tmcc.instructure.com';
    const baseUrl = `https://${domain}/api/v1`;
    const canvas = new CanvasService(userData.token, baseUrl);
    const courses = await canvas.getCourses();

    res.json({ courses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/canvas/assignments', async (req, res) => {
  try {
    const userId = req.query.username || 'default';
    const userData = canvasTokens[userId];

    if (!userData || !userData.token) {
      return res.status(401).json({ error: 'Not authenticated with Canvas' });
    }

    const domain = userData.domain || 'tmcc.instructure.com';
    const baseUrl = `https://${domain}/api/v1`;
    const canvas = new CanvasService(userData.token, baseUrl);
    const assignments = await canvas.getCanvasEvents();

    res.json({ assignments: applyCalendarOverrides(assignments) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/canvas/sync', async (req, res) => {
  try {
    const userId = req.query.username || 'default';
    const userData = canvasTokens[userId];

    if (!userData || !userData.token) {
      return res.status(401).json({ error: 'Not authenticated with Canvas' });
    }

    const domain = userData.domain || 'tmcc.instructure.com';
    const baseUrl = `https://${domain}/api/v1`;
    const canvas = new CanvasService(userData.token, baseUrl);
    const events = await canvas.getCanvasEvents();

    res.json({
      success: true,
      syncedEvents: events.length,
      events: applyCalendarOverrides(events)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calendar/subscription', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    feedUrl: `${baseUrl}/api/calendar/feed/${FEED_TOKEN}`
  });
});

app.get('/api/calendar/feed/:token', async (req, res) => {
  try {
    if (req.params.token !== FEED_TOKEN) {
      return res.status(403).send('Forbidden');
    }

    const events = await getAllCalendarEvents();
    const nowStamp = formatIcsDate(new Date().toISOString());
    const body = events.map((event) => {
      const descriptionParts = [];
      if (event.description) {
        descriptionParts.push(String(event.description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      if (event.url) {
        descriptionParts.push(`Canvas link: ${event.url}`);
      }

      return [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(event.id)}@ai-calendar-agent`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${formatIcsDate(event.start)}`,
        `DTEND:${formatIcsDate(event.end || event.start)}`,
        `SUMMARY:${escapeIcsText(event.completed ? `Completed: ${event.title}` : event.title)}`,
        event.course ? `CATEGORIES:${escapeIcsText(event.course)}` : '',
        event.completed ? 'X-JARVIS-COMPLETED:TRUE' : '',
        descriptionParts.length > 0 ? `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n\n'))}` : '',
        event.url ? `URL:${escapeIcsText(event.url)}` : '',
        'END:VEVENT'
      ].filter(Boolean).join('\r\n');
    }).join('\r\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Jarvis Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      body,
      'END:VCALENDAR'
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(ics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check Canvas connection status
app.get('/api/canvas/status', (req, res) => {
  try {
    const userId = req.query.username || 'default';
    const userData = canvasTokens[userId];

    if (userData && userData.token) {
      res.json({
        connected: true,
        user: userData.user,
        connectedAt: userData.connectedAt
      });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect Canvas
app.post('/api/canvas/disconnect', (req, res) => {
  try {
    const userId = req.query.username || 'default';
    delete canvasTokens[userId];
    saveTokens();

    res.json({ success: true, message: 'Canvas disconnected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (HAS_CLIENT_BUILD) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    return res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
  });
}

// Chat Bot Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await generateChatResponse(message);

    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function summarizeEvent(event) {
  const title = event.title || event.name || 'event';
  const when = event.start || event.dueDate || event.date || '';
  return when ? `${title} @ ${new Date(when).toLocaleString()}` : title;
}

function parseSimpleWhen(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const now = new Date();
  const lower = raw.toLowerCase();
  let base = new Date(now);

  if (lower.startsWith('tomorrow')) {
    base.setDate(base.getDate() + 1);
  } else if (lower.startsWith('today')) {
    // keep today
  } else {
    const weekdayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const weekdayMatch = lower.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (weekdayMatch) {
      const target = weekdayMap[weekdayMatch[1]];
      const delta = (target - base.getDay() + 7) % 7 || 7;
      base.setDate(base.getDate() + delta);
    } else {
      const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(?:at\s+)?(.+))?$/i);
      if (isoMatch) {
        const parsed = new Date(`${isoMatch[1]}T09:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
          base = parsed;
        }
      } else {
        return null;
      }
    }
  }

  const timeMatch = raw.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = 9;
  let minute = 0;
  if (timeMatch) {
    hour = Number.parseInt(timeMatch[1], 10);
    minute = Number.parseInt(timeMatch[2] || '0', 10);
    const meridiem = (timeMatch[3] || '').toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  base.setHours(hour, minute, 0, 0);
  return base;
}

function buildChatCalendarEvent(title, whenText) {
  const start = parseSimpleWhen(whenText);
  if (!start) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    type: 'manual',
  };
}

async function generateChatResponse(message) {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();

  if (!normalized) {
    return 'Tell me what you want to do with your calendar, and I will help.';
  }

  if (lowered.includes('subscription feed') || lowered.includes('feed url') || lowered.includes('calendar feed')) {
    return `Your subscription feed is ${'https://aicalander-dkbuhsfjh7gqe8ay.canadacentral-01.azurewebsites.net/api/calendar/feed/' + FEED_TOKEN}`;
  }

  if (lowered.includes('canvas status') || lowered.includes('is canvas connected')) {
    const defaultUser = canvasTokens.default;
    if (defaultUser && defaultUser.token) {
      return `Canvas is connected${defaultUser.user?.name ? ` for ${defaultUser.user.name}` : ''}.`;
    }
    return 'Canvas is not connected right now.';
  }

  if (lowered.includes('sync canvas') || lowered.includes('canvas sync')) {
    const defaultUser = canvasTokens.default;
    if (!defaultUser || !defaultUser.token) {
      return 'Canvas is not connected yet. Use Connect Canvas first, then I can sync assignments.';
    }
    try {
      const domain = defaultUser.domain || 'tmcc.instructure.com';
      const baseUrl = `https://${domain}/api/v1`;
      const canvas = new CanvasService(defaultUser.token, baseUrl);
      const events = await canvas.getCanvasEvents();
      return `Canvas sync is ready. I found ${events.length} Canvas event${events.length === 1 ? '' : 's'}.`;
    } catch (error) {
      return `Canvas sync failed: ${error.message}`;
    }
  }

  const deleteMatch = normalized.match(/^(?:delete|remove|cancel)\s+(?:my\s+)?(?:event\s+)?(?:called|named)?\s*"?(.+?)"?$/i);
  if (deleteMatch) {
    const query = deleteMatch[1].trim().toLowerCase();
    const target = manualEvents.find((event) => String(event.title || '').trim().toLowerCase() === query)
      || manualEvents.find((event) => String(event.title || '').trim().toLowerCase().includes(query));
    if (!target) {
      return `I couldn't find a manual event named ${deleteMatch[1].trim()}.`;
    }
    manualEvents = manualEvents.filter((event) => event.id !== target.id);
    saveEvents();
    return `Deleted ${target.title}.`;
  }

  const addMatchA = normalized.match(/^(?:add|create|schedule)\s+(?:an?\s+)?(?:calendar\s+)?event\s+(?:called|named)\s+"?(.+?)"?\s+(tomorrow(?:\s+at\s+.+)?|today(?:\s+at\s+.+)?|monday(?:\s+at\s+.+)?|tuesday(?:\s+at\s+.+)?|wednesday(?:\s+at\s+.+)?|thursday(?:\s+at\s+.+)?|friday(?:\s+at\s+.+)?|saturday(?:\s+at\s+.+)?|sunday(?:\s+at\s+.+)?|\d{4}-\d{2}-\d{2}(?:\s+(?:at\s+)?.+)?)$/i);
  const addMatchB = normalized.match(/^(?:add|create|schedule)\s+(?:an?\s+)?(?:calendar\s+)?event\s+(?:called|named)?\s*"?(.*?)"?\s+(?:for|on)\s+(.+)$/i);
  const addMatchC = normalized.match(/^(?:schedule|create|add)\s+(?:event\s+)?for\s+(.+?)\s+(?:called|named)\s+"?(.+?)"?$/i);
  let created = null;
  if (addMatchA) {
    created = buildChatCalendarEvent(addMatchA[1].trim(), addMatchA[2].trim());
  } else if (addMatchB) {
    created = buildChatCalendarEvent(addMatchB[1].trim(), addMatchB[2].trim());
  } else if (addMatchC) {
    created = buildChatCalendarEvent(addMatchC[2].trim(), addMatchC[1].trim());
  }
  if (created) {
    manualEvents.push(created);
    saveEvents();
    return `Added ${created.title} for ${new Date(created.start).toLocaleString()}.`;
  }

  if (
    lowered.includes('list my events')
    || lowered.includes('show my events')
    || lowered.includes('show my calendar')
    || lowered.includes('list my calendar')
    || lowered.includes('upcoming events')
    || lowered.includes('next events')
  ) {
    const events = await getAllCalendarEvents();
    const upcoming = events
      .filter((event) => event.start && new Date(event.start).getTime() >= Date.now() - (24 * 60 * 60 * 1000))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5);
    if (!upcoming.length) {
      return 'I checked your calendar and there are no upcoming events right now.';
    }
    return `Here are your next events:\n- ${upcoming.map(summarizeEvent).join('\n- ')}`;
  }

  try {
    const modelReply = await askJarvisModel(normalized);
    if (modelReply) {
      return modelReply;
    }
  } catch (error) {
    console.error('Jarvis model chat failed:', error.message);
  }

  // Calendar-related responses
  if (lowered.includes('schedule') || lowered.includes('calendar')) {
    return "I'm Jarvis, and I can help manage your calendar. I can add events, show your schedule, and offer scheduling recommendations. What would you like to do?";
  }

  if (lowered.includes('add') && (lowered.includes('event') || lowered.includes('class') || lowered.includes('assignment'))) {
    return "To add an event, use the 'Add Event' form on the left. You can set the title, type, and time. If you want, I can guide you through it.";
  }

  if (lowered.includes('canvas') || lowered.includes('sync')) {
    return "I can help you sync with Canvas. Click 'Connect Canvas' to link your TMCC account and automatically import assignments and courses.";
  }

  if (lowered.includes('ai') || lowered.includes('recommend') || lowered.includes('suggest')) {
    return "Use the Jarvis Scheduler button to get study recommendations based on your courses and assignments. I look at your workload and suggest practical study times.";
  }

  // Time-related responses
  if (lowered.includes('time') || lowered.includes('when') || lowered.includes('deadline')) {
    return "I can help you track deadlines. Your Canvas assignments sync with due dates, and the calendar view shows your upcoming events.";
  }

  // Study-related responses
  if (lowered.includes('study') || lowered.includes('exam') || lowered.includes('test')) {
    return "For exams and study sessions, I recommend using the Jarvis Scheduler. It can help you build a study plan around your course load and deadlines.";
  }

  // General responses
  if (lowered.includes('help') || lowered.includes('what can you do')) {
    return "I'm Jarvis. I can help with:\n• Adding and managing events\n• Canvas integration\n• Scheduling recommendations\n• Study planning\n• Deadline tracking\n\nWhat would you like help with?";
  }

  if (lowered.includes('hello') || lowered.includes('hi') || lowered.includes('hey')) {
    return "Hello. I'm Jarvis, and I'm here to help you stay organized with your schedule. How can I help?";
  }

  if (lowered.includes('thank') || lowered.includes('thanks')) {
    return "You're welcome. I'm here whenever you need help with your calendar or scheduling.";
  }

  // Default response
  return "I'm not sure I understand yet. Try asking about scheduling, Canvas integration, deadlines, or recommendations. You can also say 'help' to see what I can do.";
}

// AI Syllabus Scanning endpoint
app.post('/api/ai/syllabus-scan', async (req, res) => {
  try {
    const { courseId, username } = req.body;
    const userData = canvasTokens[username || 'default'];

    if (!userData || !userData.token) {
      return res.status(401).json({ error: 'Not authenticated with Canvas' });
    }

    const domain = userData.domain || 'tmcc.instructure.com';
    const baseUrl = `https://${domain}/api/v1`;
    const canvas = new CanvasService(userData.token, baseUrl);
    
    // Get course syllabus
    try {
      const syllabus = await canvas.getCourseSyllabus(courseId);
      
      // Basic AI analysis (in a real app, this would use OpenAI/Claude)
      const deadlines = extractDeadlinesFromSyllabus(syllabus);
      const detectedPlatforms = detectExternalPlatformsFromSyllabus(syllabus);

      let externalDeadlines = [];
      for (const platform of detectedPlatforms) {
        try {
          const ext = await fetchExternalDeadlinesForPlatform(platform, courseId);
          externalDeadlines = externalDeadlines.concat(ext);
        } catch (err) {
          console.error(`Failed pulling external deadlines from ${platform}:`, err.message);
        }
      }

      res.json({
        success: true,
        courseId,
        syllabus: syllabus,
        extractedDeadlines: deadlines,
        externalPlatforms: detectedPlatforms,
        externalDeadlines
      });
    } catch (error) {
      res.json({
        success: true,
        courseId,
        syllabus: null,
        extractedDeadlines: [],
        message: 'Could not access syllabus, but you can still sync calendar events'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add syllabus method to CanvasService
CanvasService.prototype.getCourseSyllabus = async function(courseId) {
  try {
    const response = await this.client.get(`/courses/${courseId}`, {
      params: { include: ['syllabus_body'] }
    });
    return response.data.syllabus_body || 'No syllabus available';
  } catch (error) {
    throw new Error(`Failed to fetch syllabus for course ${courseId}: ${error.message}`);
  }
};

// Basic deadline extraction (placeholder for AI)
function extractDeadlinesFromSyllabus(syllabus) {
  const deadlines = [];
  
  // Simple regex patterns for common deadline formats
  const patterns = [
    /(\w+ \d{1,2})(?:st|nd|rd|th)?\s*[-:]\s*([^,\n]+)/gi,
    /due\s+by\s+([^,\n]+)/gi,
    /deadline[:\s]+([^,\n]+)/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(syllabus)) !== null) {
      deadlines.push({
        description: match[1] || match[0],
        type: 'assignment',
        confidence: 0.7 // Placeholder confidence score
      });
    }
  });
  
  return deadlines;
}

function detectExternalPlatformsFromSyllabus(syllabus) {
  const platformKeys = ['pearson', 'mcgraw-hill', 'mcgrawhill', 'canvas', 'respondus'];
  const detected = [];
  const text = (syllabus || '').toLowerCase();

  for (const key of platformKeys) {
    if (text.includes(key)) {
      detected.push(key);
    }
  }

  return detected;
}

async function fetchExternalDeadlinesForPlatform(platform, courseId) {
  // Placeholder implementations. Replace with real API integration for Pearson/McGrawHill.
  // In production, this may require OAuth tokens/stored student credentials.

  if (platform === 'pearson') {
    // TODO: call Pearson API with courseId and return structured deadlines
    return [{
      platform: 'Pearson',
      source: 'pearson placeholder',
      description: `Future deadlines may be available from Pearson for course ${courseId}`,
      link: `https://www.pearson.com`
    }];
  }

  if (platform.includes('mcgraw')) {
    return [{
      platform: 'McGraw-Hill',
      source: 'mcgrawhill placeholder',
      description: `Future deadlines may be available from McGraw-Hill for course ${courseId}`,
      link: `https://www.mheducation.com`
    }];
  }

  // Return empty for unknown platforms
  return [];
}

app.listen(PORT, () => {
  console.log(`Jarvis Calendar running on port ${PORT}`);
});
