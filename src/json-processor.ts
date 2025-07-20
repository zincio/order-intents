interface JsonSection {
  path: string;
  data: any;
  score: number;
  relevance: string[];
}

export class JsonProcessor {
  private readonly relevanceDictionary = {
    // High Priority (score 10) - Core product data
    high: [
      'product', 'sku', 'variant', 'price', 'title', 'brand', 'name',
      'image', 'media', 'photo', 'picture', 'thumbnail', 'gallery',
      'id', 'productid', 'product_id', 'sku_id', 'item_id'
    ],
    
    // Medium Priority (score 7) - Product details
    medium: [
      'description', 'desc', 'detail', 'category', 'breadcrumb',
      'review', 'rating', 'star', 'comment', 'feedback',
      'availability', 'inventory', 'stock', 'quantity',
      'dimension', 'size', 'weight', 'color', 'flavor',
      'feature', 'benefit', 'ingredient', 'material'
    ],
    
    // Low Priority (score 3) - SEO and metadata
    low: [
      'seo', 'meta', 'canonical', 'structured', 'schema',
      'analytics', 'tracking', 'config', 'setting'
    ],
    
    // Negative (score -5) - Non-product content
    negative: [
      'ad', 'banner', 'popup', 'cookie', 'consent', 'privacy',
      'newsletter', 'social', 'share', 'comment', 'related',
      'recommendation', 'suggestion', 'promotion', 'discount'
    ]
  };

  /**
   * Extract and score relevant JSON sections
   */
  extractRelevantJsonData(jsonData: any, maxDepth: number = 3): JsonSection[] {
    const sections: JsonSection[] = [];
    
    // Process each top-level key in the JSON
    Object.entries(jsonData).forEach(([key, value]) => {
      this.extractSectionsRecursive(key, value, sections, maxDepth, 1);
    });
    
    // Sort by score (highest first) and return top sections
    return sections
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Limit to top 10 most relevant sections
  }

