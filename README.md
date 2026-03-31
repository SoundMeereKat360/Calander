# AI Calendar Agent 📅

An intelligent calendar application for college students that helps manage classes, assignments, exams, and study schedules with AI-powered recommendations.

## Features

- ✅ **Event Management** - Add classes, assignments, exams, and study sessions
- 🤖 **AI Scheduler** - Get smart scheduling recommendations based on your workload
- � **AI Chat Assistant** - Interactive chatbot for calendar help and guidance
- 🎓 **Canvas Integration** - Sync with TMCC Canvas for automatic assignment import- 💾 **Persistent Connections** - Canvas authentication remembered between sessions- �📱 **Responsive Design** - Works on desktop and mobile devices
- 💫 **Modern UI** - Beautiful gradient design with smooth animations
- ⚡ **Real-time Updates** - Instant event creation and calendar refresh

## ⚠️ Security Note

**For Personal Use Only:** This application contains a Canvas API token in the code for convenience. In production applications, API keys should never be stored in code. Use environment variables and proper secret management instead.

**Important:** Make sure your `.env` file is in `.gitignore` and never commit API keys to version control.

## Getting Started

**Frontend:**
- React 18
- CSS3 with gradients and animations
- Axios for API calls

**Backend:**
- Node.js + Express.js
- CORS enabled for local development
- RESTful API architecture

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm (v6+)

### Installation

1. Clone or navigate to the project:
```bash
cd "AI Calender"
```

2. Install dependencies:
```bash
npm run install-all
```

This will install both backend and frontend dependencies.

### Canvas Integration Setup

1. **API Token**: Your Canvas API token is pre-filled in the application for convenience
2. **Username**: Enter your TMCC Canvas username/email when connecting
3. **Connect**: Click "Connect Canvas" to authenticate
4. **Sync**: Use "Sync Assignments" to import your assignments
5. **AI Scan**: Use "Scan Syllabus" on individual courses to extract deadlines

### Manual Token Setup (if needed)

If you need to use a different token:
1. Go to Canvas Settings → Approved Integrations
2. Generate a new access token
3. Replace the token in the Canvas Settings form

### Running the Application

**Option 1: Run both simultaneously (from root)**
```bash
npm run dev
npm run client
```

**Option 2: Run separately**

Backend (from root):
```bash
npm start
```

Frontend (from client folder):
```bash
cd client
npm start
```

The app will be available at `http://localhost:3000`
Backend API runs on `http://localhost:5000`

## Azure App Service Deployment

To use the iPhone subscription calendar, the backend must be reachable from the internet. Azure App Service is a good fit for this project.

### Recommended Setup

1. Create an Azure App Service for Node.js
2. Deploy this repository
3. Use this build command:
```bash
npm install && npm run build:azure
```
4. Use this startup command:
```bash
npm start
```

### Required Environment Variables

Set these in Azure App Service:

```bash
NODE_ENV=production
CALENDAR_FEED_TOKEN=your-long-random-secret-token
```

### Subscription Feed URL

After deployment, your iPhone subscription URL will look like:

```text
https://your-app-name.azurewebsites.net/api/calendar/feed/your-long-random-secret-token
```

Add it on iPhone with:

1. Calendar
2. Calendars
3. Add Calendar
4. Add Subscription Calendar

### Persistence Warning

Manual events and Canvas tokens are currently stored in:

- `events.json`
- `canvas-tokens.json`

That is okay for development, but not ideal for long-term Azure hosting. For reliable persistence later, move them to a real datastore like Azure Blob Storage, Cosmos DB, or another hosted database.

## Project Structure

```
AI Calender/
├── server.js                 # Express backend server
├── package.json             # Backend dependencies
├── .env                     # Environment variables
└── client/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.js
    │   ├── App.css
    │   ├── index.js
    │   ├── index.css
    │   └── components/
    │       ├── Calendar.js      # Display events
    │       ├── Calendar.css
    │       ├── EventForm.js     # Add new events
    │       ├── EventForm.css
    │       ├── AIScheduler.js   # AI recommendations
    │       └── AIScheduler.css
    └── package.json         # Frontend dependencies
```

## API Endpoints

### GET `/api/health`
Check if the server is running

### GET `/api/events`
Fetch all events

### DELETE `/api/events/:id`
Delete an event by ID
```json
// Success response
{
  "success": true,
  "deletedId": "manual_1234567890_abc123def"
}
```

### POST `/api/ai/syllabus-scan`
Scan course syllabus for deadlines using AI
```json
{
  "courseId": "12345",
  "username": "student"
}
```
Response:
```json
{
  "success": true,
  "courseId": "12345",
  "syllabus": "...syllabus content...",
  "extractedDeadlines": [
    {
      "description": "Final Project",
      "type": "assignment",
      "confidence": 0.7
    }
  ]
}
```

### GET `/api/canvas/status`
Check Canvas connection status
Response:
```json
{
  "connected": true,
  "user": { "name": "John Doe", "email": "john@tmcc.edu" },
  "connectedAt": "2026-03-30T19:40:00.000Z"
}
```

### POST `/api/canvas/disconnect`
Disconnect from Canvas and clear stored token
Response:
```json
{
  "success": true,
  "message": "Canvas disconnected successfully"
}
```

## Event Types

- **class** - Regular class sessions
- **assignment** - Homework and assignments
- **exam** - Tests and exams
- **study** - Study sessions

## Future Enhancements

- 📧 Email notifications for upcoming events
- 🔗 Google Calendar integration
- 💾 Persistent database (MongoDB/PostgreSQL)
- 📊 Grade tracking and GPA calculator
- 🎓 Course planning tools
- 🤖 Advanced AI features with OpenAI/Claude API

## License

MIT

---

**Happy studying! 🚀**
