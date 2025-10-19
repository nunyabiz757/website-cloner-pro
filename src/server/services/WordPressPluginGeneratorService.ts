/**
 * WordPressPluginGeneratorService
 *
 * Generates minimal custom WordPress plugins when absolutely needed:
 * - Only for complex features that can't be replicated with code
 * - Feature-specific plugin generation (custom post types, shortcodes, etc.)
 * - Plugin conflict detection and resolution
 * - Security best practices (nonces, sanitization, escaping)
 * - WordPress coding standards compliance
 */

// Plugin generation request
export interface PluginGenerationRequest {
  pluginName: string;
  pluginSlug: string;
  description: string;
  author?: string;
  authorURI?: string;
  version?: string;
  features: PluginFeature[];
  dependencies?: string[];
  conflictCheck?: boolean;
}

// Plugin feature types
export type PluginFeatureType =
  | 'custom-post-type'
  | 'custom-taxonomy'
  | 'shortcode'
  | 'widget'
  | 'rest-api-endpoint'
  | 'admin-page'
  | 'custom-fields'
  | 'cron-job'
  | 'custom-walker'
  | 'ajax-handler'
  | 'gutenberg-block'
  | 'elementor-widget'
  | 'woocommerce-extension';

export interface PluginFeature {
  type: PluginFeatureType;
  name: string;
  config: any;
  priority?: number;
  required?: boolean;
}

// Generated plugin
export interface GeneratedPlugin {
  pluginName: string;
  pluginSlug: string;
  version: string;
  files: PluginFile[];
  structure: PluginStructure;
  installation: InstallationInstructions;
  conflictReport?: ConflictReport;
  size: number;
  securityScore: number;
  complexityLevel: 'minimal' | 'moderate' | 'complex';
}

export interface PluginFile {
  path: string;
  content: string;
  type: 'php' | 'js' | 'css' | 'json' | 'readme' | 'license';
  size: number;
  description?: string;
}

export interface PluginStructure {
  rootFiles: string[];
  directories: string[];
  totalFiles: number;
  totalSize: number;
}

export interface InstallationInstructions {
  steps: string[];
  activationNotes: string[];
  configurationRequired: boolean;
  dependencies: string[];
  minimumWPVersion: string;
  minimumPHPVersion: string;
}

// Plugin conflict detection
export interface ConflictReport {
  hasConflicts: boolean;
  conflicts: PluginConflict[];
  warnings: string[];
  recommendations: string[];
}

export interface PluginConflict {
  type: 'function' | 'class' | 'constant' | 'hook' | 'post-type' | 'taxonomy' | 'shortcode';
  name: string;
  conflictsWith: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolution?: string;
}

// Custom Post Type configuration
export interface CustomPostTypeConfig {
  postType: string;
  labels: {
    name: string;
    singular_name: string;
    add_new?: string;
    add_new_item?: string;
    edit_item?: string;
    view_item?: string;
  };
  public: boolean;
  supports: string[];
  has_archive?: boolean;
  rewrite?: { slug: string };
  menu_icon?: string;
  show_in_rest?: boolean;
}

// Custom Taxonomy configuration
export interface CustomTaxonomyConfig {
  taxonomy: string;
  postTypes: string[];
  labels: {
    name: string;
    singular_name: string;
  };
  hierarchical?: boolean;
  show_in_rest?: boolean;
  rewrite?: { slug: string };
}

// Shortcode configuration
export interface ShortcodeConfig {
  tag: string;
  callback: string;
  attributes?: Record<string, any>;
  supportedContent?: boolean;
  description?: string;
}

