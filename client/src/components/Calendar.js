import React, { useMemo, useState } from 'react';
import './Calendar.css';

const sanitizeCanvasHtml = (html) => {
  if (!html) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());

  doc.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';

      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
      }

      const normalizedValue = value.trim().toLowerCase();
      if ((name === 'href' || name === 'src') && normalizedValue.startsWith(`java${'script:'}`)) {
        node.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
};

const extractPlainText = (html) => {
  if (!html) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return (doc.body.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractStructuredSegments = (html) => {
  if (!html) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = [];
  let activeHeading = '';

  doc.body.querySelectorAll('*').forEach((node) => {
    const tag = node.tagName.toLowerCase();
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();

    if (!text || text.length < 8) {
      return;
    }

    if (/^h[1-4]$/.test(tag)) {
      activeHeading = text;
      items.push({ text, heading: text, tag });
      return;
    }

    if (['li', 'p'].includes(tag)) {
      items.push({ text, heading: activeHeading, tag });
    }
  });

  return items;
};

const buildAssignmentSummary = (event) => {
  const text = extractPlainText(event?.description || '');
  const structuredSegments = extractStructuredSegments(event?.description || '');
  const sentenceSegments = text
    .split(/(?<=[.!?])\s+|\s*[•-]\s+|\s*\d+\.\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const segments = [
    ...structuredSegments,
    ...sentenceSegments.map((item) => ({ text: item, heading: '', tag: 'sentence' }))
  ];

  const preferredKeywords = [
    'submit',
    'complete',
    'write',
    'upload',
    'read',
    'watch',
    'respond',
    'discussion',
    'quiz',
    'exam',
    'project',
    'paper',
    'assignment',
    'due',
    'attach',
    'post',
    'reply',
    'record',
    'worksheet',
    'essay',
    'instructions',
    'requirements',
    'steps'
  ];
  const weakKeywords = [
    'welcome',
    'overview',
    'introduction',
    'module',
    'week',
    'course'
  ];

  const ranked = [...segments].sort((a, b) => {
    const score = (value) => {
      const lower = value.text.toLowerCase();
      const heading = (value.heading || '').toLowerCase();
      const keywordHits = preferredKeywords.filter((word) => lower.includes(word)).length;
      const weakHits = weakKeywords.filter((word) => lower.includes(word)).length;
      const listLikeBonus = value.tag === 'li' ? 3 : /^(\d+[).]|[-*•])/.test(value.text) ? 2 : 0;
      const submitBonus = /(submit|upload|reply|post|attach|complete)/.test(lower) ? 4 : 0;
      const headingBonus = /(instruction|requirement|submit|task|steps|checklist|what to do)/.test(heading) ? 5 : 0;
      const headingPenalty = /(overview|welcome|introduction|summary|module)/.test(heading) ? 3 : 0;
      const lengthScore = value.text.length > 240 ? -2 : value.text.length > 150 ? 0 : 1;
      return keywordHits * 3 + listLikeBonus + submitBonus + headingBonus + lengthScore - weakHits * 2 - headingPenalty;
    };
    return score(b) - score(a);
  });

  const summaryPoints = [];

  if (event?.deadlineOnly || event?.id?.startsWith('canvas_')) {
    summaryPoints.push(`Due ${new Date(event.start).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`);
  }

  ranked.forEach((item) => {
    if (summaryPoints.length >= 4) {
      return;
    }

    const cleaned = item.text
      .replace(/\s+/g, ' ')
      .replace(/^(\d+[).]|[-*•])\s*/, '')
      .trim();
    if (cleaned.length < 12) {
      return;
    }

    if (/^(welcome|overview|introduction)\b/i.test(cleaned)) {
      return;
    }

    const normalized = cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
    if (!summaryPoints.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      summaryPoints.push(normalized);
    }
  });

  if (summaryPoints.length === 0) {
    summaryPoints.push('Review the Canvas assignment details and complete the required submission steps.');
  }

  return summaryPoints.slice(0, 4);
};

const getCourseTag = (courseName, fallbackType) => {
  if (!courseName) {
    return fallbackType;
  }

  if (courseName.includes(' - ')) {
    return courseName.split(' - ')[0].trim();
  }

  const match = courseName.match(/[A-Z]{2,4}\d{3}/);
  return match ? match[0] : courseName;
};

const Calendar = ({ events, onDeleteEvent, onToggleComplete, sortMode = 'date', courseColors = {} }) => {
  const [expandedDays, setExpandedDays] = useState({});
  const [selectedEvent, setSelectedEvent] = useState(null);

  const toggleDay = (dayKey) => {
    setExpandedDays((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatEventTime = (event) => {
    if (event.deadlineOnly || event.id.startsWith('canvas_')) {
      return `Due ${formatDate(event.start)}`;
    }
    return `${formatDate(event.start)} - ${formatDate(event.end)}`;
  };

  const canOpenDetails = (event) => Boolean(event.description || event.url);

  const sanitizedDescription = useMemo(
    () => sanitizeCanvasHtml(selectedEvent?.description || ''),
    [selectedEvent]
  );
  const assignmentSummary = useMemo(
    () => buildAssignmentSummary(selectedEvent),
    [selectedEvent]
  );

  const handleDelete = async (eventId) => {
    if (eventId.startsWith('canvas_')) {
      alert('Canvas events cannot be deleted from here. Please manage them in Canvas directly.');
      return;
    }

    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        const response = await fetch(`/api/events/${eventId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          onDeleteEvent(eventId);
        } else {
          alert('Failed to delete event');
        }
      } catch (error) {
        console.error('Error deleting event:', error);
        alert('Error deleting event');
      }
    }
  };

  const sortedEvents = [...events].sort((a, b) => {
    if (sortMode === 'class') {
      const classA = (a.course || '').toLowerCase();
      const classB = (b.course || '').toLowerCase();
      if (classA !== classB) return classA.localeCompare(classB);
      return new Date(a.start) - new Date(b.start);
    }
    return new Date(a.start) - new Date(b.start);
  });

  const groupedByDay = sortedEvents.reduce((acc, event) => {
    const date = new Date(event.start);
    const dayKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(event);
    return acc;
  }, {});

  const dayKeys = Object.keys(groupedByDay);

  return (
    <>
      <div className="calendar-container">
        <h2>Your Calendar</h2>

        {events.length === 0 ? (
          <p className="no-events">No events scheduled. Create one to get started!</p>
        ) : (
          <div className="days-grid">
            {dayKeys.map((day) => {
              const dayDate = new Date(groupedByDay[day][0].start);
              const isOpen = expandedDays[day] !== false;

              return (
                <div key={day} className="day-panel">
                  <div className="day-panel-header">
                    <h3>{dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
                    <button className="toggle-events-btn" onClick={() => toggleDay(day)}>
                      {isOpen ? 'Hide' : 'Show'} assignments ({groupedByDay[day].length})
                    </button>
                  </div>

                  {isOpen && (
                    <div className="day-events">
                      {groupedByDay[day].map((event) => (
                        <div
                          key={event.id}
                          className={`event-card event-${event.type} ${event.completed ? 'completed' : ''} ${canOpenDetails(event) ? 'event-clickable' : ''}`}
                          style={{ borderLeftColor: courseColors[event.course] || '#667eea' }}
                          onClick={() => {
                            if (canOpenDetails(event)) {
                              setSelectedEvent(event);
                            }
                          }}
                          role={canOpenDetails(event) ? 'button' : undefined}
                          tabIndex={canOpenDetails(event) ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (canOpenDetails(event) && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              setSelectedEvent(event);
                            }
                          }}
                        >
                          <div className="event-header">
                            <div className="event-title">{event.title}</div>
                            <div className="event-actions" onClick={(e) => e.stopPropagation()}>
                              <label className="complete-checkbox">
                                <input
                                  type="checkbox"
                                  checked={event.completed || false}
                                  onChange={() => onToggleComplete(event.id)}
                                />
                                <span className="checkmark"></span>
                              </label>
                              <button
                                onClick={() => handleDelete(event.id)}
                                className={`delete-btn ${event.id.startsWith('canvas_') ? 'canvas-event' : ''}`}
                                title={event.id.startsWith('canvas_') ? 'Canvas events cannot be deleted' : 'Delete event'}
                                disabled={event.id.startsWith('canvas_')}
                              >
                                x
                              </button>
                            </div>
                          </div>
                          <div className="event-time">
                            {formatEventTime(event)}
                          </div>
                          <div className="event-footer">
                            <span className="event-badge" style={{ background: courseColors[event.course] || '#667eea' }}>
                              {getCourseTag(event.course, event.type)}
                            </span>
                            {canOpenDetails(event) && <span className="event-detail-hint">View details</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="event-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="event-modal" onClick={(e) => e.stopPropagation()}>
            <div className="event-modal-header">
              <div>
                <h3>{selectedEvent.title}</h3>
                <p>{formatEventTime(selectedEvent)}</p>
              </div>
              <button className="event-modal-close" onClick={() => setSelectedEvent(null)}>
                x
              </button>
            </div>

            {selectedEvent.course && (
              <div className="event-modal-course">{selectedEvent.course}</div>
            )}

            <div className="event-summary-box">
              <div className="event-summary-title">AI Summary</div>
              <ul className="event-summary-list">
                {assignmentSummary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="event-modal-body">
              {sanitizedDescription ? (
                <div
                  className="canvas-description"
                  dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                />
              ) : (
                <p className="event-modal-empty">No additional assignment details were provided by Canvas.</p>
              )}
            </div>

            {selectedEvent.url && (
              <a
                className="event-modal-link"
                href={selectedEvent.url}
                target="_blank"
                rel="noreferrer"
              >
                Open in Canvas
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Calendar;
