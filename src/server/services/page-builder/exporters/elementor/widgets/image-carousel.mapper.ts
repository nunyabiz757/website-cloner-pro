/**
 * Image Carousel Widget Mapper
 * Maps image slider/carousel components to Elementor image-carousel widget
 * Supports: Slick Slider, Swiper, Owl Carousel
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export class ImageCarouselMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const element = component.element;
    const slides = this.extractSlides(element);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'image-carousel',
      settings: {
        carousel: slides.map((slide, index) => ({
          id: this.generateUniqueId(),
          image: { url: slide.imageUrl },
          image_link: slide.link ? { url: slide.link } : {}
        })),
        slides_to_show: this.detectSlidesToShow(element),
        slides_to_scroll: '1',
        navigation: this.detectNavigation(element),
        autoplay: this.detectAutoplay(element),
        autoplay_speed: this.detectAutoplaySpeed(element),
        infinite: 'yes',
        effect: this.detectEffect(element),
        speed: 500,
        image_size: 'full'
      }
    };
  }

  private static extractSlides(element: Element): Array<{imageUrl: string; link?: string}> {
    const slides: Array<{imageUrl: string; link?: string}> = [];

    // Detect Slick Slider
    const slickSlides = element.querySelectorAll('.slick-slide img, [class*="carousel-item"] img, [class*="swiper-slide"] img');

    slickSlides.forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src) {
        const link = img.closest('a')?.getAttribute('href');
        slides.push({ imageUrl: src, link });
      }
    });

    // Fallback: get all images
    if (slides.length === 0) {
      const allImgs = element.querySelectorAll('img');
      allImgs.forEach(img => {
        const src = img.getAttribute('src');
        if (src) {
          slides.push({ imageUrl: src });
        }
      });
    }

    return slides;
  }

  private static detectSlidesToShow(element: Element): string {
    const dataSlides = element.getAttribute('data-slides-to-show') ||
                      element.getAttribute('data-items') ||
                      element.getAttribute('data-columns');
    return dataSlides || '3';
  }

  private static detectNavigation(element: Element): 'both' | 'arrows' | 'dots' | 'none' {
    const hasArrows = !!element.querySelector('.slick-arrow, .carousel-control, .swiper-button');
    const hasDots = !!element.querySelector('.slick-dots, .carousel-indicators, .swiper-pagination');

    if (hasArrows && hasDots) return 'both';
    if (hasArrows) return 'arrows';
    if (hasDots) return 'dots';
    return 'none';
  }

  private static detectAutoplay(element: Element): 'yes' | 'no' {
    const dataAutoplay = element.getAttribute('data-autoplay');
    if (dataAutoplay === 'true' || dataAutoplay === '1') return 'yes';

    // Check for Slick classes
    if (element.classList.contains('slick-autoplay')) return 'yes';

    return 'no';
  }

  private static detectAutoplaySpeed(element: Element): number {
    const dataSpeed = element.getAttribute('data-autoplay-speed') ||
                     element.getAttribute('data-speed');
    return dataSpeed ? parseInt(dataSpeed) : 3000;
  }

  private static detectEffect(element: Element): 'slide' | 'fade' {
    const dataEffect = element.getAttribute('data-effect');
    if (dataEffect === 'fade') return 'fade';

    if (element.classList.contains('fade')) return 'fade';

    return 'slide';
  }

  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default ImageCarouselMapper;
