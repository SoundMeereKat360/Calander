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
      timeout: 10000
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
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth();
      
      // Filter to current and future semesters only
      const activeCourses = courses.filter(course => {
        if (!course.enrollment_term_id) return false;
        
        // For now, include courses from current year and recent past
        // In a real implementation, you'd check the term dates
        const courseYear = course.name.match(/\b(20\d{2})\b/)?.[1];
        if (courseYear) {
          const year = parseInt(courseYear);
          // Include current year and one year back
          return year >= currentYear - 1;
        }
        
        // If no year found in course name, include it
        return true;
      });
      
      const allAssignments = [];

      for (const course of activeCourses) {
        try {
          const assignments = await this.getCourseAssignments(course.id);
          const futureAssignments = assignments.filter(assignment => {
            // Only include assignments that are due in the future or recently past
            if (!assignment.due_at) return false;
            const dueDate = new Date(assignment.due_at);
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            return dueDate >= oneWeekAgo;
          });
          
          const formattedAssignments = futureAssignments.map(assignment => ({
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
          console.error(`Error fetching assignments for course ${course.id}:`, err.message);
        }
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