class WordPressPluginGeneratorService {
  /**
   * Generate WordPress plugin
   */
  async generatePlugin(request: PluginGenerationRequest): Promise<GeneratedPlugin> {
    const files: PluginFile[] = [];
    const version = request.version || '1.0.0';

    // Generate main plugin file
    const mainFile = this.generateMainPluginFile(request, version);
    files.push(mainFile);

    // Generate feature files
    for (const feature of request.features) {
      const featureFiles = this.generateFeatureFiles(feature, request.pluginSlug);
      files.push(...featureFiles);
    }

    // Generate readme
    const readme = this.generateReadme(request);
    files.push(readme);

    // Generate assets if needed
    if (this.needsAssets(request.features)) {
      const assetFiles = this.generateAssets(request.pluginSlug);
      files.push(...assetFiles);
    }

    // Calculate sizes
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    // Determine complexity
    const complexityLevel = this.calculateComplexity(request.features);

    // Calculate security score
    const securityScore = this.calculateSecurityScore(files);

    // Create structure
    const structure = this.createPluginStructure(files);

    // Generate installation instructions
    const installation = this.generateInstallationInstructions(request);

    // Check conflicts
    let conflictReport: ConflictReport | undefined;
    if (request.conflictCheck) {
      conflictReport = this.detectConflicts(request);
    }

    return {
      pluginName: request.pluginName,
      pluginSlug: request.pluginSlug,
      version,
      files,
      structure,
      installation,
      conflictReport,
      size: totalSize,
      securityScore,
      complexityLevel,
    };
  }

