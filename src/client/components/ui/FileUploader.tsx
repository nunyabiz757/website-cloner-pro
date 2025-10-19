import React, { useState, useRef } from 'react';
import {
  Upload,
  File,
  FileCode,
  Image as ImageIcon,
  FileArchive,
  X,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface ProcessedFiles {
  html: string[];
  css: string[];
  js: string[];
  images: string[];
  fonts: string[];
  other: string[];
}

interface UploadResult {
  success: boolean;
  uploadId: string;
  files: ProcessedFiles;
  totalFiles: number;
  totalSize: number;
}

export const FileUploader: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['html']));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
      setError(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...files]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select files to upload');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/file-upload/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadResult(data);
      setSelectedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'html':
      case 'htm':
        return <FileCode className="w-5 h-5 text-orange-600" />;
      case 'css':
        return <FileCode className="w-5 h-5 text-blue-600" />;
      case 'js':
      case 'mjs':
        return <FileCode className="w-5 h-5 text-yellow-600" />;
      case 'zip':
        return <FileArchive className="w-5 h-5 text-purple-600" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'svg':
      case 'webp':
        return <ImageIcon className="w-5 h-5 text-green-600" />;
      default:
        return <File className="w-5 h-5 text-gray-600" />;
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'html':
        return <FileCode className="w-4 h-4 text-orange-600" />;
      case 'css':
        return <FileCode className="w-4 h-4 text-blue-600" />;
      case 'js':
        return <FileCode className="w-4 h-4 text-yellow-600" />;
      case 'images':
        return <ImageIcon className="w-4 h-4 text-green-600" />;
      case 'fonts':
        return <File className="w-4 h-4 text-purple-600" />;
      default:
        return <File className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Upload className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">File Upload</h2>
          <p className="text-gray-600">Upload HTML, CSS, JS files or ZIP archives</p>
        </div>
      </div>

      {/* Drag & Drop Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900 mb-2">
          Drag and drop files here
        </p>
        <p className="text-sm text-gray-600 mb-4">
          or click the button below to browse
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".html,.htm,.css,.js,.mjs,.jpg,.jpeg,.png,.gif,.svg,.webp,.avif,.woff,.woff2,.ttf,.otf,.eot,.zip,.json,.xml,.txt"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Select Files
        </button>
        <p className="text-xs text-gray-500 mt-4">
          Supported: HTML, CSS, JS, Images, Fonts, ZIP (Max 100MB per file)
        </p>
      </div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">
            Selected Files ({selectedFiles.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Upload Files
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Upload Successful!</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">
                {uploadResult.totalFiles}
              </p>
              <p className="text-xs text-green-600">Files Processed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">
                {formatBytes(uploadResult.totalSize)}
              </p>
              <p className="text-xs text-green-600">Total Size</p>
            </div>
            <div className="text-center col-span-2 md:col-span-1">
              <p className="text-sm font-mono text-green-700 break-all">
                {uploadResult.uploadId}
              </p>
              <p className="text-xs text-green-600">Upload ID</p>
            </div>
          </div>

          {/* File Categories */}
          <div className="space-y-2">
            {Object.entries(uploadResult.files).map(([category, files]) => {
              if (files.length === 0) return null;
              const isExpanded = expandedCategories.has(category);

              return (
                <div key={category} className="bg-white rounded-lg border border-green-200">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(category)}
                      <span className="font-medium text-gray-900 capitalize">
                        {category}
                      </span>
                      <span className="text-sm text-gray-500">({files.length})</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-green-200 p-3">
                      <div className="space-y-1">
                        {files.slice(0, 10).map((file: string, index: number) => (
                          <div key={index} className="text-xs text-gray-600 truncate">
                            {file.split('/').pop() || file}
                          </div>
                        ))}
                        {files.length > 10 && (
                          <p className="text-xs text-gray-500 italic">
                            ...and {files.length - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
