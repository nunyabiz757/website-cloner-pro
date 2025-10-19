/**
 * Video Playlist Mapper
 *
 * Maps video playlist components to Elementor Video Playlist widget
 * Handles YouTube, Vimeo, and hosted videos
 */

import type { RecognizedComponent } from '../../../recognizer/types.js';
import type { ElementorWidget } from '../../../types/page-builder.types.js';
import crypto from 'crypto';

export class VideoPlaylistMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'video-playlist',
      settings: {
        // Playlist items
        tabs: mapping.videos.map((video, index) => ({
          _id: this.generateUniqueId(),
          tab_title: video.title || `Video ${index + 1}`,
          tab_duration: video.duration || '',
          tab_thumbnail: video.thumbnail
            ? {
                url: video.thumbnail,
                id: '',
              }
            : undefined,
          video_type: video.type, // 'youtube' | 'vimeo' | 'hosted'
          youtube_url: video.type === 'youtube' ? video.url : undefined,
          vimeo_url: video.type === 'vimeo' ? video.url : undefined,
          hosted_url: video.type === 'hosted' ? { url: video.url } : undefined,
        })),

        // Layout
        playlist_layout: mapping.layout, // 'inline' | 'section'
        show_image_overlay: 'yes',
        show_play_icon: 'yes',

        // Video player settings
        autoplay: mapping.autoplay ? 'yes' : 'no',
        mute: 'no',
        loop: mapping.loop ? 'yes' : 'no',
        controls: 'yes',

        // Display options
        show_playlist: 'yes',
        show_video_count: 'yes',
        show_duration: 'yes',
      },
    };
  }

  private static extractMapping(component: RecognizedComponent) {
    const element = component.element;

    return {
      videos: this.extractVideos(element),
      layout: this.detectLayout(element),
      autoplay: this.hasAutoplay(element),
      loop: this.hasLoop(element),
    };
  }

  private static extractVideos(
    element: Element
  ): Array<{
    title: string;
    url: string;
    type: 'youtube' | 'vimeo' | 'hosted';
    thumbnail: string;
    duration: string;
  }> {
    const videos: Array<{
      title: string;
      url: string;
      type: 'youtube' | 'vimeo' | 'hosted';
      thumbnail: string;
      duration: string;
    }> = [];

    // Find video items in playlist
    const videoItems = element.querySelectorAll(
      '[class*="video-item"], [class*="playlist-item"], [data-video], li'
    );

    videoItems.forEach((item) => {
      const video = this.extractVideoFromItem(item);
      if (video) {
        videos.push(video);
      }
    });

    // Fallback: Check for iframe elements
    if (videos.length === 0) {
      const iframes = element.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"]');

      iframes.forEach((iframe, index) => {
        const src = iframe.getAttribute('src') || '';
        const type = this.detectVideoType(src);

        if (type !== 'hosted') {
          videos.push({
            title: `Video ${index + 1}`,
            url: src,
            type,
            thumbnail: this.extractThumbnailFromIframe(iframe),
            duration: '',
          });
        }
      });
    }

    // Fallback: Check for video elements
    if (videos.length === 0) {
      const videoElements = element.querySelectorAll('video source, video');

      videoElements.forEach((video, index) => {
        const src =
          video.getAttribute('src') ||
          (video instanceof HTMLVideoElement && video.querySelector('source')?.getAttribute('src')) ||
          '';

        if (src) {
          videos.push({
            title: `Video ${index + 1}`,
            url: src,
            type: 'hosted',
            thumbnail: this.extractThumbnailFromVideo(video),
            duration: '',
          });
        }
      });
    }

    return videos.slice(0, 20); // Limit to 20 videos
  }

  private static extractVideoFromItem(item: Element): {
    title: string;
    url: string;
    type: 'youtube' | 'vimeo' | 'hosted';
    thumbnail: string;
    duration: string;
  } | null {
    // Extract URL
    let url = '';
    const link = item.querySelector('a');
    const iframe = item.querySelector('iframe');
    const video = item.querySelector('video');

    if (link) {
      url = link.getAttribute('href') || link.getAttribute('data-video') || '';
    } else if (iframe) {
      url = iframe.getAttribute('src') || '';
    } else if (video) {
      url = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '';
    } else {
      url = item.getAttribute('data-video') || item.getAttribute('data-src') || '';
    }

    if (!url) return null;

    // Detect video type
    const type = this.detectVideoType(url);

    // Extract title
    const titleEl = item.querySelector('[class*="title"], h1, h2, h3, h4, h5, h6');
    const title = titleEl?.textContent?.trim() || item.getAttribute('data-title') || 'Untitled Video';

    // Extract thumbnail
    const thumbnail = this.extractThumbnailFromItem(item);

    // Extract duration
    const durationEl = item.querySelector('[class*="duration"], [data-duration]');
    const duration = durationEl?.textContent?.trim() || item.getAttribute('data-duration') || '';

    return {
      title,
      url,
      type,
      thumbnail,
      duration,
    };
  }

  private static detectVideoType(url: string): 'youtube' | 'vimeo' | 'hosted' {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('vimeo.com')) return 'vimeo';
    return 'hosted';
  }

  private static extractThumbnailFromItem(item: Element): string {
    // Check for img element
    const img = item.querySelector('img');
    if (img) {
      return img.getAttribute('src') || img.getAttribute('data-src') || '';
    }

    // Check for background image
    const bgImage = this.extractBackgroundImage(item);
    if (bgImage) return bgImage;

    // Check for data attribute
    const thumbAttr = item.getAttribute('data-thumbnail');
    if (thumbAttr) return thumbAttr;

    return '';
  }

  private static extractThumbnailFromIframe(iframe: Element): string {
    const parent = iframe.parentElement;
    if (parent) {
      const img = parent.querySelector('img');
      if (img) return img.getAttribute('src') || '';
    }

    return '';
  }

  private static extractThumbnailFromVideo(video: Element): string {
    // Check for poster attribute
    if (video instanceof HTMLVideoElement) {
      const poster = video.getAttribute('poster');
      if (poster) return poster;
    }

    // Check for sibling img
    const parent = video.parentElement;
    if (parent) {
      const img = parent.querySelector('img');
      if (img) return img.getAttribute('src') || '';
    }

    return '';
  }

  private static detectLayout(element: Element): 'inline' | 'section' {
    const classList = element.className.toLowerCase();

    if (classList.includes('inline')) return 'inline';
    if (classList.includes('section')) return 'section';

    // Check for flex/grid layout
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      const display = computedStyle.display;
      if (display === 'flex' || display === 'grid') return 'inline';
    }

    return 'inline'; // Default
  }

  private static hasAutoplay(element: Element): boolean {
    // Check for data attribute
    if (element.hasAttribute('data-autoplay')) {
      const autoplay = element.getAttribute('data-autoplay');
      return autoplay === 'true' || autoplay === '1';
    }

    // Check iframe autoplay parameter
    const iframe = element.querySelector('iframe');
    if (iframe) {
      const src = iframe.getAttribute('src') || '';
      return src.includes('autoplay=1') || iframe.hasAttribute('autoplay');
    }

    // Check video element
    const video = element.querySelector('video');
    if (video) {
      return video.hasAttribute('autoplay');
    }

    return false;
  }

  private static hasLoop(element: Element): boolean {
    // Check for data attribute
    if (element.hasAttribute('data-loop')) {
      const loop = element.getAttribute('data-loop');
      return loop === 'true' || loop === '1';
    }

    // Check iframe loop parameter
    const iframe = element.querySelector('iframe');
    if (iframe) {
      const src = iframe.getAttribute('src') || '';
      return src.includes('loop=1');
    }

    // Check video element
    const video = element.querySelector('video');
    if (video) {
      return video.hasAttribute('loop');
    }

    return false;
  }

  // Helper methods
  private static extractBackgroundImage(element: Element): string {
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      const bgImage = computedStyle.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match) return match[1];
      }
    }

    return '';
  }

  private static generateUniqueId(): string {
    return crypto.randomBytes(4).toString('hex');
  }
}

export default VideoPlaylistMapper;
