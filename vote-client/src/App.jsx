// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Users, Link, Check, Calendar, Trash2, Vote } from 'lucide-react';
import OptionCountSelector from './components/OptionCountSelector';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(API_URL);

export default function VotingApp() {
  const [mode, setMode] = useState('landing');
  const [sessionId, setSessionId] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [question, setQuestion] = useState('');
  const [selectedVotes, setSelectedVotes] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [voterName, setVoterName] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState('');
  const [voterId, setVoterId] = useState('');
  const [voteCount, setVoteCount] = useState(1);
  const [voteMode, setVoteMode] = useState('exactly');
  
  // Date voting features
  const [includeDates, setIncludeDates] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const [voterSelectedDates, setVoterSelectedDates] = useState([]);

  // Generate or retrieve voter ID
  useEffect(() => {
    let id = localStorage.getItem('voterId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('voterId', id);
    }
    setVoterId(id);
  }, []);

  // Check URL for session ID
  useEffect(() => {
    if (!voterId) return; // Wait for voterId to be set
    
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) {
      setSessionId(sid);
      loadSession(sid);
    }
  }, [voterId]); 

  // WebSocket: Listen for session updates
  useEffect(() => {
    if (sessionId) {
      socket.emit('joinSession', sessionId);

      socket.on('sessionUpdate', (updatedSession) => {
        setSessionData(updatedSession);
      });

      return () => {
        socket.off('sessionUpdate');
      };
    }
  }, [sessionId]);

  // Generate calendar dates (next 90 days organized by month)
  const generateCalendarDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const calendarDates = generateCalendarDates();

  // Group dates by month for calendar view
  const getCalendarMonths = () => {
    const months = {};
    calendarDates.forEach(date => {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!months[monthKey]) {
        months[monthKey] = {
          name: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          dates: []
        };
      }
      months[monthKey].dates.push(date);
    });
    return Object.values(months);
  };

  const getDayOfWeek = (date) => {
    return date.getDay();
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const toggleDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr));
    } else {
      setSelectedDates([...selectedDates, dateStr]);
    }
  };

  const toggleVoterDate = (date) => {
    if (voterSelectedDates.includes(date)) {
      setVoterSelectedDates(voterSelectedDates.filter(d => d !== date));
    } else {
      setVoterSelectedDates([...voterSelectedDates, date]);
    }
  };

  const removeOption = (index) => {
    if (options.length > 2) {
      const newOpts = options.filter((_, idx) => idx !== index);
      setOptions(newOpts);
    }
  };

  const createSession = async () => {
    const validOptions = options.filter(o => o.trim() !== '');
    if (validOptions.length < 2) {
      setError('Please add at least 2 options');
      return;
    }
    if (!question.trim()) {
      setError('Please add a question');
      return;
    }
    if (includeDates && selectedDates.length === 0) {
      setError('Please select at least one date');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          options: validOptions,
          dates: includeDates ? selectedDates.sort() : null,
          voteCount: voteCount,
          voteMode: voteMode
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create session');
        return;
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setSessionData(data.session);
      setMode('results');

      const url = new URL(window.location);
      url.searchParams.set('session', data.sessionId);
      window.history.pushState({}, '', url);
    } catch (err) {
      setError('Failed to create session: ' + err.message);
    }
  };

  const loadSession = async (sid) => {
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sid}`);
      if (!response.ok) {
        setError('Session not found');
        setMode('landing');
        return;
      }

      const data = await response.json();
      setSessionData(data);

      setVoteCount(data.voteCount || 1);
      setVoteMode(data.voteMode || 'exactly');

      if (data.votes[voterId]) {
        setHasVoted(true);
        setMode('results');
      } else {
        setMode('vote');
      }
    } catch (err) {
      setError('Failed to load session');
      setMode('landing');
    }
  };

  const submitVote = async () => {
    const minVotes = voteMode === 'minimum' ? voteCount : (voteMode === 'exactly' ? voteCount : 0);
    const maxVotes = voteMode === 'maximum' ? voteCount : (voteMode === 'exactly' ? voteCount : Infinity);
  
    if (selectedVotes.length < minVotes || selectedVotes.length > maxVotes) {
      setError(`Please select ${voteMode} ${voteCount} option${voteCount !== 1 ? 's' : ''}`);
      return;
    }
    if (!voterName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (sessionData.dates && voterSelectedDates.length === 0) {
      setError('Please select at least one date');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterName: voterName.trim(),
          choices: selectedVotes,
          dates: sessionData.dates ? voterSelectedDates : null,
          voterId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error);
        return;
      }

      const data = await response.json();
      setSessionData(data);
      setHasVoted(true);
      setMode('results');
    } catch (err) {
      setError('Failed to submit vote');
    }
  };

  const toggleVote = (option) => {
    if (selectedVotes.includes(option)) {
      setSelectedVotes(selectedVotes.filter(v => v !== option));
    } else {
      const maxAllowed = (voteMode === 'exactly' || voteMode === 'maximum') ? voteCount : sessionData.options.length;
      
      if (selectedVotes.length < maxAllowed) {
        setSelectedVotes([...selectedVotes, option]);
      }
    }
  };

  const calculateResults = () => {
    if (!sessionData) return [];

    const counts = {};
    sessionData.options.forEach(opt => counts[opt] = 0);

    Object.values(sessionData.votes).forEach(vote => {
      vote.choices.forEach(choice => {
        counts[choice] = (counts[choice] || 0) + 1;
      });
    });

    return sessionData.options.map(opt => ({
      option: opt,
      votes: counts[opt],
      percentage: Object.keys(sessionData.votes).length > 0
        ? Math.round((counts[opt] / (Object.keys(sessionData.votes).length * 3)) * 100)
        : 0
    })).sort((a, b) => b.votes - a.votes);
  };

  const calculateDateResults = () => {
    if (!sessionData || !sessionData.dates) return [];

    const counts = {};
    sessionData.dates.forEach(date => counts[date] = 0);

    Object.values(sessionData.votes).forEach(vote => {
      if (vote.dates) {
        vote.dates.forEach(date => {
          counts[date] = (counts[date] || 0) + 1;
        });
      }
    });

    return sessionData.dates.map(date => ({
      date,
      votes: counts[date],
      percentage: Object.keys(sessionData.votes).length > 0
        ? Math.round((counts[date] / Object.keys(sessionData.votes).length) * 100)
        : 0
    })).sort((a, b) => b.votes - a.votes);
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  // Landing Page
  if (mode === 'landing') {
    return (
      <div className="min-h-screen app-background from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Vote className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">What/Where/When</h1>
            <p className="text-gray-600">Jacob's super easy app to help you and your friend's make a decision</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <button
            onClick={() => setMode('create')}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
          >
            Create New Session
          </button>
        </div>
      </div>
    );
  }

  // Create Session
  if (mode === 'create') {
    return (
      <div className="min-h-screen app-background from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Voting Session</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should we vote on?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Options (minimum 2)</label>
            {options.map((opt, idx) => (
              <div key={idx} className="relative mb-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...options];
                    newOpts[idx] = e.target.value;
                    setOptions(newOpts);
                  }}
                  placeholder={`Option ${idx + 1}`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {idx >= 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-700 transition"
                  >
                    <Trash2 className="w-5 h-5 text-black hover:text-red-500 transition" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setOptions([...options, ''])}
              className="text-primary font-semibold"
            >
              + Add Another Option
            </button>
          </div>
          
          <OptionCountSelector 
            value={voteCount}
            onChange={setVoteCount}
            mode={voteMode}
            onModeChange={setVoteMode}
          />

          <div className="mb-6 pt-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDates}
                onChange={(e) => setIncludeDates(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
              />
              <span className="flex items-center gap-2 text-gray-700 font-semibold">
                <Calendar className="w-5 h-5" />
                Do you want to vote on dates as well?
              </span>
            </label>
          </div>

          {includeDates && (
            <div className="mb-6">
              <label className="block text-gray-700 font-semibold mb-3">Select Available Dates</label>
              <div className="space-y-6 max-h-96 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                {getCalendarMonths().map((month, monthIdx) => (
                  <div key={monthIdx}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">{month.name}</h3>
                    <div className="grid grid-cols-7 gap-1">
                      {/* Day headers */}
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-gray-500 py-1">
                          {day}
                        </div>
                      ))}
                      {/* Empty cells for days before month starts */}
                      {monthIdx === 0 && Array(getDayOfWeek(month.dates[0])).fill(null).map((_, idx) => (
                        <div key={`empty-${idx}`} />
                      ))}
                      {/* Date buttons */}
                      {month.dates.map((date) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const isSelected = selectedDates.includes(dateStr);
                        const isToday = date.toDateString() === new Date().toDateString();
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => toggleDate(date)}
                            className={`aspect-square p-2 text-sm rounded-lg border-2 transition ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                                : isToday
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-semibold'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Selected: {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setMode('landing');
                setError('');
                setIncludeDates(false);
                setSelectedDates([]);
              }}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={createSession}
              className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold transition"
            >
              Create Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'vote' && sessionData) {
    return (
      <div className="min-h-screen app-background from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{sessionData.question}</h2>
          <p className="text-gray-600 mb-6">
            Select {voteMode} {voteCount} option{voteCount !== 1 ? 's' : ''}{sessionData.dates ? ' and at least 1 date' : ''}
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Your Name</label>
            <input
              type="text"
              value={voterName}
              onChange={(e) => setVoterName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-3">
              Choose {voteMode} {voteCount}
            </label>
            <div className="space-y-3">
              {sessionData.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleVote(option)}
                  className={`w-full p-4 rounded-lg border-2 transition flex items-center justify-between ${
                    selectedVotes.includes(option)
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium text-gray-800">{option}</span>
                  {selectedVotes.includes(option) && (
                    <Check className="w-5 h-5 text-indigo-600" />
                  )}
                </button>
              ))}
            </div>
            <div className="bg-gray-50 p-3 rounded-lg mt-3">
              <p className="text-center text-gray-700">
                Selected: <span className="font-bold text-indigo-600">{selectedVotes.length}</span>
              </p>
            </div>
          </div>

          {sessionData.dates && (
            <div className="mb-6 border-t pt-6">
              <label className="flex items-center gap-2 text-gray-700 font-semibold mb-3">
                <Calendar className="w-5 h-5" />
                Select Available Dates (at least 1)
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                {sessionData.dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => toggleVoterDate(date)}
                    className={`p-2 text-sm rounded-lg border-2 transition ${
                      voterSelectedDates.includes(date)
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>
              <div className="bg-gray-50 p-3 rounded-lg mt-3">
                <p className="text-center text-gray-700">
                  Selected: <span className="font-bold text-green-600">{voterSelectedDates.length}</span> date{voterSelectedDates.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={submitVote}
            disabled={
              (voteMode === 'exactly' && selectedVotes.length !== voteCount) ||
              !voterName.trim() ||
              (sessionData.dates && voterSelectedDates.length === 0)
            }
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Submit Vote
          </button>
          
        </div>
      </div>
    );
  }

  // Results
  if (mode === 'results' && sessionData) {
    const results = calculateResults();
    const dateResults = sessionData.dates ? calculateDateResults() : [];
    const totalVoters = Object.keys(sessionData.votes).length;
    const names = Object.values(sessionData.votes).map(v => v.name).join(", ");;

    return (
      <div className="min-h-screen app-background from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{sessionData.question}</h2>
          <p className="text-gray-600 mb-6">Voted so far: {names}</p>
          <p className="text-gray-600 mb-6">{totalVoters} {totalVoters === 1 ? 'person has' : 'people have'} voted</p>

          {!hasVoted && (
            <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="w-5 h-5 text-indigo-600" />
                <span className="text-gray-700">Share this link to invite voters</span>
              </div>
              <button
                onClick={copyLink}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
              >
                Copy Link
              </button>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Option Results</h3>
            <div className="space-y-4">
              {results.map((result, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-gray-800">{result.option}</span>
                    <span className="text-gray-600">{result.votes} votes</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${result.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {sessionData.dates && dateResults.length > 0 && (
            <div className="mb-6 border-t pt-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-3">
                <Calendar className="w-5 h-5" />
                Date Availability
              </h3>
              <div className="space-y-4">
                {dateResults.map((result, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-800">{formatDate(result.date)}</span>
                      <span className="text-gray-600">{result.votes} {result.votes === 1 ? 'person' : 'people'} available</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-green-600 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${result.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasVoted && (
            <div className="mt-6 bg-green-50 border border-green-200 p-4 rounded-lg flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <span className="text-green-700">You've already voted in this session</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}