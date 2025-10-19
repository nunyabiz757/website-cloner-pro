import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Search,
  CheckCircle,
  AlertTriangle,
  Tag,
  Send,
  Edit,
  Trash2,
  Loader,
  X,
  AlertCircle,
} from 'lucide-react';

type AnnotationType = 'comment' | 'highlight' | 'markup' | 'suggestion' | 'issue';
type AnnotationStatus = 'open' | 'resolved' | 'in_progress' | 'rejected';
type Priority = 'low' | 'medium' | 'high' | 'critical';

interface Annotation {
  id: string;
  type: AnnotationType;
  status: AnnotationStatus;
  priority?: Priority;
  author: {
    userId: string;
    name: string;
    avatarUrl?: string;
  };
  content: string;
  position: {
    selector?: string;
    pageUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  replies: AnnotationReply[];
  tags: string[];
  mentions: string[];
}

interface AnnotationReply {
  id: string;
  author: {
    userId: string;
    name: string;
    avatarUrl?: string;
  };
  content: string;
  createdAt: string;
}

interface AnnotationsProps {
  projectId: string;
  currentUserId: string;
  currentUserName: string;
  versionId?: string;
}

export const Annotations: React.FC<AnnotationsProps> = ({
  projectId,
  currentUserId,
  currentUserName,
  versionId,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [filteredAnnotations, setFilteredAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<AnnotationType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<AnnotationStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [showNewAnnotation, setShowNewAnnotation] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // New annotation form
  const [newAnnotationType, setNewAnnotationType] = useState<AnnotationType>('comment');
  const [newAnnotationContent, setNewAnnotationContent] = useState('');
  const [newAnnotationPriority, setNewAnnotationPriority] = useState<Priority>('medium');
  const [newAnnotationTags, setNewAnnotationTags] = useState('');

  useEffect(() => {
    loadAnnotations();
  }, [projectId, versionId]);

  useEffect(() => {
    applyFilters();
  }, [annotations, searchQuery, filterType, filterStatus, filterPriority]);

  const loadAnnotations = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (versionId) params.append('versionId', versionId);

      const response = await fetch(`/api/collaboration/annotations/${projectId}?${params}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load annotations');
      }

      setAnnotations(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load annotations');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...annotations];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.content.toLowerCase().includes(query) ||
          a.author.name.toLowerCase().includes(query) ||
          a.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter((a) => a.type === filterType);
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }

    // Priority filter
    if (filterPriority !== 'all') {
      filtered = filtered.filter((a) => a.priority === filterPriority);
    }

    setFilteredAnnotations(filtered);
  };

  const createAnnotation = async () => {
    if (!newAnnotationContent.trim()) {
      setError('Annotation content is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/collaboration/annotations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          versionId,
          type: newAnnotationType,
          content: newAnnotationContent,
          position: { selector: 'body', pageUrl: window.location.href },
          author: {
            userId: currentUserId,
            name: currentUserName,
          },
          priority: newAnnotationPriority,
          tags: newAnnotationTags
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create annotation');
      }

      setAnnotations((prev) => [data.data, ...prev]);
      setShowNewAnnotation(false);
      setNewAnnotationContent('');
      setNewAnnotationTags('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create annotation');
    } finally {
      setLoading(false);
    }
  };

  const addReply = async (annotationId: string) => {
    if (!replyText.trim()) return;

    try {
      const response = await fetch(`/api/collaboration/annotations/${annotationId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: {
            userId: currentUserId,
            name: currentUserName,
          },
          content: replyText,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to add reply');
      }

      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? data.data : a))
      );
      setReplyText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add reply');
    }
  };

  const resolveAnnotation = async (annotationId: string) => {
    try {
      const response = await fetch(`/api/collaboration/annotations/${annotationId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: currentUserId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to resolve annotation');
      }

      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? { ...a, status: 'resolved' } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve annotation');
    }
  };

  const deleteAnnotation = async (annotationId: string) => {
    if (!confirm('Are you sure you want to delete this annotation?')) {
      return;
    }

    try {
      const response = await fetch(`/api/collaboration/annotations/${annotationId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete annotation');
      }

      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      setSelectedAnnotation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete annotation');
    }
  };

  const getTypeIcon = (type: AnnotationType) => {
    switch (type) {
      case 'comment':
        return <MessageSquare className="w-4 h-4" />;
      case 'issue':
        return <AlertTriangle className="w-4 h-4" />;
      case 'suggestion':
        return <Edit className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: AnnotationStatus) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'resolved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
    }
  };

  const getPriorityColor = (priority?: Priority) => {
    if (!priority) return 'bg-gray-100 text-gray-700';
    switch (priority) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-white';
      case 'low':
        return 'bg-green-500 text-white';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading && annotations.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 rounded-lg">
            <MessageSquare className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Annotations</h2>
            <p className="text-gray-600">
              {filteredAnnotations.length} of {annotations.length} annotations
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNewAnnotation(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Annotation
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search annotations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="all">All Types</option>
          <option value="comment">Comment</option>
          <option value="issue">Issue</option>
          <option value="suggestion">Suggestion</option>
          <option value="highlight">Highlight</option>
          <option value="markup">Markup</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Annotations List */}
      <div className="space-y-4">
        {filteredAnnotations.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">No annotations found</p>
          </div>
        ) : (
          filteredAnnotations.map((annotation) => (
            <div
              key={annotation.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              {/* Annotation Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {annotation.author.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {annotation.author.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(annotation.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                          annotation.status
                        )}`}
                      >
                        {getTypeIcon(annotation.type)}
                        {annotation.type}
                      </span>

                      <span
                        className={`px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(
                          annotation.status
                        )}`}
                      >
                        {annotation.status.replace('_', ' ')}
                      </span>

                      {annotation.priority && (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium capitalize ${getPriorityColor(
                            annotation.priority
                          )}`}
                        >
                          {annotation.priority}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {annotation.status !== 'resolved' && (
                    <button
                      onClick={() => resolveAnnotation(annotation.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Resolve"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  )}
                  {annotation.author.userId === currentUserId && (
                    <button
                      onClick={() => deleteAnnotation(annotation.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Annotation Content */}
              <div className="mb-3 pl-13">
                <p className="text-gray-700 whitespace-pre-wrap">{annotation.content}</p>

                {/* Tags */}
                {annotation.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {annotation.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Replies */}
              {annotation.replies.length > 0 && (
                <div className="pl-13 space-y-3 mb-3 border-l-2 border-gray-200 ml-5">
                  {annotation.replies.map((reply) => (
                    <div key={reply.id} className="pl-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {reply.author.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {reply.author.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 pl-8">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {selectedAnnotation === annotation.id ? (
                <div className="pl-13 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addReply(annotation.id);
                      }
                    }}
                    placeholder="Write a reply..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    onClick={() => addReply(annotation.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAnnotation(null);
                      setReplyText('');
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedAnnotation(annotation.id)}
                  className="pl-13 text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Reply
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Annotation Modal */}
      {showNewAnnotation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">New Annotation</h3>
              <button
                onClick={() => setShowNewAnnotation(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <select
                    value={newAnnotationType}
                    onChange={(e) => setNewAnnotationType(e.target.value as AnnotationType)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="comment">Comment</option>
                    <option value="issue">Issue</option>
                    <option value="suggestion">Suggestion</option>
                    <option value="highlight">Highlight</option>
                    <option value="markup">Markup</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={newAnnotationPriority}
                    onChange={(e) => setNewAnnotationPriority(e.target.value as Priority)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                <textarea
                  value={newAnnotationContent}
                  onChange={(e) => setNewAnnotationContent(e.target.value)}
                  placeholder="Describe your annotation..."
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={newAnnotationTags}
                  onChange={(e) => setNewAnnotationTags(e.target.value)}
                  placeholder="bug, ui, urgent"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={createAnnotation}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Create Annotation
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowNewAnnotation(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
