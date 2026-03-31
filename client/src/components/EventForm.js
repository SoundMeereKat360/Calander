import React, { useState } from 'react';
import './EventForm.css';

const EventForm = ({ onAddEvent, loading, courses = [] }) => {
  const [formData, setFormData] = useState({
    title: '',
    start: '',
    end: '',
    type: 'class',
    course: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.title && formData.start && formData.end) {
      const payload = {
        title: formData.title,
        start: formData.start,
        end: formData.end,
        type: formData.type,
        course: formData.course || undefined
      };

      onAddEvent(payload);
      setFormData({ title: '', start: '', end: '', type: 'class', course: '' });
    }
  };

  return (
    <div className="event-form-container">
      <h2>Add Event</h2>
      <form onSubmit={handleSubmit} className="event-form">
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="e.g., CS101 Lecture"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="course">Assign to Class</label>
          <select
            id="course"
            name="course"
            value={formData.course}
            onChange={handleChange}
          >
            <option value="">No class</option>
            {courses.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
          >
            <option value="class">Class</option>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="study">Study Session</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="start">Start Time</label>
          <input
            type="datetime-local"
            id="start"
            name="start"
            value={formData.start}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="end">End Time</label>
          <input
            type="datetime-local"
            id="end"
            name="end"
            value={formData.end}
            onChange={handleChange}
            required
          />
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Adding...' : 'Add Event'}
        </button>
      </form>
    </div>
  );
};

export default EventForm;
