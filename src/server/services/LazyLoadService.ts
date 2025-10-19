import * as cheerio from 'cheerio';

interface LazyLoadOptions {
  images?: boolean;
  iframes?: boolean;
  videos?: boolean;
  skipFirstN?: number; // Skip first N images (above the fold)
  addNoscript?: boolean; // Add noscript fallback
  useIntersectionObserver?: boolean; // Add IO polyfill script
  threshold?: string; // rootMargin for IO
}

interface LazyLoadResult {
  optimizedHtml: string;
  imagesProcessed: number;
  iframesProcessed: number;
  videosProcessed: number;
  scriptInjected: boolean;
}

export class LazyLoadService {
  /**
   * Add lazy loading to HTML content
   */
  async addLazyLoading(
    htmlContent: string,
    options: LazyLoadOptions = {}
  ): Promise<LazyLoadResult> {
    const defaults: LazyLoadOptions = {
      images: true,
      iframes: true,
      videos: true,
      skipFirstN: 2,
      addNoscript: true,
      useIntersectionObserver: true,
      threshold: '50px',
    };

    const opts = { ...defaults, ...options };

    const $ = cheerio.load(htmlContent);
    let imagesProcessed = 0;
    let iframesProcessed = 0;
    let videosProcessed = 0;
    let scriptInjected = false;

    // Process images
    if (opts.images) {
      imagesProcessed = this.processImages($, opts.skipFirstN!, opts.addNoscript!);
    }

    // Process iframes
    if (opts.iframes) {
      iframesProcessed = this.processIframes($);
    }

    // Process videos
    if (opts.videos) {
      videosProcessed = this.processVideos($);
    }

    // Inject Intersection Observer polyfill and lazy load script
    if (opts.useIntersectionObserver && (imagesProcessed > 0 || iframesProcessed > 0 || videosProcessed > 0)) {
      this.injectLazyLoadScript($, opts.threshold!);
      scriptInjected = true;
    }

    return {
      optimizedHtml: $.html(),
      imagesProcessed,
      iframesProcessed,
      videosProcessed,
      scriptInjected,
    };
  }

  /**
   * Process images for lazy loading
   */
  private processImages(
    $: cheerio.CheerioAPI,
    skipFirstN: number,
    addNoscript: boolean
  ): number {
    let count = 0;
    const images = $('img').toArray();

    images.forEach((img, index) => {
      const $img = $(img);

      // Skip first N images (above the fold)
      if (index < skipFirstN) {
        // Add loading="eager" for above-fold images
        $img.attr('loading', 'eager');
        $img.attr('fetchpriority', 'high');
        return;
      }

      const src = $img.attr('src');
      const srcset = $img.attr('srcset');

      if (src && !src.startsWith('data:')) {
        // Use native lazy loading
        $img.attr('loading', 'lazy');
        $img.attr('decoding', 'async');

        // Add data attributes for fallback
        $img.attr('data-src', src);
        if (srcset) {
          $img.attr('data-srcset', srcset);
          $img.removeAttr('srcset');
        }

        // Set placeholder
        $img.attr(
          'src',
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E'
        );

        // Add lazy class for styling
        $img.addClass('lazy');

        // Add noscript fallback
        if (addNoscript) {
          const $noscript = $('<noscript>');
          const $fallback = $img.clone();
          $fallback.attr('src', src);
          $fallback.removeClass('lazy');
          $fallback.removeAttr('data-src');
          $fallback.removeAttr('loading');

          if (srcset) {
            $fallback.attr('srcset', srcset);
            $fallback.removeAttr('data-srcset');
          }

          $noscript.append($fallback);
          $img.after($noscript);
        }

        count++;
      }
    });

    return count;
  }

  /**
   * Process iframes for lazy loading
   */
  private processIframes($: cheerio.CheerioAPI): number {
    let count = 0;
    const iframes = $('iframe[src]').toArray();

    iframes.forEach((iframe) => {
      const $iframe = $(iframe);
      const src = $iframe.attr('src');

      if (src) {
        $iframe.attr('loading', 'lazy');
        $iframe.attr('data-src', src);
        $iframe.removeAttr('src');
        $iframe.addClass('lazy');

        count++;
      }
    });

    return count;
  }

