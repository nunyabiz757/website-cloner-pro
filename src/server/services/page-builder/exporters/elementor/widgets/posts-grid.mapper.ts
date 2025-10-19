/**
 * Posts Grid Widget Mapper
 * Maps blog grid/portfolio layouts to Elementor posts widget
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export class PostsGridMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const element = component.element;

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'posts',
      settings: {
        // Layout
        posts_per_page: this.detectPostsCount(element),
        columns: this.detectColumns(element),
        columns_mobile: '1',

        // Query
        query_post_type: 'post',
        query_orderby: 'date',
        query_order: 'desc',

        // Display options
        show_image: 'yes',
        show_title: 'yes',
        show_excerpt: 'yes',
        show_read_more: 'yes',
        show_meta_data: 'yes',
        meta_data: ['date', 'author', 'comments'],

        // Image settings
        image_size: 'medium',
        image_ratio: '16_9',

        // Excerpt
        excerpt_length: 20,

        // Layout type
        layout: this.detectLayout(element),

        // Spacing
        column_gap: {
          size: 30,
          unit: 'px'
        },
        row_gap: {
          size: 30,
          unit: 'px'
        }
      }
    };
  }

  private static detectPostsCount(element: Element): number {
    const posts = element.querySelectorAll('.post, article, [class*="post-item"], [class*="blog-item"]');
    return posts.length || 6;
  }

  private static detectColumns(element: Element): string {
    const classList = element.className;

    // Check for grid classes
    if (classList.includes('col-4') || classList.includes('grid-cols-3')) return '3';
    if (classList.includes('col-3') || classList.includes('grid-cols-4')) return '4';
    if (classList.includes('col-6') || classList.includes('grid-cols-2')) return '2';
    if (classList.includes('col-12') || classList.includes('grid-cols-1')) return '1';

    // Default to 3 columns
    return '3';
  }

  private static detectLayout(element: Element): 'classic' | 'grid' | 'masonry' {
    if (element.classList.contains('masonry')) return 'masonry';
    if (element.classList.contains('grid')) return 'grid';
    return 'classic';
  }

  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default PostsGridMapper;
