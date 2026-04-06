import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './CanvasSettings.css';

const HIDDEN_COURSES_STORAGE_KEY = 'jarvis-calendar.hidden-courses';

const loadHiddenCourseNames = () => {
  try {
    const stored = window.localStorage.getItem(HIDDEN_COURSES_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
  } catch (error) {
    console.error('Error loading hidden courses from storage:', error);
    return [];
  }
};

const ACCOUNTS = [
  {
    key: 'tmcc',
    label: 'TMCC',
    domain: 'tmcc.instructure.com',
    token: '1089~EyH9zE7FUQAPmt3F4Nuer8ffZB2JBE4nJR92WXBam8fZBLyB9EMxKL2PKDTNH2we',
    primary: true
  },
  {
    key: 'wcsd',
    label: 'WCSD',
    domain: 'washoe.instructure.com',
    token: '21301~3DLyJGr6zx2MX3eY3B6GNveRZ6WPwB8UKErtr8wTmw8nLKyrHakG9fnMkQvBQynH',
    primary: false
  }
];

const defaultStatus = () => ({
  auth: 'idle',
  courses: 'idle',
  sync: 'idle',
  authError: '',
  coursesError: '',
  syncError: '',
  user: null
});

const API_BASE = `${window.location.protocol}//${window.location.hostname}:5000`;

const CanvasSettings = ({
  onSyncAssignments,
  onCoursesLoaded,
  courseColors,
  onCourseColorChange,
  onPrimaryUserChange,
  onPreferencesChanged
}) => {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [showAllCourses, setShowAllCourses] = useState(false);
  const [showTmccCourses, setShowTmccCourses] = useState(true);
  const [showHiddenCourses, setShowHiddenCourses] = useState(false);
  const [courses, setCourses] = useState([]);
  const [hiddenCourseNames, setHiddenCourseNames] = useState(() => loadHiddenCourseNames());
  const [courseActionsOpen, setCourseActionsOpen] = useState('');
  const refreshInFlightRef = useRef(false);
  const [accountStatus, setAccountStatus] = useState(() => (
    ACCOUNTS.reduce((acc, account) => {
      acc[account.key] = defaultStatus();
      return acc;
    }, {})
  ));

  const visibleCourses = useMemo(
    () => courses.filter((course) => {
      if (!showTmccCourses && course.source === 'tmcc') {
        return false;
      }
      return !hiddenCourseNames.includes(course.name);
    }),
    [courses, hiddenCourseNames, showTmccCourses]
  );
  const hiddenCourses = useMemo(
    () => {
      const seen = new Set();
      return courses.filter((course) => {
        if (!hiddenCourseNames.includes(course.name) || seen.has(course.name)) {
          return false;
        }
        seen.add(course.name);
        return true;
      });
    },
    [courses, hiddenCourseNames]
  );

  const displayedCourses = showAllCourses ? visibleCourses : visibleCourses.slice(0, 8);
  const primaryAccount = ACCOUNTS.find((account) => account.primary) || ACCOUNTS[0];
  const primaryStatus = accountStatus[primaryAccount.key];
  const connectedAccounts = ACCOUNTS.filter((account) => accountStatus[account.key]?.auth === 'success');
  const connectedCount = connectedAccounts.length;
  const updateAccountStatus = (accountKey, patch) => {
    setAccountStatus((prev) => ({
      ...prev,
      [accountKey]: {
        ...prev[accountKey],
        ...patch
      }
    }));
  };

  const resetAccountStates = () => {
    setAccountStatus(
      ACCOUNTS.reduce((acc, account) => {
        acc[account.key] = defaultStatus();
        return acc;
      }, {})
    );
  };

  const requestJson = useCallback(async (url, options = {}, fallbackMessage = 'Request failed') => {
    const response = await fetch(url, options);
    const text = await response.text();

    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new Error('Backend unavailable or returned invalid JSON');
    }

    if (!response.ok) {
      throw new Error(data.error || fallbackMessage);
    }

    return data;
  }, []);

  const connectAccounts = useCallback(async () => {
    const connected = [];

    for (const account of ACCOUNTS) {
      updateAccountStatus(account.key, {
        auth: 'loading',
        authError: '',
        user: null
      });

      try {
        const data = await requestJson(`${API_BASE}/api/canvas/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: account.token,
            username: account.key,
            domain: account.domain
          })
        }, 'connection failed');

        connected.push(account);
        updateAccountStatus(account.key, {
          auth: 'success',
          authError: '',
          user: data.user
        });
      } catch (err) {
        updateAccountStatus(account.key, {
          auth: 'error',
          authError: err.message
        });
      }
    }

    return connected;
  }, [requestJson]);

  const loadCourses = useCallback(async (accounts) => {
    const allCourses = [];

    for (const account of accounts) {
      updateAccountStatus(account.key, {
        courses: 'loading',
        coursesError: ''
      });

      try {
        const data = await requestJson(
          `${API_BASE}/api/canvas/courses?username=${account.key}`,
          { method: 'GET' },
          'Failed to load courses'
        );

        const taggedCourses = (data.courses || []).map((course) => ({
          ...course,
          source: account.key,
          sourceLabel: account.label
        }));

        allCourses.push(...taggedCourses);
        updateAccountStatus(account.key, {
          courses: 'success',
          coursesError: ''
        });
      } catch (err) {
        updateAccountStatus(account.key, {
          courses: 'error',
          coursesError: err.message
        });
      }
    }

    setCourses(allCourses);
    return allCourses;
  }, [requestJson]);

  const syncAssignments = useCallback(async (accounts = connectedAccounts) => {
    const allEvents = [];

    for (const account of accounts) {
      updateAccountStatus(account.key, {
        sync: 'loading',
        syncError: ''
      });

      try {
        const data = await requestJson(`${API_BASE}/api/canvas/sync?username=${account.key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, 'sync failed');

        const taggedEvents = (data.events || []).map((event) => ({
          ...event,
          account: account.key,
          accountLabel: account.label
        }));

        allEvents.push(...taggedEvents);
        updateAccountStatus(account.key, {
          sync: 'success',
          syncError: ''
        });
      } catch (err) {
        updateAccountStatus(account.key, {
          sync: 'error',
          syncError: err.message
        });
      }
    }

    onSyncAssignments?.(allEvents);
    setLastSync(new Date());
  }, [connectedAccounts, onSyncAssignments, requestJson]);

  const autoConnectAndSync = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    setLoading(true);
    try {
      resetAccountStates();
      const connected = await connectAccounts();
      if (connected.length === 0) {
        setCourses([]);
        return;
      }

      const loadedCourses = await loadCourses(connected);
      if (loadedCourses.length > 0) {
        onCoursesLoaded?.(loadedCourses);
      }

      await syncAssignments(connected);
    } finally {
      refreshInFlightRef.current = false;
      setLoading(false);
    }
  }, [connectAccounts, loadCourses, onCoursesLoaded, syncAssignments]);

  useEffect(() => {
    autoConnectAndSync();
  }, [autoConnectAndSync]);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/preferences`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (Array.isArray(data.hiddenCourseNames)) {
          setHiddenCourseNames(data.hiddenCourseNames);
        }
      } catch (error) {
        console.error('Error loading calendar preferences:', error);
      }
    };

    loadPreferences();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_COURSES_STORAGE_KEY, JSON.stringify(hiddenCourseNames));
    } catch (error) {
      console.error('Error saving hidden courses to storage:', error);
    }

    const syncPreferences = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenCourseNames })
        });
        if (response.ok) {
          onPreferencesChanged?.();
        }
      } catch (syncError) {
        console.error('Error syncing hidden courses to server:', syncError);
      }
    };

    syncPreferences();
  }, [hiddenCourseNames, onPreferencesChanged]);

  const handleSync = async () => {
    await autoConnectAndSync();
  };

  const scanSyllabusInternal = async (courseId, courseName, username) => {
    const data = await requestJson(`${API_BASE}/api/ai/syllabus-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, username })
    }, `Failed to scan syllabus for ${courseName}`);
    return data;
  };

  const scanSyllabus = async (course) => {
    setScanning(true);
    try {
      const result = await scanSyllabusInternal(course.id, course.name, course.source);
      if (result.extractedDeadlines && result.extractedDeadlines.length > 0) {
        alert(`Found ${result.extractedDeadlines.length} potential deadlines in ${course.name}.`);
      } else {
        alert(`Syllabus scanned for ${course.name}, but no specific deadlines were found.`);
      }
    } catch (err) {
      alert(`Error scanning syllabus: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const scanAllSyllabi = async () => {
    if (visibleCourses.length === 0) {
      alert('No visible courses available to scan.');
      return;
    }

    setScanning(true);
    let successCount = 0;
    const failedCourses = [];

    for (const course of visibleCourses) {
      try {
        await scanSyllabusInternal(course.id, course.name, course.source);
        successCount += 1;
      } catch (err) {
        failedCourses.push(course.name);
      }
    }

    setScanning(false);
    const failedText = failedCourses.length > 0 ? ` Failed for: ${failedCourses.join(', ')}.` : '';
    alert(`Scanned ${successCount}/${visibleCourses.length} syllabi.${failedText}`);
  };

  const getAccountStateLabel = (status) => {
    if (status.sync === 'loading' || status.courses === 'loading' || status.auth === 'loading') {
      return 'Working';
    }
    if (status.auth === 'success') {
      return 'Connected';
    }
    if (status.auth === 'error') {
      return 'Error';
    }
    return 'Idle';
  };

  const getAccountStateClass = (status) => {
    if (status.auth === 'success') {
      return 'online';
    }
    if (status.auth === 'error') {
      return 'offline';
    }
    return 'idle';
  };

  const getIssueList = (status) => [status.authError, status.coursesError, status.syncError].filter(Boolean);
  const hideCourse = (courseName) => {
    setHiddenCourseNames((prev) => (prev.includes(courseName) ? prev : [...prev, courseName]));
  };
  const showCourse = (courseName) => {
    setHiddenCourseNames((prev) => prev.filter((name) => name !== courseName));
  };
  const toggleCourseActions = (courseKey) => {
    setCourseActionsOpen((prev) => (prev === courseKey ? '' : courseKey));
  };

  useEffect(() => {
    onPrimaryUserChange?.(primaryStatus?.user?.first_name || primaryStatus?.user?.name || '');
  }, [onPrimaryUserChange, primaryStatus]);

  return (
    <div className="canvas-settings-container">
      <div className="canvas-header-row">
        <div>
          <h2>Canvas Sync</h2>
          <p className="canvas-subtitle">TMCC first, with WCSD as an optional secondary source</p>
        </div>
        <button onClick={handleSync} disabled={loading || connectedCount === 0} className="sync-btn compact">
          {loading ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="connection-summary">
        <span className={`connection-pill ${connectedCount > 0 ? 'connected' : 'disconnected'}`}>
          {connectedCount}/2 connected
        </span>
        {lastSync && <span className="last-sync">Last synced: {lastSync.toLocaleString()}</span>}
      </div>

      <div className="account-list detailed">
        {ACCOUNTS.map((account) => {
          const status = accountStatus[account.key];
          const issues = getIssueList(status);

          return (
            <div key={account.key} className="account-card">
              <div className="account-item">
                <span className="account-name">{account.label}</span>
                <span className={`account-status ${getAccountStateClass(status)}`}>
                  {getAccountStateLabel(status)}
                </span>
              </div>
              {issues.length > 0 && <div className="account-error">{issues.join(' | ')}</div>}
            </div>
          );
        })}
      </div>

      <div className="courses-section">
        <div className="courses-toolbar">
          <h4>Courses</h4>
          <label className="toggle-inline">
            <input
              type="checkbox"
              checked={showTmccCourses}
              onChange={(e) => setShowTmccCourses(e.target.checked)}
            />
            Show TMCC classes
          </label>
        </div>

        <div className="courses-list wide">
          {displayedCourses.length === 0 ? (
            <p className="empty-state">No courses available yet.</p>
          ) : (
            displayedCourses.map((course) => (
              <div key={`${course.source}-${course.id}`} className={`course-item institution-${course.source}`}>
                <div className="course-main">
                  <div className="course-label">
                    <input
                      type="color"
                      value={courseColors[course.name] || '#667eea'}
                      onChange={(e) => onCourseColorChange?.(course.name, e.target.value)}
                      className="course-color-picker"
                    />
                    <span className="course-name">{course.name}</span>
                  </div>
                </div>

                <div className="course-actions-menu">
                  <button
                    type="button"
                    className="course-menu-btn"
                    onClick={() => toggleCourseActions(`${course.source}-${course.id}`)}
                  >
                    Actions
                  </button>

                  {courseActionsOpen === `${course.source}-${course.id}` && (
                    <div className="course-menu-dropdown">
                      <button
                        type="button"
                        onClick={() => {
                          setCourseActionsOpen('');
                          scanSyllabus(course);
                        }}
                        disabled={scanning}
                        className="course-menu-item"
                      >
                        {scanning ? 'Scanning...' : 'Scan syllabus'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCourseActionsOpen('');
                          hideCourse(course.name);
                        }}
                        className="course-menu-item"
                      >
                        Hide class
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {hiddenCourses.length > 0 && (
          <div className="hidden-courses-section">
            <button
              type="button"
              className="hidden-courses-toggle"
              onClick={() => setShowHiddenCourses((prev) => !prev)}
            >
              {showHiddenCourses ? 'Hide hidden classes' : `Show hidden classes (${hiddenCourses.length})`}
            </button>
            {showHiddenCourses && (
              <div className="hidden-course-chips">
                {hiddenCourses.map((course) => (
                  <button
                    key={`hidden-${course.source}-${course.id}`}
                    type="button"
                    className="hidden-course-chip"
                    onClick={() => showCourse(course.name)}
                  >
                    Show {course.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="course-actions">
          <button
            className="show-more-courses-btn"
            onClick={() => setShowAllCourses((prev) => !prev)}
            disabled={visibleCourses.length <= 8}
          >
            {showAllCourses ? 'Show fewer' : `Show all ${visibleCourses.length}`}
          </button>
          <button
            onClick={scanAllSyllabi}
            disabled={scanning || visibleCourses.length === 0}
            className="scan-all-btn"
          >
            {scanning ? 'Scanning all...' : 'Scan Visible Syllabi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CanvasSettings;