  /**
   * Generate main plugin file
   */
  private generateMainPluginFile(request: PluginGenerationRequest, version: string): PluginFile {
    const { pluginName, pluginSlug, description, author, authorURI } = request;

    const content = `<?php
/**
 * Plugin Name: ${pluginName}
 * Plugin URI: https://example.com/${pluginSlug}
 * Description: ${description}
 * Version: ${version}
 * Author: ${author || 'Website Cloner Pro'}
 * Author URI: ${authorURI || 'https://example.com'}
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ${pluginSlug}
 * Domain Path: /languages
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('${this.toConstant(pluginSlug)}_VERSION', '${version}');
define('${this.toConstant(pluginSlug)}_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('${this.toConstant(pluginSlug)}_PLUGIN_URL', plugin_dir_url(__FILE__));
define('${this.toConstant(pluginSlug)}_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main plugin class
 */
class ${this.toPascalCase(pluginSlug)} {
    /**
     * Plugin instance
     *
     * @var ${this.toPascalCase(pluginSlug)}
     */
    private static $instance = null;

    /**
     * Get plugin instance
     *
     * @return ${this.toPascalCase(pluginSlug)}
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Activation/Deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));

        // Init hook
        add_action('init', array($this, 'init'));

        // Admin hooks
        if (is_admin()) {
            add_action('admin_menu', array($this, 'admin_menu'));
            add_action('admin_enqueue_scripts', array($this, 'admin_enqueue_scripts'));
        }

        // Frontend hooks
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
    }

    /**
     * Plugin activation
     */
    public function activate() {
        // Activation logic
        flush_rewrite_rules();
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Deactivation logic
        flush_rewrite_rules();
    }

    /**
     * Initialize plugin
     */
    public function init() {
        // Load text domain
        load_plugin_textdomain('${pluginSlug}', false, dirname(${this.toConstant(pluginSlug)}_PLUGIN_BASENAME) . '/languages');

        // Include feature files
${this.generateFeatureIncludes(request.features, pluginSlug)}
    }

    /**
     * Add admin menu
     */
    public function admin_menu() {
        add_menu_page(
            __('${pluginName}', '${pluginSlug}'),
            __('${pluginName}', '${pluginSlug}'),
            'manage_options',
            '${pluginSlug}',
            array($this, 'admin_page'),
            'dashicons-admin-generic',
            30
        );
    }

    /**
     * Admin page callback
     */
    public function admin_page() {
        if (!current_user_can('manage_options')) {
            wp_die(__('You do not have sufficient permissions to access this page.', '${pluginSlug}'));
        }

        include ${this.toConstant(pluginSlug)}_PLUGIN_DIR . 'admin/admin-page.php';
    }

    /**
     * Enqueue admin scripts
     */
    public function admin_enqueue_scripts($hook) {
        if (strpos($hook, '${pluginSlug}') === false) {
            return;
        }

        wp_enqueue_style(
            '${pluginSlug}-admin',
            ${this.toConstant(pluginSlug)}_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            ${this.toConstant(pluginSlug)}_VERSION
        );

        wp_enqueue_script(
            '${pluginSlug}-admin',
            ${this.toConstant(pluginSlug)}_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery'),
            ${this.toConstant(pluginSlug)}_VERSION,
            true
        );
    }

    /**
     * Enqueue frontend scripts
     */
    public function enqueue_scripts() {
        wp_enqueue_style(
            '${pluginSlug}',
            ${this.toConstant(pluginSlug)}_PLUGIN_URL . 'assets/css/frontend.css',
            array(),
            ${this.toConstant(pluginSlug)}_VERSION
        );

        wp_enqueue_script(
            '${pluginSlug}',
            ${this.toConstant(pluginSlug)}_PLUGIN_URL . 'assets/js/frontend.js',
            array('jquery'),
            ${this.toConstant(pluginSlug)}_VERSION,
            true
        );

        // Localize script
        wp_localize_script('${pluginSlug}', '${this.toCamelCase(pluginSlug)}Data', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('${pluginSlug}-nonce')
        ));
    }
}

/**
 * Initialize plugin
 */
function ${this.toSnakeCase(pluginSlug)}_init() {
    return ${this.toPascalCase(pluginSlug)}::get_instance();
}

// Kickoff
${this.toSnakeCase(pluginSlug)}_init();
`;

    return {
      path: `${pluginSlug}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: 'Main plugin file',
    };
  }

  /**
   * Generate feature includes
   */
  private generateFeatureIncludes(features: PluginFeature[], pluginSlug: string): string {
    const includes = features.map(feature => {
      const filename = this.getFeatureFilename(feature);
      return `        require_once ${this.toConstant(pluginSlug)}_PLUGIN_DIR . 'includes/${filename}';`;
    });

    return includes.join('\n');
  }

  /**
   * Generate feature files
   */
  private generateFeatureFiles(feature: PluginFeature, pluginSlug: string): PluginFile[] {
    const files: PluginFile[] = [];

    switch (feature.type) {
      case 'custom-post-type':
        files.push(this.generateCustomPostType(feature, pluginSlug));
        break;
      case 'custom-taxonomy':
        files.push(this.generateCustomTaxonomy(feature, pluginSlug));
        break;
      case 'shortcode':
        files.push(this.generateShortcode(feature, pluginSlug));
        break;
      case 'rest-api-endpoint':
        files.push(this.generateRESTEndpoint(feature, pluginSlug));
        break;
      case 'ajax-handler':
        files.push(this.generateAjaxHandler(feature, pluginSlug));
        break;
      case 'widget':
        files.push(this.generateWidget(feature, pluginSlug));
        break;
      case 'gutenberg-block':
        files.push(this.generateGutenbergBlock(feature, pluginSlug));
        break;
      default:
        files.push(this.generateGenericFeature(feature, pluginSlug));
    }

    return files;
  }

  /**
   * Generate custom post type
   */
  private generateCustomPostType(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config as CustomPostTypeConfig;

    const content = `<?php
/**
 * Custom Post Type: ${config.labels.name}
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register custom post type
 */
function ${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.postType)}() {
    $labels = array(
        'name'               => _x('${config.labels.name}', 'post type general name', '${pluginSlug}'),
        'singular_name'      => _x('${config.labels.singular_name}', 'post type singular name', '${pluginSlug}'),
        'menu_name'          => _x('${config.labels.name}', 'admin menu', '${pluginSlug}'),
        'name_admin_bar'     => _x('${config.labels.singular_name}', 'add new on admin bar', '${pluginSlug}'),
        'add_new'            => _x('${config.labels.add_new || 'Add New'}', '${config.postType}', '${pluginSlug}'),
        'add_new_item'       => __('${config.labels.add_new_item || 'Add New ' + config.labels.singular_name}', '${pluginSlug}'),
        'new_item'           => __('New ${config.labels.singular_name}', '${pluginSlug}'),
        'edit_item'          => __('${config.labels.edit_item || 'Edit ' + config.labels.singular_name}', '${pluginSlug}'),
        'view_item'          => __('${config.labels.view_item || 'View ' + config.labels.singular_name}', '${pluginSlug}'),
        'all_items'          => __('All ${config.labels.name}', '${pluginSlug}'),
        'search_items'       => __('Search ${config.labels.name}', '${pluginSlug}'),
        'parent_item_colon'  => __('Parent ${config.labels.name}:', '${pluginSlug}'),
        'not_found'          => __('No ${config.labels.name.toLowerCase()} found.', '${pluginSlug}'),
        'not_found_in_trash' => __('No ${config.labels.name.toLowerCase()} found in Trash.', '${pluginSlug}')
    );

    $args = array(
        'labels'             => $labels,
        'description'        => __('${config.labels.name} post type', '${pluginSlug}'),
        'public'             => ${config.public},
        'publicly_queryable' => ${config.public},
        'show_ui'            => true,
        'show_in_menu'       => true,
        'query_var'          => true,
        'rewrite'            => array('slug' => '${config.rewrite?.slug || config.postType}'),
        'capability_type'    => 'post',
        'has_archive'        => ${config.has_archive !== false},
        'hierarchical'       => false,
        'menu_position'      => null,
        'menu_icon'          => '${config.menu_icon || 'dashicons-admin-post'}',
        'show_in_rest'       => ${config.show_in_rest !== false},
        'supports'           => array(${config.supports.map(s => `'${s}'`).join(', ')})
    );

    register_post_type('${config.postType}', $args);
}
add_action('init', '${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.postType)}');
`;

    return {
      path: `includes/post-type-${config.postType}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: `Custom post type: ${config.labels.name}`,
    };
  }

  /**
   * Generate custom taxonomy
   */
  private generateCustomTaxonomy(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config as CustomTaxonomyConfig;

    const content = `<?php
/**
 * Custom Taxonomy: ${config.labels.name}
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register custom taxonomy
 */
function ${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.taxonomy)}() {
    $labels = array(
        'name'              => _x('${config.labels.name}', 'taxonomy general name', '${pluginSlug}'),
        'singular_name'     => _x('${config.labels.singular_name}', 'taxonomy singular name', '${pluginSlug}'),
        'search_items'      => __('Search ${config.labels.name}', '${pluginSlug}'),
        'all_items'         => __('All ${config.labels.name}', '${pluginSlug}'),
        'parent_item'       => __('Parent ${config.labels.singular_name}', '${pluginSlug}'),
        'parent_item_colon' => __('Parent ${config.labels.singular_name}:', '${pluginSlug}'),
        'edit_item'         => __('Edit ${config.labels.singular_name}', '${pluginSlug}'),
        'update_item'       => __('Update ${config.labels.singular_name}', '${pluginSlug}'),
        'add_new_item'      => __('Add New ${config.labels.singular_name}', '${pluginSlug}'),
        'new_item_name'     => __('New ${config.labels.singular_name} Name', '${pluginSlug}'),
        'menu_name'         => __('${config.labels.name}', '${pluginSlug}'),
    );

    $args = array(
        'labels'            => $labels,
        'hierarchical'      => ${config.hierarchical !== false},
        'public'            => true,
        'show_ui'           => true,
        'show_admin_column' => true,
        'query_var'         => true,
        'rewrite'           => array('slug' => '${config.rewrite?.slug || config.taxonomy}'),
        'show_in_rest'      => ${config.show_in_rest !== false},
    );

    register_taxonomy('${config.taxonomy}', array(${config.postTypes.map(pt => `'${pt}'`).join(', ')}), $args);
}
add_action('init', '${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.taxonomy)}', 0);
`;

    return {
      path: `includes/taxonomy-${config.taxonomy}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: `Custom taxonomy: ${config.labels.name}`,
    };
  }

  /**
   * Generate shortcode
   */
  private generateShortcode(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config as ShortcodeConfig;

    const content = `<?php
/**
 * Shortcode: [${config.tag}]
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Shortcode callback
 *
 * @param array $atts Shortcode attributes
 * @param string $content Shortcode content
 * @return string
 */
function ${this.toSnakeCase(pluginSlug)}_${this.toSnakeCase(config.tag)}_shortcode($atts = array(), $content = null) {
    // Parse attributes
    $atts = shortcode_atts(
        array(
${Object.entries(config.attributes || {}).map(([key, value]) => `            '${key}' => '${value}',`).join('\n')}
        ),
        $atts,
        '${config.tag}'
    );

    // Sanitize attributes
${Object.keys(config.attributes || {}).map(key => `    $atts['${key}'] = sanitize_text_field($atts['${key}']);`).join('\n')}

    // Start output buffering
    ob_start();

    ?>
    <div class="${pluginSlug}-${config.tag}">
        <!-- Shortcode output here -->
        ${config.supportedContent ? '<?php echo do_shortcode($content); ?>' : ''}
    </div>
    <?php

    return ob_get_clean();
}
add_shortcode('${config.tag}', '${this.toSnakeCase(pluginSlug)}_${this.toSnakeCase(config.tag)}_shortcode');
`;

    return {
      path: `includes/shortcode-${config.tag}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: `Shortcode: [${config.tag}]`,
    };
  }

  /**
   * Generate REST API endpoint
   */
  private generateRESTEndpoint(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config;

    const content = `<?php
/**
 * REST API Endpoint
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register REST API routes
 */
function ${this.toSnakeCase(pluginSlug)}_register_rest_routes() {
    register_rest_route('${pluginSlug}/v1', '/${config.endpoint}', array(
        'methods'             => '${config.method || 'GET'}',
        'callback'            => '${this.toSnakeCase(pluginSlug)}_rest_${this.toSnakeCase(config.endpoint)}',
        'permission_callback' => '${this.toSnakeCase(pluginSlug)}_rest_permission_check',
    ));
}
add_action('rest_api_init', '${this.toSnakeCase(pluginSlug)}_register_rest_routes');

/**
 * REST API callback
 *
 * @param WP_REST_Request $request Request object
 * @return WP_REST_Response|WP_Error
 */
function ${this.toSnakeCase(pluginSlug)}_rest_${this.toSnakeCase(config.endpoint)}($request) {
    // Get parameters
    $params = $request->get_params();

    // Process request
    $data = array(
        'success' => true,
        'message' => 'API endpoint working',
    );

    return rest_ensure_response($data);
}

/**
 * Permission check
 *
 * @return bool
 */
function ${this.toSnakeCase(pluginSlug)}_rest_permission_check() {
    ${config.requireAuth ? 'return current_user_can(\'edit_posts\');' : 'return true;'}
}
`;

    return {
      path: `includes/rest-api.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: 'REST API endpoint',
    };
  }

  /**
   * Generate AJAX handler
   */
  private generateAjaxHandler(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config;

    const content = `<?php
/**
 * AJAX Handler
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * AJAX callback
 */
function ${this.toSnakeCase(pluginSlug)}_ajax_${this.toSnakeCase(config.action)}() {
    // Check nonce
    check_ajax_referer('${pluginSlug}-nonce', 'nonce');

    // Check capabilities
    if (!current_user_can('edit_posts')) {
        wp_send_json_error(array('message' => __('Unauthorized', '${pluginSlug}')));
    }

    // Get POST data
    $data = isset($_POST['data']) ? sanitize_text_field($_POST['data']) : '';

    // Process request
    $result = array(
        'success' => true,
        'message' => __('Action completed successfully', '${pluginSlug}'),
        'data'    => $data,
    );

    wp_send_json_success($result);
}
add_action('wp_ajax_${pluginSlug}_${config.action}', '${this.toSnakeCase(pluginSlug)}_ajax_${this.toSnakeCase(config.action)}');
${config.nopriv ? `add_action('wp_ajax_nopriv_${pluginSlug}_${config.action}', '${this.toSnakeCase(pluginSlug)}_ajax_${this.toSnakeCase(config.action)}');` : ''}
`;

    return {
      path: `includes/ajax-handlers.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: 'AJAX handler',
    };
  }

  /**
   * Generate widget
   */
  private generateWidget(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config;

    const content = `<?php
/**
 * Widget: ${config.name}
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * ${config.name} Widget
 */
class ${this.toPascalCase(pluginSlug)}_${this.toPascalCase(config.widgetId)}_Widget extends WP_Widget {
    /**
     * Constructor
     */
    public function __construct() {
        parent::__construct(
            '${pluginSlug}_${config.widgetId}',
            __('${config.name}', '${pluginSlug}'),
            array('description' => __('${config.description}', '${pluginSlug}'))
        );
    }

    /**
     * Front-end display
     */
    public function widget($args, $instance) {
        echo $args['before_widget'];

        if (!empty($instance['title'])) {
            echo $args['before_title'] . apply_filters('widget_title', $instance['title']) . $args['after_title'];
        }

        // Widget output
        echo '<div class="${pluginSlug}-widget">';
        echo esc_html($instance['content']);
        echo '</div>';

        echo $args['after_widget'];
    }

    /**
     * Back-end widget form
     */
    public function form($instance) {
        $title = !empty($instance['title']) ? $instance['title'] : '';
        $content = !empty($instance['content']) ? $instance['content'] : '';
        ?>
        <p>
            <label for="<?php echo esc_attr($this->get_field_id('title')); ?>">
                <?php _e('Title:', '${pluginSlug}'); ?>
            </label>
            <input class="widefat" id="<?php echo esc_attr($this->get_field_id('title')); ?>"
                   name="<?php echo esc_attr($this->get_field_name('title')); ?>" type="text"
                   value="<?php echo esc_attr($title); ?>">
        </p>
        <p>
            <label for="<?php echo esc_attr($this->get_field_id('content')); ?>">
                <?php _e('Content:', '${pluginSlug}'); ?>
            </label>
            <textarea class="widefat" id="<?php echo esc_attr($this->get_field_id('content')); ?>"
                      name="<?php echo esc_attr($this->get_field_name('content')); ?>"
                      rows="5"><?php echo esc_textarea($content); ?></textarea>
        </p>
        <?php
    }

    /**
     * Update widget settings
     */
    public function update($new_instance, $old_instance) {
        $instance = array();
        $instance['title'] = !empty($new_instance['title']) ? sanitize_text_field($new_instance['title']) : '';
        $instance['content'] = !empty($new_instance['content']) ? sanitize_textarea_field($new_instance['content']) : '';
        return $instance;
    }
}

/**
 * Register widget
 */
function ${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.widgetId)}_widget() {
    register_widget('${this.toPascalCase(pluginSlug)}_${this.toPascalCase(config.widgetId)}_Widget');
}
add_action('widgets_init', '${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.widgetId)}_widget');
`;

    return {
      path: `includes/widget-${config.widgetId}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: `Widget: ${config.name}`,
    };
  }

  /**
   * Generate Gutenberg block
   */
  private generateGutenbergBlock(feature: PluginFeature, pluginSlug: string): PluginFile {
    const config = feature.config;

    const content = `<?php
/**
 * Gutenberg Block: ${config.name}
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register Gutenberg block
 */
function ${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.blockName)}_block() {
    if (!function_exists('register_block_type')) {
        return;
    }

    wp_register_script(
        '${pluginSlug}-${config.blockName}-block',
        ${this.toConstant(pluginSlug)}_PLUGIN_URL . 'blocks/${config.blockName}/block.js',
        array('wp-blocks', 'wp-element', 'wp-editor'),
        ${this.toConstant(pluginSlug)}_VERSION
    );

    register_block_type('${pluginSlug}/${config.blockName}', array(
        'editor_script' => '${pluginSlug}-${config.blockName}-block',
    ));
}
add_action('init', '${this.toSnakeCase(pluginSlug)}_register_${this.toSnakeCase(config.blockName)}_block');
`;

    return {
      path: `includes/block-${config.blockName}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: `Gutenberg block: ${config.name}`,
    };
  }

  /**
   * Generate generic feature
   */
  private generateGenericFeature(feature: PluginFeature, pluginSlug: string): PluginFile {
    const content = `<?php
/**
 * Feature: ${feature.name}
 *
 * @package ${this.toPascalCase(pluginSlug)}
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Feature implementation
`;

    return {
      path: `includes/feature-${this.toKebabCase(feature.name)}.php`,
      content,
      type: 'php',
      size: Buffer.byteLength(content, 'utf8'),
      description: `Feature: ${feature.name}`,
    };
  }

  /**
   * Get feature filename
   */
  private getFeatureFilename(feature: PluginFeature): string {
    switch (feature.type) {
      case 'custom-post-type':
        return `post-type-${(feature.config as CustomPostTypeConfig).postType}.php`;
      case 'custom-taxonomy':
        return `taxonomy-${(feature.config as CustomTaxonomyConfig).taxonomy}.php`;
      case 'shortcode':
        return `shortcode-${(feature.config as ShortcodeConfig).tag}.php`;
      case 'rest-api-endpoint':
        return 'rest-api.php';
      case 'ajax-handler':
        return 'ajax-handlers.php';
      case 'widget':
        return `widget-${feature.config.widgetId}.php`;
      case 'gutenberg-block':
        return `block-${feature.config.blockName}.php`;
      default:
        return `feature-${this.toKebabCase(feature.name)}.php`;
    }
  }

  /**
   * Generate README
   */
  private generateReadme(request: PluginGenerationRequest): PluginFile {
    const content = `=== ${request.pluginName} ===
Contributors: ${request.author || 'websiteclonerpro'}
Tags: custom
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: ${request.version || '1.0.0'}
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

${request.description}

== Description ==

${request.description}

This plugin was generated by Website Cloner Pro to preserve complex features that require custom functionality.

== Features ==

${request.features.map(f => `* ${f.name}`).join('\n')}

== Installation ==

1. Upload the plugin files to \`/wp-content/plugins/${request.pluginSlug}/\`
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Configure settings through the plugin's admin page

== Changelog ==

= ${request.version || '1.0.0'} =
* Initial release
* Generated by Website Cloner Pro
`;

    return {
      path: 'readme.txt',
      content,
      type: 'readme',
      size: Buffer.byteLength(content, 'utf8'),
      description: 'Plugin readme file',
    };
  }

  /**
   * Check if assets are needed
   */
  private needsAssets(features: PluginFeature[]): boolean {
    return features.some(f =>
      ['gutenberg-block', 'elementor-widget', 'admin-page', 'widget'].includes(f.type)
    );
  }

  /**
   * Generate assets
   */
  private generateAssets(pluginSlug: string): PluginFile[] {
    const files: PluginFile[] = [];

    // Admin CSS
    const adminCSS = `/* Admin styles for ${pluginSlug} */
.${pluginSlug}-admin {
    padding: 20px;
}
`;
    files.push({
      path: 'assets/css/admin.css',
      content: adminCSS,
      type: 'css',
      size: Buffer.byteLength(adminCSS, 'utf8'),
    });

    // Frontend CSS
    const frontendCSS = `/* Frontend styles for ${pluginSlug} */
.${pluginSlug} {
    display: block;
}
`;
    files.push({
      path: 'assets/css/frontend.css',
      content: frontendCSS,
      type: 'css',
      size: Buffer.byteLength(frontendCSS, 'utf8'),
    });

    // Admin JS
    const adminJS = `/* Admin scripts for ${pluginSlug} */
(function($) {
    'use strict';
    $(document).ready(function() {
        console.log('${pluginSlug} admin loaded');
    });
})(jQuery);
`;
    files.push({
      path: 'assets/js/admin.js',
      content: adminJS,
      type: 'js',
      size: Buffer.byteLength(adminJS, 'utf8'),
    });

    // Frontend JS
    const frontendJS = `/* Frontend scripts for ${pluginSlug} */
(function($) {
    'use strict';
    $(document).ready(function() {
        console.log('${pluginSlug} loaded');
    });
})(jQuery);
`;
    files.push({
      path: 'assets/js/frontend.js',
      content: frontendJS,
      type: 'js',
      size: Buffer.byteLength(frontendJS, 'utf8'),
    });

    return files;
  }

  /**
   * Calculate complexity
   */
  private calculateComplexity(features: PluginFeature[]): 'minimal' | 'moderate' | 'complex' {
    if (features.length <= 2) return 'minimal';
    if (features.length <= 5) return 'moderate';
    return 'complex';
  }

  /**
   * Calculate security score
   */
  private calculateSecurityScore(files: PluginFile[]): number {
    let score = 100;
    const phpFiles = files.filter(f => f.type === 'php');

    for (const file of phpFiles) {
      // Check for security best practices
      if (!file.content.includes('defined(\'ABSPATH\')')) score -= 10;
      if (!file.content.includes('sanitize_') && file.content.includes('$_POST')) score -= 10;
      if (!file.content.includes('esc_') && file.content.includes('echo')) score -= 5;
      if (file.content.includes('check_ajax_referer') || file.content.includes('wp_verify_nonce')) score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Create plugin structure
   */
  private createPluginStructure(files: PluginFile[]): PluginStructure {
    const directories = new Set<string>();
    const rootFiles: string[] = [];

    files.forEach(file => {
      const parts = file.path.split('/');
      if (parts.length > 1) {
        let dir = '';
        for (let i = 0; i < parts.length - 1; i++) {
          dir = dir ? `${dir}/${parts[i]}` : parts[i];
          directories.add(dir);
        }
      } else {
        rootFiles.push(file.path);
      }
    });

    return {
      rootFiles,
      directories: Array.from(directories).sort(),
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    };
  }

  /**
   * Generate installation instructions
   */
  private generateInstallationInstructions(request: PluginGenerationRequest): InstallationInstructions {
    const steps = [
      'Upload the plugin folder to /wp-content/plugins/',
      'Activate the plugin through the WordPress admin',
      'Visit the plugin settings page to configure',
    ];

    const activationNotes = [
      'The plugin will flush rewrite rules on activation',
    ];

    if (request.features.some(f => f.type === 'custom-post-type')) {
      activationNotes.push('Custom post types will be registered');
      activationNotes.push('Visit Settings > Permalinks to refresh rewrite rules if needed');
    }

    return {
      steps,
      activationNotes,
      configurationRequired: request.features.length > 0,
      dependencies: request.dependencies || [],
      minimumWPVersion: '5.0',
      minimumPHPVersion: '7.4',
    };
  }

  /**
   * Detect conflicts
   */
  detectConflicts(request: PluginGenerationRequest): ConflictReport {
    const conflicts: PluginConflict[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check for common post type conflicts
    request.features.forEach(feature => {
      if (feature.type === 'custom-post-type') {
        const config = feature.config as CustomPostTypeConfig;
        const commonPostTypes = ['post', 'page', 'attachment', 'revision', 'nav_menu_item', 'product'];

        if (commonPostTypes.includes(config.postType)) {
          conflicts.push({
            type: 'post-type',
            name: config.postType,
            conflictsWith: ['WordPress Core'],
            severity: 'critical',
            resolution: `Use a different post type name (e.g., '${request.pluginSlug}_${config.postType}')`,
          });
        }

        if (config.postType.length < 3) {
          warnings.push(`Post type '${config.postType}' is very short - consider using a longer, more descriptive name`);
        }
      }

      if (feature.type === 'shortcode') {
        const config = feature.config as ShortcodeConfig;
        const commonShortcodes = ['gallery', 'caption', 'audio', 'video', 'embed'];

        if (commonShortcodes.includes(config.tag)) {
          conflicts.push({
            type: 'shortcode',
            name: config.tag,
            conflictsWith: ['WordPress Core'],
            severity: 'high',
            resolution: `Use a different shortcode tag (e.g., '${request.pluginSlug}_${config.tag}')`,
          });
        }
      }
    });

    // Add recommendations
    recommendations.push('Use unique prefixes for all custom features');
    recommendations.push('Test the plugin on a staging site before production');
    recommendations.push('Check for conflicts with existing plugins');

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      warnings,
      recommendations,
    };
  }

  // Utility functions
  private toPascalCase(str: string): string {
    return str.split(/[-_]/).map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('');
  }

  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[-\s]/g, '_').toLowerCase();
  }

  private toKebabCase(str: string): string {
    return str.replace(/[_\s]/g, '-').toLowerCase();
  }

  private toConstant(str: string): string {
    return this.toSnakeCase(str).toUpperCase();
  }
}

// Export singleton instance
export default new WordPressPluginGeneratorService();
