import React, { useState, useEffect } from 'react';
import { Search, Copy, CheckCircle, Clock, AlertCircle, Trash2, RefreshCw } from 'lucide-react';
import './GHLPastePage.css';

interface ClonedPage {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  creditsConsumed: number;
  status: string;
  createdAt: string;
  pasteCount: number;
}

interface PasteSession {
  id: string;
  pasteCode: string;
  status: string;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  clonedPage: {
    sourceUrl: string;
    sourceTitle: string | null;
  };
}

interface Statistics {
  totalPages: number;
  totalCreditsUsed: number;
  totalPasteSessions: number;
  successfulPastes: number;
}

export default function GHLPastePage() {
  const [clonedPages, setClonedPages] = useState<ClonedPage[]>([]);
  const [pasteSessions, setPasteSessions] = useState<PasteSession[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pages' | 'sessions'>('pages');
  const [selectedPage, setSelectedPage] = useState<ClonedPage | null>(null);
  const [showBookmarklet, setShowBookmarklet] = useState(false);
  const [pasteCode, setPasteCode] = useState<string | null>(null);
  const [bookmarkletUrl, setBookmarkletUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadClonedPages(), loadStatistics()]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClonedPages = async () => {
    const response = await fetch('/api/ghl-paste/cloned-pages', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) throw new Error('Failed to load cloned pages');

    const data = await response.json();
    setClonedPages(data.clonedPages);
  };

  const loadPasteSessions = async () => {
    const response = await fetch('/api/ghl-paste/paste-sessions', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) throw new Error('Failed to load paste sessions');

    const data = await response.json();
    setPasteSessions(data.sessions);
  };

  const loadStatistics = async () => {
    const response = await fetch('/api/ghl-paste/statistics', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) throw new Error('Failed to load statistics');

    const data = await response.json();
    setStatistics(data.statistics);
  };

  const handleCreatePasteSession = async (clonedPageId: string) => {
    try {
      const response = await fetch('/api/ghl-paste/paste-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          clonedPageId,
          expiresInMinutes: 5,
        }),
      });

      if (!response.ok) throw new Error('Failed to create paste session');

      const data = await response.json();
      setPasteCode(data.session.pasteCode);

      // Generate bookmarklet
      const bookmarkletResponse = await fetch(
        `/api/ghl-paste/bookmarklet?pasteCode=${data.session.pasteCode}`
      );
      const bookmarkletData = await bookmarkletResponse.json();
      setBookmarkletUrl(bookmarkletData.bookmarklet);
      setShowBookmarklet(true);
    } catch (error) {
      console.error('Failed to create paste session:', error);
      alert('Failed to create paste session. Please try again.');
    }
  };

  const handleCopyBookmarklet = () => {
    if (bookmarkletUrl) {
      navigator.clipboard.writeText(bookmarkletUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeletePage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this cloned page?')) return;

    try {
      const response = await fetch(`/api/ghl-paste/cloned-pages/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to delete page');

      await loadClonedPages();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to delete page:', error);
      alert('Failed to delete page. Please try again.');
    }
  };

  const filteredPages = clonedPages.filter(
    (page) =>
      page.sourceTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.sourceUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="ghl-paste-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="ghl-paste-page">
      <div className="ghl-paste-header">
        <h1>GHL Page Paste</h1>
        <p>Manage your cloned GoHighLevel pages and paste them into your sites</p>
      </div>

      {statistics && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{statistics.totalPages}</div>
            <div className="stat-label">Cloned Pages</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statistics.totalPasteSessions}</div>
            <div className="stat-label">Total Pastes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statistics.successfulPastes}</div>
            <div className="stat-label">Successful</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{statistics.totalCreditsUsed}</div>
            <div className="stat-label">Credits Used</div>
          </div>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'pages' ? 'active' : ''}`}
          onClick={() => setActiveTab('pages')}
        >
          Cloned Pages ({clonedPages.length})
        </button>
        <button
          className={`tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('sessions');
            loadPasteSessions();
          }}
        >
          Paste History
        </button>
      </div>

      {activeTab === 'pages' && (
        <div className="pages-section">
          <div className="search-bar">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search cloned pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={loadData} className="refresh-btn">
              <RefreshCw size={16} />
            </button>
          </div>

          {filteredPages.length === 0 ? (
            <div className="empty-state">
              <p>No cloned pages found</p>
              <small>Go to the dashboard to clone some GHL pages first</small>
            </div>
          ) : (
            <div className="pages-grid">
              {filteredPages.map((page) => (
                <div key={page.id} className="page-card">
                  <div className="page-card-header">
                    <h3>{page.sourceTitle || 'Untitled Page'}</h3>
                    <button
                      className="delete-btn"
                      onClick={() => handleDeletePage(page.id)}
                      title="Delete page"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="page-card-url">{page.sourceUrl}</div>
                  <div className="page-card-meta">
                    <span>{page.creditsConsumed} credit(s)</span>
                    <span>{formatDate(page.createdAt)}</span>
                    <span>{page.pasteCount} paste(s)</span>
                  </div>
                  <button
                    className="paste-btn"
                    onClick={() => handleCreatePasteSession(page.id)}
                  >
                    <Copy size={16} />
                    Generate Paste Code
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="sessions-section">
          {pasteSessions.length === 0 ? (
            <div className="empty-state">
              <p>No paste sessions yet</p>
              <small>Create a paste session to get started</small>
            </div>
          ) : (
            <div className="sessions-list">
              {pasteSessions.map((session) => (
                <div key={session.id} className="session-card">
                  <div className="session-header">
                    <div className="session-code">{session.pasteCode}</div>
                    <div className={`session-status status-${session.status}`}>
                      {session.status === 'completed' && <CheckCircle size={16} />}
                      {session.status === 'pending' && <Clock size={16} />}
                      {session.status === 'expired' && <AlertCircle size={16} />}
                      {session.status}
                    </div>
                  </div>
                  <div className="session-page">{session.clonedPage.sourceTitle || 'Untitled Page'}</div>
                  <div className="session-url">{session.clonedPage.sourceUrl}</div>
                  <div className="session-meta">
                    <span>Created: {formatDate(session.createdAt)}</span>
                    {session.completedAt && <span>Completed: {formatDate(session.completedAt)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showBookmarklet && pasteCode && bookmarkletUrl && (
        <div className="modal-overlay" onClick={() => setShowBookmarklet(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Paste Code Generated!</h2>
            <div className="paste-code-display">
              <div className="paste-code-label">Your Paste Code:</div>
              <div className="paste-code-value">{pasteCode}</div>
              <div className="paste-code-expiry">Expires in 5 minutes</div>
            </div>

            <div className="instructions">
              <h3>How to Paste:</h3>
              <ol>
                <li>Copy the bookmarklet below</li>
                <li>Navigate to your GHL page where you want to paste</li>
                <li>Paste the bookmarklet into your browser's address bar</li>
                <li>Press Enter</li>
                <li>The content will be automatically pasted!</li>
              </ol>
            </div>

            <div className="bookmarklet-section">
              <label>Bookmarklet Code:</label>
              <div className="bookmarklet-code">
                <code>{bookmarkletUrl}</code>
              </div>
              <button
                className="copy-bookmarklet-btn"
                onClick={handleCopyBookmarklet}
              >
                {copied ? (
                  <>
                    <CheckCircle size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Copy Bookmarklet
                  </>
                )}
              </button>
            </div>

            <button className="close-modal-btn" onClick={() => setShowBookmarklet(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
