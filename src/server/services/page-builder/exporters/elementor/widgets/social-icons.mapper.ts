/**
 * Social Icons Widget Mapper
 *
 * Maps recognized social media icon lists to Elementor social-icons widget
 * Supports: Font Awesome social icons, image icons, custom links
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export interface SocialIcon {
  network: string; // facebook, twitter, instagram, etc.
  url: string;
  icon: string; // Font Awesome class
  label?: string;
}

export interface SocialIconsMapping {
  icons: SocialIcon[];
  shape: 'circle' | 'square' | 'rounded';
  color: 'official' | 'custom';
  customColor?: string;
  size?: number;
  spacing?: number;
}

export class SocialIconsMapper {
  private static socialNetworks: Record<string, { icon: string; color: string }> = {
    facebook: { icon: 'fab fa-facebook-f', color: '#3b5998' },
    twitter: { icon: 'fab fa-twitter', color: '#1da1f2' },
    instagram: { icon: 'fab fa-instagram', color: '#e4405f' },
    linkedin: { icon: 'fab fa-linkedin-in', color: '#0077b5' },
    youtube: { icon: 'fab fa-youtube', color: '#ff0000' },
    pinterest: { icon: 'fab fa-pinterest-p', color: '#bd081c' },
    tiktok: { icon: 'fab fa-tiktok', color: '#000000' },
    snapchat: { icon: 'fab fa-snapchat-ghost', color: '#fffc00' },
    whatsapp: { icon: 'fab fa-whatsapp', color: '#25d366' },
    telegram: { icon: 'fab fa-telegram-plane', color: '#0088cc' },
    reddit: { icon: 'fab fa-reddit-alien', color: '#ff4500' },
    tumblr: { icon: 'fab fa-tumblr', color: '#35465c' },
    vimeo: { icon: 'fab fa-vimeo-v', color: '#1ab7ea' },
    github: { icon: 'fab fa-github', color: '#333333' },
    dribbble: { icon: 'fab fa-dribbble', color: '#ea4c89' },
    behance: { icon: 'fab fa-behance', color: '#1769ff' },
    medium: { icon: 'fab fa-medium-m', color: '#00ab6c' },
    slack: { icon: 'fab fa-slack', color: '#4a154b' },
    discord: { icon: 'fab fa-discord', color: '#7289da' },
    email: { icon: 'fas fa-envelope', color: '#ea4335' }
  };

  /**
   * Maps recognized social icons to Elementor social-icons widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'social-icons',
      settings: {
        // Social icons list
        social_icon_list: mapping.icons.map((icon, index) => ({
          _id: this.generateUniqueId(),
          social_icon: {
            value: icon.icon,
            library: 'fa-brands'
          },
          link: {
            url: icon.url,
            is_external: true,
            nofollow: false
          },
          text: icon.label || ''
        })),

        // Shape settings
        shape: mapping.shape,

        // Color scheme
        color_source: mapping.color,
        icon_primary_color: mapping.customColor || '#3b5998',

        // Size settings
        icon_size: {
          size: mapping.size || 18,
          unit: 'px'
        },
        icon_padding: {
          size: 0.5,
          unit: 'em'
        },

        // Spacing
        gap: {
          size: mapping.spacing || 10,
          unit: 'px'
        },

        // Alignment
        align: 'left',

        // Column settings (responsive)
        columns: 0, // Auto
        columns_mobile: 0 // Auto
      }
    };
  }

  /**
   * Extract mapping data from component
   */
  private static extractMapping(component: RecognizedComponent): SocialIconsMapping {
    const element = component.element;
    const styles = component.styles || {};

    return {
      icons: this.extractSocialIcons(element),
      shape: this.detectShape(element),
      color: this.detectColorScheme(element),
      customColor: styles.iconColor,
      size: styles.iconSize ? parseInt(styles.iconSize) : this.extractIconSize(element),
      spacing: styles.spacing ? parseInt(styles.spacing) : this.extractSpacing(element)
    };
  }

  /**
   * Extract social media icons and links
   */
  private static extractSocialIcons(element: Element): SocialIcon[] {
    const icons: SocialIcon[] = [];
    const links = element.querySelectorAll('a');

    links.forEach(link => {
      const href = link.getAttribute('href') || '';
      const network = this.detectNetwork(href, link);

      if (network) {
        const networkData = this.socialNetworks[network];
        icons.push({
          network,
          url: href,
          icon: networkData?.icon || 'fab fa-' + network,
          label: link.getAttribute('aria-label') || link.getAttribute('title')
        });
      }
    });

    return icons;
  }

  /**
   * Detect social network from URL or classes
   */
  private static detectNetwork(url: string, element: Element): string | null {
    // Check URL
    for (const [network] of Object.entries(this.socialNetworks)) {
      if (url.toLowerCase().includes(network)) {
        return network;
      }
    }

    // Check classes
    const classes = element.className.toLowerCase();
    for (const [network] of Object.entries(this.socialNetworks)) {
      if (classes.includes(network)) {
        return network;
      }
    }

    // Check icon classes
    const icon = element.querySelector('i');
    if (icon) {
      const iconClasses = icon.className.toLowerCase();
      for (const [network] of Object.entries(this.socialNetworks)) {
        if (iconClasses.includes(network)) {
          return network;
        }
      }
    }

    // Check for email
    if (url.startsWith('mailto:')) {
      return 'email';
    }

    return null;
  }

  /**
   * Detect icon shape
   */
  private static detectShape(element: Element): 'circle' | 'square' | 'rounded' {
    const firstLink = element.querySelector('a');
    if (firstLink instanceof HTMLElement) {
      const borderRadius = getComputedStyle(firstLink).borderRadius;
      const parsedRadius = parseInt(borderRadius);

      if (parsedRadius >= 50) {
        return 'circle';
      } else if (parsedRadius > 0 && parsedRadius < 50) {
        return 'rounded';
      }
    }

    // Check classes
    if (element.classList.contains('circle') || element.classList.contains('rounded-full')) {
      return 'circle';
    }
    if (element.classList.contains('rounded')) {
      return 'rounded';
    }

    return 'square';
  }

  /**
   * Detect color scheme
   */
  private static detectColorScheme(element: Element): 'official' | 'custom' {
    const links = element.querySelectorAll('a');
    let officialColors = 0;
    let customColors = 0;

    links.forEach(link => {
      const network = this.detectNetwork(link.getAttribute('href') || '', link);
      if (network && link instanceof HTMLElement) {
        const bgColor = getComputedStyle(link).backgroundColor;
        const expectedColor = this.socialNetworks[network]?.color;

        if (expectedColor && this.colorsMatch(bgColor, expectedColor)) {
          officialColors++;
        } else {
          customColors++;
        }
      }
    });

    return officialColors > customColors ? 'official' : 'custom';
  }

  /**
   * Check if two colors match (allowing for slight variations)
   */
  private static colorsMatch(color1: string, color2: string): boolean {
    const hex1 = this.rgbToHex(color1);
    const hex2 = color2.toLowerCase();

    return hex1.toLowerCase() === hex2;
  }

  /**
   * Extract icon size
   */
  private static extractIconSize(element: Element): number {
    const icon = element.querySelector('i, svg');
    if (icon instanceof HTMLElement) {
      const fontSize = getComputedStyle(icon).fontSize;
      return parseInt(fontSize) || 18;
    }

    return 18;
  }

  /**
   * Extract spacing between icons
   */
  private static extractSpacing(element: Element): number {
    const firstLink = element.querySelector('a');
    if (firstLink instanceof HTMLElement) {
      const marginRight = getComputedStyle(firstLink).marginRight;
      return parseInt(marginRight) || 10;
    }

    return 10;
  }

  /**
   * Convert RGB to Hex color
   */
  private static rgbToHex(rgb: string): string {
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
    return rgb;
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default SocialIconsMapper;
