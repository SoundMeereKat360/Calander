import React, { useState } from 'react';
import './AIScheduler.css';

const AIScheduler = () => {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const handleAISchedule = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courses: ['CS101', 'MATH201', 'ENG102'],
          assignments: ['Project 1', 'Essay', 'Problem Set'],
          exams: ['Midterm CS101', 'Final MATH201']
        })
      });
      const data = await response.json();
      setSuggestions(data.recommendations);
    } catch (error) {
      console.error('Error getting AI recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-scheduler-container">
      <h2>🤖 Jarvis Scheduler</h2>
      <button onClick={handleAISchedule} disabled={loading} className="ai-btn">
        {loading ? 'Analyzing...' : 'Ask Jarvis for a Schedule'}
      </button>
      
      {suggestions.length > 0 && (
        <div className="suggestions">
          <h3>📋 Jarvis Recommendations:</h3>
          <ul>
            {suggestions.map((suggestion, idx) => (
              <li key={idx}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AIScheduler;
