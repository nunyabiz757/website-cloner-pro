/**
 * Video Playlist Recognition Patterns
 *
 * Detects video playlist and video grid components
 */

import type { RecognitionPattern } from '../types.js';

export const videoPlaylistPatterns: RecognitionPattern[] = [
  // Explicit video playlists
  {
    componentType: 'video-playlist',
    patterns: {
      childPattern: '[class*="video-item"], iframe[src*="youtube"], iframe[src*="vimeo"]',
      classKeywords: ['video-playlist', 'playlist', 'video-list'],
      structurePattern: {
        minChildren: 2,
      },
    },
    confidence: 95,
    priority: 8,
  },

  // Video grids
  {
    componentType: 'video-playlist',
    patterns: {
      childPattern: 'video, iframe[src*="youtube"], iframe[src*="vimeo"]',
      classKeywords: ['video-grid', 'video-gallery', 'media-grid'],
      structurePattern: {
        minChildren: 2,
      },
    },
    confidence: 90,
    priority: 8,
  },

  // YouTube/Vimeo containers
  {
    componentType: 'video-playlist',
    patterns: {
      childPattern: 'iframe[src*="youtube"], iframe[src*="vimeo"]',
      structurePattern: {
        minChildren: 2,
        childSelector: 'iframe',
      },
    },
    confidence: 85,
    priority: 7,
  },

  // Generic video containers with data attributes
  {
    componentType: 'video-playlist',
    patterns: {
      classKeywords: ['videos', 'media-list', 'channel'],
      dataAttributes: ['video', 'playlist'],
      structurePattern: {
        minChildren: 2,
      },
    },
    confidence: 75,
    priority: 6,
  },
];
