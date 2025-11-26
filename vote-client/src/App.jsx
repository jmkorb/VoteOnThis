import React, { useState, useEffect } from 'react';
import { Users, Link, Check } from 'lucide-react';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:3001';
const socket = io(API_URL);

export default function VotingApp() {
  const [mode, setMode] = useState('landing');
  const [sessionId, setSessionId] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [question, setQuestion] = useState('');
  const [selectedVotes, setSelectedVotes] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [voterName, setVoterName] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [error, setError] = useState('');
  const [voterId, setVoterId] = useState('');

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
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (sessionId) {
      setSessionId(sessionId);
      loadSession(sessionId);
    }
  }, []);

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

  const createSession = async () => {
    const validOptions = options.filter(o => o.trim() !== '');
    if (validOptions.length < 3) {
      setError('Please add at least 3 options');
      return;
    }
    if (!question.trim()) {
      setError('Please add a question');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          options: validOptions
        })
      });

      const data = await response.json();
      setSessionId(data.sessionId);
      setSessionData(data.session);
      setMode('results');

      const url = new URL(window.location);
      url.searchParams.set('session', data.sessionId);
      window.history.pushState({}, '', url);
    } catch (err) {
      setError('Failed to create session');
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

      // Check if current user has voted
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
    if (selectedVotes.length !== 3) {
      setError('Please select exactly 3 options');
      return;
    }
    if (!voterName.trim()) {
      setError('Please enter your name');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterName: voterName.trim(),
          choices: selectedVotes,
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
    } else if (selectedVotes.length < 3) {
      setSelectedVotes([...selectedVotes, option]);
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

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  // Landing Page
  if (mode === 'landing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Users className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Multi-Vote</h1>
            <p className="text-gray-600">Create voting sessions where everyone picks their top 3 choices</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <button
            onClick={() => setMode('create')}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-8">
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
            <label className="block text-gray-700 font-semibold mb-2">Options (minimum 3)</label>
            {options.map((opt, idx) => (
              <input
                key={idx}
                type="text"
                value={opt}
                onChange={(e) => {
                  const newOpts = [...options];
                  newOpts[idx] = e.target.value;
                  setOptions(newOpts);
                }}
                placeholder={`Option ${idx + 1}`}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            ))}
            <button
              onClick={() => setOptions([...options, ''])}
              className="text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              + Add Another Option
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setMode('landing');
                setError('');
              }}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={createSession}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Create Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Voting Interface
  if (mode === 'vote' && sessionData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{sessionData.question}</h2>
          <p className="text-gray-600 mb-6">Select exactly 3 options</p>

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

          <div className="space-y-3 mb-6">
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

          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <p className="text-center text-gray-700">
              Selected: <span className="font-bold text-indigo-600">{selectedVotes.length}</span> / 3
            </p>
          </div>

          <button
            onClick={submitVote}
            disabled={selectedVotes.length !== 3 || !voterName.trim()}
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
    const totalVoters = Object.keys(sessionData.votes).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{sessionData.question}</h2>
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