const express = require('express');
const cors = require('cors');
require('dotenv').config();
const CanvasService = require('./services/canvasService');
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
const CANVAS_EVENTS_FILE = path.join(__dirname, 'canvas-events.json');

// Load tokens from file
let canvasTokens = {};
let manualEvents = [];
let syncedCanvasEvents = {};
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
  if (fs.existsSync(CANVAS_EVENTS_FILE)) {
    syncedCanvasEvents = JSON.parse(fs.readFileSync(CANVAS_EVENTS_FILE, 'utf8'));
  }
} catch (error) {
  console.error('Error loading synced Canvas events:', error);
  syncedCanvasEvents = {};
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

function saveCanvasEvents() {
  try {
    fs.writeFileSync(CANVAS_EVENTS_FILE, JSON.stringify(syncedCanvasEvents, null, 2));
  } catch (error) {
    console.error('Error saving synced Canvas events:', error);
  }
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

function foldIcsLine(line = '') {
  const maxLength = 74;
  if (line.length <= maxLength) {
    return line;
  }

  const chunks = [];
  for (let index = 0; index < line.length; index += maxLength) {
    chunks.push(index === 0 ? line.slice(index, index + maxLength) : ` ${line.slice(index, index + maxLength)}`);
  }

  return chunks.join('\r\n');
}

function getConnectedCanvasEvents() {
  return Object.entries(syncedCanvasEvents).flatMap(([userId, events]) =>
    (Array.isArray(events) ? events : []).map((event) => ({ ...event, accountUser: userId }))
  );
}

async function getAllCalendarEvents() {
  const canvasEvents = getConnectedCanvasEvents();
  return [...manualEvents, ...canvasEvents];
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'AI Calendar Agent is running' });
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
  saveEvents();
  res.json({ success: true, deletedId: eventId });
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

    res.json({ assignments });
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
    syncedCanvasEvents[userId] = events;
    saveCanvasEvents();

    res.json({
      success: true,
      syncedEvents: events.length,
      events
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

      const lines = [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(event.id)}@ai-calendar-agent`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${formatIcsDate(event.start)}`,
        `SUMMARY:${escapeIcsText(event.title)}`,
        event.course ? `CATEGORIES:${escapeIcsText(event.course)}` : '',
        descriptionParts.length > 0 ? `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n\n'))}` : '',
        event.url ? `URL:${escapeIcsText(event.url)}` : '',
        'END:VEVENT'
      ];

      if (event.end && event.end !== event.start) {
        lines.splice(4, 0, `DTEND:${formatIcsDate(event.end)}`);
      }

      return lines.filter(Boolean).map(foldIcsLine).join('\r\n');
    }).join('\r\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AI Calendar Agent//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:AI Calendar Agent',
      'X-WR-TIMEZONE:UTC',
      'X-PUBLISHED-TTL:PT6H',
      body,
      'END:VCALENDAR'
    ].map(foldIcsLine).join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="ai-calendar-agent.ics"');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
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
    delete syncedCanvasEvents[userId];
    saveTokens();
    saveCanvasEvents();

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

    // Simple AI responses based on keywords
    const response = generateChatResponse(message.toLowerCase());

    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simple AI response generator
function generateChatResponse(message) {
  // Calendar-related responses
  if (message.includes('schedule') || message.includes('calendar')) {
    return "I can help you manage your calendar! You can add events, view your schedule, and get AI-powered recommendations. What would you like to do?";
  }

  if (message.includes('add') && (message.includes('event') || message.includes('class') || message.includes('assignment'))) {
    return "To add an event, use the 'Add Event' form on the left. You can specify the title, type, and time. Would you like me to guide you through it?";
  }

  if (message.includes('canvas') || message.includes('sync')) {
    return "I can help you sync with Canvas! Click 'Connect Canvas' to link your TMCC account and automatically import your assignments and courses.";
  }

  if (message.includes('ai') || message.includes('recommend') || message.includes('suggest')) {
    return "Click the 'Get Smart Schedule' button to get AI-powered study recommendations based on your courses and assignments. I analyze your workload and suggest optimal study times!";
  }

  // Time-related responses
  if (message.includes('time') || message.includes('when') || message.includes('deadline')) {
    return "I can help you track deadlines! Your Canvas assignments are automatically synced with due dates. Check the calendar view to see all your upcoming events.";
  }

  // Study-related responses
  if (message.includes('study') || message.includes('exam') || message.includes('test')) {
    return "For exams and study sessions, I recommend using the AI Scheduler. It can help you create optimal study plans based on your course load and deadlines.";
  }

  // General responses
  if (message.includes('help') || message.includes('what can you do')) {
    return "I'm your AI Calendar Assistant! I can help with:\n• Adding and managing events\n• Canvas integration\n• AI-powered scheduling\n• Study recommendations\n• Deadline tracking\n\nWhat would you like to know more about?";
  }

  if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
    return "Hello! 👋 I'm here to help you stay organized with your college schedule. How can I assist you today?";
  }

  if (message.includes('thank') || message.includes('thanks')) {
    return "You're welcome! 😊 I'm here whenever you need help with your calendar or scheduling.";
  }

  // Default response
  return "I'm not sure I understand. Try asking about scheduling, Canvas integration, or AI recommendations. You can also say 'help' to see what I can do!";
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
  console.log(`AI Calendar Agent running on port ${PORT}`);
});