  /**
   * Process videos for lazy loading
   */
  private processVideos($: cheerio.CheerioAPI): number {
    let count = 0;
    const videos = $('video').toArray();

    videos.forEach((video) => {
      const $video = $(video);

      // Add preload="none" to delay loading
      $video.attr('preload', 'none');

      // Process poster
      const poster = $video.attr('poster');
      if (poster) {
        $video.attr('data-poster', poster);
        $video.removeAttr('poster');
      }

      // Process source tags
      $video.find('source').each((_, source) => {
        const $source = $(source);
        const src = $source.attr('src');

        if (src) {
          $source.attr('data-src', src);
          $source.removeAttr('src');
        }
      });

      $video.addClass('lazy');
      count++;
    });

    return count;
  }

  /**
   * Inject lazy loading script
   */
  private injectLazyLoadScript($: cheerio.CheerioAPI, threshold: string): void {
    const script = `
<script>
(function() {
  'use strict';

  // Intersection Observer based lazy loading
  if ('IntersectionObserver' in window) {
    const lazyElements = document.querySelectorAll('.lazy');

    const lazyLoad = new IntersectionObserver(function(entries, observer) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          const element = entry.target;

          if (element.tagName === 'IMG') {
            // Load image
            if (element.dataset.src) {
              element.src = element.dataset.src;
            }
            if (element.dataset.srcset) {
              element.srcset = element.dataset.srcset;
            }
          } else if (element.tagName === 'IFRAME') {
            // Load iframe
            if (element.dataset.src) {
              element.src = element.dataset.src;
            }
          } else if (element.tagName === 'VIDEO') {
            // Load video
            if (element.dataset.poster) {
              element.poster = element.dataset.poster;
            }
            element.querySelectorAll('source').forEach(function(source) {
              if (source.dataset.src) {
                source.src = source.dataset.src;
              }
            });
            element.load();
          }

          element.classList.remove('lazy');
          observer.unobserve(element);
        }
      });
    }, {
      rootMargin: '${threshold}'
    });

    lazyElements.forEach(function(element) {
      lazyLoad.observe(element);
    });
  } else {
    // Fallback: load all lazy elements immediately
    const lazyElements = document.querySelectorAll('.lazy');
    lazyElements.forEach(function(element) {
      if (element.dataset.src) {
        if (element.tagName === 'IMG' || element.tagName === 'IFRAME') {
          element.src = element.dataset.src;
        }
      }
      if (element.dataset.srcset) {
        element.srcset = element.dataset.srcset;
      }
      element.classList.remove('lazy');
    });
  }

  // Add CSS for lazy loading
  const style = document.createElement('style');
  style.textContent = \`
    img.lazy {
      opacity: 0;
      transition: opacity 0.3s;
    }
    img.lazy:not(.lazy) {
      opacity: 1;
    }
  \`;
  document.head.appendChild(style);
})();
</script>
`;

    $('body').append(script);
  }

  /**
   * Analyze lazy loading opportunities
   */
  async analyzeLazyLoadOpportunities(htmlContent: string): Promise<{
    totalImages: number;
    lazyLoadableImages: number;
    totalIframes: number;
    lazyLoadableIframes: number;
    totalVideos: number;
    lazyLoadableVideos: number;
    alreadyLazy: number;
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    const recommendations: string[] = [];

    const totalImages = $('img').length;
    const totalIframes = $('iframe').length;
    const totalVideos = $('video').length;

    const alreadyLazy = $('[loading="lazy"]').length;

    // Assume first 2 images are above fold
    const lazyLoadableImages = Math.max(0, totalImages - 2);
    const lazyLoadableIframes = totalIframes;
    const lazyLoadableVideos = totalVideos;

    if (lazyLoadableImages > 0) {
      recommendations.push(
        `${lazyLoadableImages} image(s) could benefit from lazy loading`
      );
    }

    if (lazyLoadableIframes > 0) {
      recommendations.push(
        `${lazyLoadableIframes} iframe(s) should use lazy loading (especially embeds like YouTube)`
      );
    }

    if (lazyLoadableVideos > 0) {
      recommendations.push(
        `${lazyLoadableVideos} video(s) should use preload="none" to defer loading`
      );
    }

    if (totalImages > 10 && alreadyLazy === 0) {
      recommendations.push(
        'High image count with no lazy loading. This can significantly impact initial load time.'
      );
    }

    return {
      totalImages,
      lazyLoadableImages,
      totalIframes,
      lazyLoadableIframes,
      totalVideos,
      lazyLoadableVideos,
      alreadyLazy,
      recommendations,
    };
  }
}