  /**
   * Recursively extract JSON sections with scoring
   */
  private extractSectionsRecursive(
    path: string, 
    data: any, 
    sections: JsonSection[], 
    maxDepth: number, 
    currentDepth: number
  ): void {
    if (currentDepth > maxDepth || !data || typeof data !== 'object') {
      return;
    }

    // Calculate relevance score for this path
    const score = this.calculateRelevanceScore(path, data);
    const relevance = this.getRelevanceKeywords(path, data);

    // Only include sections with positive scores
    if (score > 0) {
      // Extract key name from path for sanitizeData
      const keyName = path.split('.').pop() || path.split('[')[0];
      sections.push({
        path,
        data: this.sanitizeData(data, keyName),
        score,
        relevance
      });
    }

    // Recursively process nested objects (but not arrays)
    if (Array.isArray(data)) {
      // Process all array items, not just first 3
      data.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          this.extractSectionsRecursive(
            `${path}[${index}]`, 
            item, 
            sections, 
            maxDepth, 
            currentDepth + 1
          );
        }
      });
    } else {
      // For objects, process all keys
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          this.extractSectionsRecursive(
            `${path}.${key}`, 
            value, 
            sections, 
            maxDepth, 
            currentDepth + 1
          );
        }
      });
    }
  }

  /**
   * Calculate relevance score for a JSON section
   */
  private calculateRelevanceScore(path: string, data: any): number {
    const pathLower = path.toLowerCase();
    const dataString = JSON.stringify(data).toLowerCase();
    
    let score = 0;
    
    // Check high priority keywords
    this.relevanceDictionary.high.forEach(keyword => {
      if (pathLower.includes(keyword) || dataString.includes(keyword)) {
        score += 10;
      }
    });
    
    // Check medium priority keywords
    this.relevanceDictionary.medium.forEach(keyword => {
      if (pathLower.includes(keyword) || dataString.includes(keyword)) {
        score += 7;
      }
    });
    
    // Check low priority keywords
    this.relevanceDictionary.low.forEach(keyword => {
      if (pathLower.includes(keyword) || dataString.includes(keyword)) {
        score += 3;
      }
    });
    
    // Check negative keywords
    this.relevanceDictionary.negative.forEach(keyword => {
      if (pathLower.includes(keyword) || dataString.includes(keyword)) {
        score -= 5;
      }
    });
    
    return score;
  }

  /**
   * Get relevance keywords found in this section
   */
  private getRelevanceKeywords(path: string, data: any): string[] {
    const pathLower = path.toLowerCase();
    const dataString = JSON.stringify(data).toLowerCase();
    const keywords: string[] = [];
    
    // Check all keyword categories
    Object.entries(this.relevanceDictionary).forEach(([category, words]) => {
      words.forEach(keyword => {
        if (pathLower.includes(keyword) || dataString.includes(keyword)) {
          keywords.push(`${category}:${keyword}`);
        }
      });
    });
    
    return keywords;
  }

  /**
   * Sanitize data to remove sensitive or unnecessary information
   */
  private sanitizeData(data: any, key?: string): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    if (Array.isArray(data)) {
      // Don't truncate arrays - send all data
      return data;
    }
    
    // Special case: if this object contains a color array, preserve it
    if (typeof data === 'object' && data !== null && !Array.isArray(data) && data.color && Array.isArray(data.color)) {
      data.color = data.color; // Force preservation of color array
    }
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth'];
    // Remove unnecessary fields that don't help with product extraction
    const unnecessaryFields = [
      'analytics', 'tracking', 'debug', 'log', 'error', 'warning',
      'timestamp', 'created', 'updated', 'modified', 'version',
      'config', 'settings', 'options', 'preferences', 'user',
      'session', 'cookie', 'cache', 'temp', 'tmp', 'backup',
      'metadata', 'meta', 'seo', 'canonical', 'robots', 'sitemap',
      'breadcrumb', 'navigation', 'menu', 'header', 'footer',
      'sidebar', 'widget', 'component', 'module', 'plugin',
      'script', 'style', 'css', 'js', 'html', 'dom', 'element',
      'event', 'handler', 'callback', 'function', 'method',
      'api', 'endpoint', 'url', 'path', 'route', 'controller',
      'service', 'util', 'helper', 'tool', 'utility',
      // Additional fields to drop to make room for complete product data
      'feature', 'benefit', 'ingredient', 'material', 'dimension', 'weight', 
      'package', 'shipping', 'warranty', 'guarantee', 'return', 'refund', 'policy',
      'tag', 'label', 'manufacturer', 'comment', 'feedback'
    ];
    
    const sanitized: any = {};
    
    Object.entries(data).forEach(([key, value]) => {
      const keyLower = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field => keyLower.includes(field));
      const isUnnecessary = unnecessaryFields.some(field => keyLower.includes(field));
      
      // Special case: preserve SKU-related data even if it might match unnecessary patterns
      const isSkuRelated = keyLower.includes('sku') || keyLower.includes('variant') || keyLower.includes('product');
      
      if (!isSensitive && (!isUnnecessary || isSkuRelated)) {
        if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeData(value, key);
        } else {
          sanitized[key] = value;
        }
      }
    });
    
    return sanitized;
  }

  /**
   * Format extracted data for AI consumption
   */
  formatForAI(sections: JsonSection[]): string {
    if (sections.length === 0) {
      return 'No relevant JSON data found.';
    }

    let formatted = 'RELEVANT JSON DATA (sorted by relevance):\n\n';
    
    sections.forEach((section, index) => {
      formatted += `=== SECTION ${index + 1} (Score: ${section.score}) ===\n`;
      formatted += `Path: ${section.path}\n`;
      formatted += `Relevance: ${section.relevance.join(', ')}\n`;
      formatted += `Data:\n${JSON.stringify(section.data, null, 2)}\n\n`;
    });
    
    return formatted;
  }

  /**
   * Intelligently truncate large objects while preserving important fields
   */
  private intelligentlyTruncate(data: any, maxDepth: number = 2): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      // Don't truncate arrays - send all data
      return data.map(item => this.intelligentlyTruncate(item, maxDepth - 1));
    }

    if (maxDepth <= 0) {
      // At max depth, only keep the most important fields
      const importantFields = ['id', 'name', 'title', 'price', 'sku', 'brand', 'product', 'variant'];
      const truncated: any = {};
      
      Object.entries(data).forEach(([key, value]) => {
        const keyLower = key.toLowerCase();
        if (importantFields.some(field => keyLower.includes(field))) {
          truncated[key] = typeof value === 'object' ? '[Object]' : value;
        }
      });
      
      if (Object.keys(truncated).length === 0) {
        return '[Complex Object]';
      }
      
      return truncated;
    }

    // Recursively truncate nested objects
    const truncated: any = {};
    Object.entries(data).forEach(([key, value]) => {
      truncated[key] = this.intelligentlyTruncate(value, maxDepth - 1);
    });
    
    return truncated;
  }

  /**
   * Get token estimate for formatted data
   */
  estimateTokens(sections: JsonSection[]): number {
    const formatted = this.formatForAI(sections);
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(formatted.length / 4);
  }
} 