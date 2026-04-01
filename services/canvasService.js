const axios = require('axios');

class CanvasService {
  constructor(accessToken, baseUrl = 'https://tmcc.instructure.com/api/v1') {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  // Verify token by getting current user
  async verifyToken() {
    try {
      const response = await this.client.get('/users/self');
      return { valid: true, user: response.data };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Get all courses for current user
  async getCourses() {
    try {
      const response = await this.client.get('/courses', {
        params: {
          enrollment_state: 'active',
          include: ['term'],
          per_page: 100
        }
      });
      return response.data.filter(course => course.enrollment_term_id);
    } catch (error) {
      throw new Error(`Failed to fetch courses: ${error.message}`);
    }
  }

  // Get assignments for a specific course
  async getCourseAssignments(courseId) {
    try {
      const response = await this.client.get(`/courses/${courseId}/assignments`, {
        params: {
          per_page: 100,
          include: ['submission']
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch assignments for course ${courseId}: ${error.message}`);
    }
  }

  // Get all assignments across all courses (excluding prior semesters)
  async getAllAssignments() {
    try {
      const courses = await this.getCourses();
      const now = new Date();
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const currentYear = now.getFullYear();
      const currentShortYear = currentYear % 100;

      const parseCourseTermCode = (courseName = '') => {
        const match = courseName.match(/\b(Fa|Sp|Su|Sm|Wi)(\d{2})/i);
        if (!match) {
          return null;
        }

        const season = match[1].toLowerCase();
        const year = 2000 + parseInt(match[2], 10);
        const monthBySeason = {
          wi: 1,
          sp: 2,
          su: 6,
          sm: 6,
          fa: 8
        };

        return new Date(year, monthBySeason[season] ?? 0, 1);
      };

      // Filter to current and recently active semesters only.
      const activeCourses = courses.filter(course => {
        if (!course.enrollment_term_id) return false;

        const termStart = course.term?.start_at ? new Date(course.term.start_at) : null;
        const termEnd = course.term?.end_at ? new Date(course.term.end_at) : null;

        if (termEnd && !Number.isNaN(termEnd.getTime())) {
          return termEnd >= ninetyDaysAgo;
        }

        if (termStart && !Number.isNaN(termStart.getTime())) {
          return termStart.getFullYear() >= currentYear - 1;
        }

        const parsedTermDate = parseCourseTermCode(course.name);
        if (parsedTermDate) {
          return parsedTermDate >= new Date(currentYear - 1, 0, 1);
        }

        const explicitYear = course.name.match(/\b(20\d{2})\b/)?.[1];
        if (explicitYear) {
          return parseInt(explicitYear, 10) >= currentYear - 1;
        }

        const shortYearCode = course.name.match(/\b(?:Fa|Sp|Su|Sm|Wi)(\d{2})/i)?.[1];
        if (shortYearCode) {
          return parseInt(shortYearCode, 10) >= currentShortYear - 1;
        }

        return false;
      });
      
      const allAssignments = [];
      const courseErrors = [];

      for (const course of activeCourses) {
        try {
          const assignments = await this.getCourseAssignments(course.id);
          const assignmentsWithDueDates = assignments.filter((assignment) => assignment.due_at);

          const formattedAssignments = assignmentsWithDueDates.map(assignment => ({
            id: `canvas_${assignment.id}`,
            title: assignment.name,
            course: course.name,
            courseId: course.id,
            dueDate: assignment.due_at,
            type: 'assignment',
            url: assignment.html_url,
            description: assignment.description
          }));
          allAssignments.push(...formattedAssignments);
        } catch (err) {
          courseErrors.push(`${course.name}: ${err.message}`);
          console.error(`Error fetching assignments for course ${course.id}:`, err.message);
        }
      }

      if (activeCourses.length > 0 && allAssignments.length === 0 && courseErrors.length === activeCourses.length) {
        throw new Error(`All course assignment requests failed. ${courseErrors[0]}`);
      }

      return allAssignments;
    } catch (error) {
      throw new Error(`Failed to fetch all assignments: ${error.message}`);
    }
  }

  // Get calendar events (if available)
  async getCalendarEvents() {
    try {
      const response = await this.client.get('/calendar_events', {
        params: {
          type: 'event',
          per_page: 100
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch calendar events: ${error.message}`);
    }
  }

  // Convert Canvas data to calendar events
  async getCanvasEvents() {
    try {
      const assignments = await this.getAllAssignments();
      const events = assignments
        .filter(a => a.dueDate) // Only include assignments with due dates
        .map(assignment => ({
          id: assignment.id,
          title: assignment.title,
          start: new Date(assignment.dueDate).toISOString(),
          end: new Date(assignment.dueDate).toISOString(),
          type: 'assignment',
          course: assignment.course,
          url: assignment.url,
          canvasId: assignment.id,
          deadlineOnly: true,
          description: assignment.description || ''
        }));

      return events;
    } catch (error) {
      throw new Error(`Failed to convert Canvas events: ${error.message}`);
    }
  }
}

module.exports = CanvasService;
