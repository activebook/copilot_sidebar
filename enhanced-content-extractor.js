// Enhanced Content Extractor - Robust content extraction for news media
// Implements multi-layered filtering, semantic analysis, and noise detection

/**
 * Enhanced content extraction system that goes beyond simple length-based heuristics
 * to provide robust main content detection for news media sites.
 */
class EnhancedContentExtractor {
  constructor(config = {}) {
    this.config = {
      mode: config.mode || 'balanced', // strict, balanced, comprehensive
      enableSemanticAnalysis: config.enableSemanticAnalysis !== false,
      enableNoiseFiltering: config.enableNoiseFiltering !== false,
      enableBoundaryDetection: config.enableBoundaryDetection !== false,
      minContentScore: config.minContentScore || this.getDefaultMinScore(config.mode),
      noiseThreshold: config.noiseThreshold || this.getDefaultNoiseThreshold(config.mode),
      ...config
    };
    
    this.semanticAnalyzer = new SemanticAnalyzer();
    this.noiseDetector = new NoiseDetector();
    this.contentScorer = new ContentScorer();
    this.boundaryDetector = new BoundaryDetector();
  }
  
  getDefaultMinScore(mode) {
    const defaults = { strict: 0.8, balanced: 0.6, comprehensive: 0.4 };
    return defaults[mode] || 0.6;
  }
  
  getDefaultNoiseThreshold(mode) {
    const defaults = { strict: 0.3, balanced: 0.5, comprehensive: 0.7 };
    return defaults[mode] || 0.5;
  }
  
  /**
   * Main extraction method - processes DOM and returns structured content
   */
  extractMainContent(rootElement = document.body) {
    try {
      // Layer 1: Preprocessing
      const preprocessed = this.preprocessDOM(rootElement);
      
      // Layer 2: Semantic Analysis
      const semanticCandidates = this.config.enableSemanticAnalysis 
        ? this.semanticAnalyzer.findCandidates(preprocessed.cleanedElements)
        : this.findBasicCandidates(preprocessed.cleanedElements);
      
      // Layer 3: Noise Detection and Filtering
      const filteredCandidates = this.config.enableNoiseFiltering
        ? this.noiseDetector.filterCandidates(semanticCandidates, this.config.noiseThreshold)
        : semanticCandidates;
      
      // Layer 4: Content Scoring
      const scoredCandidates = this.contentScorer.scoreCandidates(filteredCandidates, this.config);
      
      // Layer 5: Boundary Detection
      const bestCandidate = scoredCandidates[0];
      if (!bestCandidate || bestCandidate.finalScore < this.config.minContentScore) {
        return this.fallbackExtraction(rootElement);
      }
      
      const boundaryResult = this.config.enableBoundaryDetection
        ? this.boundaryDetector.detectBoundaries(bestCandidate)
        : { element: bestCandidate.element, boundaries: [] };
      
      // Layer 6: Post-processing
      const finalContent = this.postProcess(boundaryResult);
      
      return {
        success: true,
        content: finalContent,
        metadata: this.extractMetadata(finalContent, bestCandidate),
        extractionMethod: 'enhanced',
        confidence: bestCandidate.confidence || 0.8
      };
      
    } catch (error) {
      console.warn('Enhanced extraction failed:', error);
      return this.fallbackExtraction(rootElement);
    }
  }
  
  /**
   * Layer 1: Preprocessing - Clean and prepare DOM
   */
  preprocessDOM(rootElement) {
    const cleanedElements = [];
    const elementMetadata = new Map();
    
    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (this.isHidden(node) || this.isNonContentElement(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while ((node = walker.nextNode())) {
      cleanedElements.push(node);
      elementMetadata.set(node, this.generateElementMetadata(node));
    }
    
    return { cleanedElements, elementMetadata };
  }
  
  generateElementMetadata(element) {
    const rect = element.getBoundingClientRect();
    return {
      textLength: element.textContent.trim().length,
      htmlLength: element.innerHTML.length,
      childCount: element.children.length,
      depth: this.getElementDepth(element),
      position: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      tagName: element.tagName.toLowerCase()
    };
  }
  
  getElementDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentElement && current !== document.body) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }
  
  /**
   * Basic candidate finding for fallback scenarios
   */
  findBasicCandidates(elements) {
    const candidates = [];
    const contentSelectors = [
      'article', 'main', '.content', '.post-content', '.article-content', 
      '.entry-content', '#content', '.main-content', '.story-body'
    ];
    
    // Try semantic selectors first
    for (const selector of contentSelectors) {
      const matches = document.querySelectorAll(selector);
      for (const element of matches) {
        if (elements.includes(element)) {
          candidates.push({
            element,
            source: 'semantic-selector',
            confidence: 0.7
          });
        }
      }
      if (candidates.length > 0) break;
    }
    
    // Fallback to content-dense elements
    if (candidates.length === 0) {
      const contentDenseElements = elements
        .filter(el => el.textContent.trim().length > 200)
        .sort((a, b) => b.textContent.trim().length - a.textContent.trim().length)
        .slice(0, 5);
      
      candidates.push(...contentDenseElements.map(element => ({
        element,
        source: 'content-density',
        confidence: 0.5
      })));
    }
    
    return candidates;
  }
  
  /**
   * Fallback extraction using current approach
   */
  fallbackExtraction(rootElement) {
    console.log('Using fallback extraction method');
    
    try {
      // Use the existing findMainContentElement logic as fallback
      const mainElement = this.findMainContentElementFallback(rootElement);
      if (mainElement) {
        return {
          success: true,
          content: mainElement,
          metadata: this.extractBasicMetadata(mainElement),
          extractionMethod: 'fallback',
          confidence: 0.4
        };
      }
    } catch (error) {
      console.error('Fallback extraction failed:', error);
    }
    
    return {
      success: false,
      content: null,
      metadata: {},
      extractionMethod: 'failed',
      confidence: 0
    };
  }
  
  findMainContentElementFallback(rootElement) {
    let bestElement = null;
    let bestScore = 0;
    
    const contentSelectors = [
      'article', 'main', '.content', '.post-content', '.article-content', 
      '.entry-content', '#content', '.main-content'
    ];
    
    for (const selector of contentSelectors) {
      const elements = rootElement.querySelectorAll(selector);
      for (const element of elements) {
        if (this.isHidden(element)) continue;
        const score = element.textContent.trim().length;
        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      }
      if (bestScore > 1000) break;
    }
    
    return bestElement;
  }
  
  /**
   * Post-processing - Final cleanup and optimization
   */
  postProcess(boundaryResult) {
    const element = boundaryResult.element;
    const boundaries = boundaryResult.boundaries || [];
    
    // Create a clean copy
    const cleanElement = element.cloneNode(true);
    
    // Remove content after boundaries
    if (boundaries.length > 0) {
      const firstBoundary = boundaries[0];
      const boundaryClone = cleanElement.querySelector(this.getElementSelector(firstBoundary));
      if (boundaryClone) {
        // Remove everything after the boundary
        let nextSibling = boundaryClone.nextSibling;
        while (nextSibling) {
          const toRemove = nextSibling;
          nextSibling = nextSibling.nextSibling;
          if (toRemove.parentNode) {
            toRemove.parentNode.removeChild(toRemove);
          }
        }
        // Remove the boundary element itself
        if (boundaryClone.parentNode) {
          boundaryClone.parentNode.removeChild(boundaryClone);
        }
      }
    }
    
    // Clean up empty elements
    this.removeEmptyElements(cleanElement);
    
    // Normalize whitespace
    this.normalizeWhitespace(cleanElement);
    
    return cleanElement;
  }
  
  removeEmptyElements(element) {
    const emptyElements = element.querySelectorAll('p:empty, div:empty, span:empty');
    emptyElements.forEach(el => {
      if (el.parentNode && !el.querySelector('img, video, iframe')) {
        el.parentNode.removeChild(el);
      }
    });
  }
  
  normalizeWhitespace(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue) {
        node.nodeValue = node.nodeValue.replace(/\s+/g, ' ');
      }
    }
  }
  
  getElementSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) return `.${classes[0]}`;
    }
    return element.tagName.toLowerCase();
  }
  
  /**
   * Extract metadata from the final content
   */
  extractMetadata(content, candidate) {
    const metadata = {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      extractionScore: candidate.finalScore || 0,
      extractionConfidence: candidate.confidence || 0,
      contentLength: content.textContent.trim().length,
      elementCount: content.querySelectorAll('*').length
    };
    
    // Extract article-specific metadata
    const headline = content.querySelector('h1, .headline, .title');
    if (headline) {
      metadata.headline = headline.textContent.trim();
    }
    
    const author = content.querySelector('.author, .byline, [rel="author"]');
    if (author) {
      metadata.author = author.textContent.trim();
    }
    
    const publishDate = content.querySelector('time, .date, [datetime]');
    if (publishDate) {
      metadata.publishDate = publishDate.getAttribute('datetime') || publishDate.textContent.trim();
    }
    
    return metadata;
  }
  
  extractBasicMetadata(element) {
    return {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      contentLength: element.textContent.trim().length,
      elementCount: element.querySelectorAll('*').length
    };
  }
  
  /**
   * Utility methods
   */
  isHidden(element) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
    const rect = element.getBoundingClientRect();
    return rect.width === 0 || rect.height === 0;
  }
  
  isNonContentElement(element) {
    const tagName = element.tagName.toLowerCase();
    return ['script', 'style', 'noscript', 'template', 'meta', 'link'].includes(tagName);
  }
}

/**
 * Semantic Analysis Component
 */
class SemanticAnalyzer {
  constructor() {
    this.semanticElements = {
      article: { weight: 0.9, description: 'Self-contained content' },
      main: { weight: 0.95, description: 'Main content of document' },
      section: { weight: 0.6, description: 'Thematic grouping' }
    };
    
    this.landmarkRoles = {
      main: { weight: 0.95, description: 'Main content landmark' },
      article: { weight: 0.8, description: 'Article content' },
      region: { weight: 0.6, description: 'Significant content region' }
    };
    
    this.articleTypes = {
      'Article': { weight: 0.8 },
      'NewsArticle': { weight: 0.9 },
      'BlogPosting': { weight: 0.85 }
    };
  }
  
  findCandidates(elements) {
    const candidates = [];
    
    for (const element of elements) {
      const analysis = this.analyzeElement(element);
      if (analysis.semanticScore > 0.3) {
        candidates.push({
          element,
          semanticScore: analysis.semanticScore,
          confidence: analysis.confidence,
          semanticDetails: analysis
        });
      }
    }
    
    return candidates.sort((a, b) => b.semanticScore - a.semanticScore);
  }
  
  analyzeElement(element) {
    let semanticScore = 0;
    let confidence = 0.5;
    const details = {};
    
    // HTML5 semantic elements
    const tagName = element.tagName.toLowerCase();
    if (this.semanticElements[tagName]) {
      const semantic = this.semanticElements[tagName];
      semanticScore += semantic.weight;
      confidence += 0.2;
      details.semanticElement = { tagName, weight: semantic.weight };
    }
    
    // ARIA roles
    const role = element.getAttribute('role');
    if (role && this.landmarkRoles[role]) {
      const landmark = this.landmarkRoles[role];
      semanticScore += landmark.weight;
      confidence += 0.15;
      details.ariaRole = { role, weight: landmark.weight };
    }
    
    // Schema.org markup
    const itemType = element.getAttribute('itemtype');
    if (itemType) {
      const types = itemType.split(/\s+/);
      for (const type of types) {
        const typeName = type.split('/').pop();
        if (this.articleTypes[typeName]) {
          semanticScore += this.articleTypes[typeName].weight;
          confidence += 0.1;
          details.schemaType = { type: typeName, weight: this.articleTypes[typeName].weight };
          break;
        }
      }
    }
    
    // Content-specific classes
    const className = (element.className || '').toLowerCase();
    if (/article|content|post|entry|story/.test(className)) {
      semanticScore += 0.5;
      confidence += 0.1;
      details.contentClass = true;
    }
    
    return {
      semanticScore: Math.min(semanticScore, 1.0),
      confidence: Math.min(confidence, 1.0),
      details
    };
  }
}

/**
 * Noise Detection Component
 */
class NoiseDetector {
  constructor() {
    this.noisePatterns = {
      classNames: [
        /trending|popular|related|recommended/i,
        /sidebar|aside|widget|ad|advertisement/i,
        /social|share|comment|newsletter/i,
        /navigation|nav|menu|breadcrumb/i,
        /footer|header|banner|promo/i
      ],
      
      contentPatterns: [
        /^(trending|popular|related|more from)/i,
        /^(advertisement|sponsored|promoted)/i,
        /^(subscribe|newsletter|follow us)/i
      ],
      
      elementTypes: ['nav', 'aside', 'footer', 'header']
    };
  }
  
  filterCandidates(candidates, threshold) {
    return candidates.map(candidate => {
      const noiseScore = this.calculateNoiseScore(candidate.element);
      return {
        ...candidate,
        noiseScore,
        isNoise: noiseScore > threshold
      };
    }).filter(candidate => !candidate.isNoise);
  }
  
  calculateNoiseScore(element) {
    let noiseScore = 0;
    
    // Check element type
    const tagName = element.tagName.toLowerCase();
    if (this.noisePatterns.elementTypes.includes(tagName)) {
      noiseScore += 0.8;
    }
    
    // Check class names and IDs
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const combined = className + ' ' + id;
    
    for (const pattern of this.noisePatterns.classNames) {
      if (pattern.test(combined)) {
        noiseScore += 0.6;
        break;
      }
    }
    
    // Check content patterns
    const text = element.textContent.trim().toLowerCase();
    for (const pattern of this.noisePatterns.contentPatterns) {
      if (pattern.test(text)) {
        noiseScore += 0.7;
        break;
      }
    }
    
    // Check structural indicators
    const linkCount = element.querySelectorAll('a').length;
    const textLength = text.length;
    if (textLength > 0) {
      const linkDensity = linkCount / (textLength / 100);
      if (linkDensity > 0.5) noiseScore += 0.3;
    }
    
    return Math.min(noiseScore, 1.0);
  }
}

/**
 * Content Scoring Component
 */
class ContentScorer {
  constructor() {
    this.weights = {
      textQuality: 0.25,
      contentDensity: 0.20,
      articleStructure: 0.20,
      semanticScore: 0.15,
      positionScore: 0.10,
      metadataScore: 0.10
    };
  }
  
  scoreCandidates(candidates, config) {
    return candidates.map(candidate => {
      const scores = this.calculateAllScores(candidate.element);
      const finalScore = this.calculateFinalScore(scores, candidate);
      
      return {
        ...candidate,
        ...scores,
        finalScore,
        confidence: Math.min((candidate.confidence || 0.5) + finalScore * 0.3, 1.0)
      };
    }).sort((a, b) => b.finalScore - a.finalScore);
  }
  
  calculateAllScores(element) {
    return {
      textQuality: this.calculateTextQuality(element),
      contentDensity: this.calculateContentDensity(element),
      articleStructure: this.calculateArticleStructure(element),
      positionScore: this.calculatePositionScore(element),
      metadataScore: this.calculateMetadataScore(element)
    };
  }
  
  calculateFinalScore(scores, candidate) {
    let totalScore = 0;
    
    // Apply weights to component scores
    for (const [component, score] of Object.entries(scores)) {
      if (this.weights[component]) {
        totalScore += score * this.weights[component];
      }
    }
    
    // Add semantic score
    totalScore += (candidate.semanticScore || 0) * this.weights.semanticScore;
    
    // Apply noise penalty
    const noisePenalty = (candidate.noiseScore || 0) * 0.5;
    totalScore *= (1 - noisePenalty);
    
    return Math.max(0, Math.min(1, totalScore));
  }
  
  calculateTextQuality(element) {
    const text = element.textContent.trim();
    const paragraphs = Array.from(element.querySelectorAll('p'));
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) return 0;
    
    let score = 0;
    
    // Sentence length scoring
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
    if (avgSentenceLength >= 15 && avgSentenceLength <= 25) score += 0.3;
    else if (avgSentenceLength >= 10 && avgSentenceLength <= 35) score += 0.2;
    
    // Paragraph structure
    if (paragraphs.length >= 3) score += 0.2;
    
    // Text quality indicators
    const properSentences = sentences.filter(s => /^[A-Z]/.test(s.trim()) && /[.!?]$/.test(s.trim())).length;
    score += (properSentences / sentences.length) * 0.3;
    
    // Content length
    if (text.length > 500) score += 0.2;
    
    return Math.min(score, 1.0);
  }
  
  calculateContentDensity(element) {
    const textLength = element.textContent.trim().length;
    const htmlLength = element.innerHTML.length;
    const childElements = element.querySelectorAll('*').length;
    
    if (textLength === 0 || htmlLength === 0) return 0;
    
    let score = 0;
    
    // Text-to-HTML ratio
    const textToHtmlRatio = textLength / htmlLength;
    if (textToHtmlRatio >= 0.3) score += 0.4;
    else if (textToHtmlRatio >= 0.2) score += 0.3;
    else if (textToHtmlRatio >= 0.1) score += 0.2;
    
    // Text per element
    const textPerElement = textLength / Math.max(childElements, 1);
    if (textPerElement >= 50) score += 0.3;
    else if (textPerElement >= 25) score += 0.2;
    
    // Link density (lower is better for main content)
    const linkCount = element.querySelectorAll('a').length;
    const linkDensity = linkCount / Math.max(childElements, 1);
    if (linkDensity <= 0.1) score += 0.2;
    else if (linkDensity <= 0.2) score += 0.1;
    
    // Paragraph density
    const paragraphCount = element.querySelectorAll('p').length;
    const paragraphDensity = paragraphCount / Math.max(childElements, 1);
    if (paragraphDensity >= 0.3) score += 0.1;
    
    return Math.min(score, 1.0);
  }
  
  calculateArticleStructure(element) {
    let score = 0;
    
    // Check for headline
    if (element.querySelector('h1, .headline, .title')) score += 0.3;
    
    // Check for subheadings
    if (element.querySelectorAll('h2, h3, h4, h5, h6').length > 0) score += 0.2;
    
    // Check for author/byline
    if (element.querySelector('.author, .byline, [rel="author"]')) score += 0.15;
    
    // Check for publish date
    if (element.querySelector('time, .date, [datetime]')) score += 0.15;
    
    // Check for body paragraphs
    if (element.querySelectorAll('p').length >= 3) score += 0.2;
    
    return Math.min(score, 1.0);
  }
  
  calculatePositionScore(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    
    let score = 0;
    
    // Center positioning
    const centerDistance = Math.abs((rect.left + rect.width / 2) - viewportWidth / 2);
    if (centerDistance < viewportWidth * 0.2) score += 0.4;
    else if (centerDistance < viewportWidth * 0.3) score += 0.3;
    
    // Width appropriateness
    const widthRatio = rect.width / viewportWidth;
    if (widthRatio >= 0.4 && widthRatio <= 0.8) score += 0.4;
    else if (widthRatio >= 0.3 && widthRatio <= 0.9) score += 0.3;
    
    // Height reasonableness
    if (rect.height > 200 && rect.height < window.innerHeight * 3) score += 0.2;
    
    return Math.min(score, 1.0);
  }
  
  calculateMetadataScore(element) {
    let score = 0;
    
    // Author information
    if (element.querySelector('.author, .byline, [rel="author"]')) score += 0.2;
    
    // Publication date
    if (element.querySelector('time, .date, [datetime]')) score += 0.2;
    
    // Rich content
    if (element.querySelectorAll('img').length > 0) score += 0.2;
    if (element.querySelector('blockquote, .quote')) score += 0.1;
    if (element.querySelectorAll('ul, ol').length > 0) score += 0.1;
    
    // Content categorization
    if (element.querySelector('.tags, .categories')) score += 0.1;
    
    // Social elements
    if (element.querySelector('.share, .social-share')) score += 0.1;
    
    return Math.min(score, 1.0);
  }
}

/**
 * Boundary Detection Component
 */
class BoundaryDetector {
  constructor() {
    this.boundarySelectors = [
      '.article-end', '.content-end', '.story-end',
      '.related-articles', '.more-stories', '.recommended',
      '.comments', '.comment-section', '#comments',
      '.newsletter-signup', '.subscription',
      '.social-share', '.share-buttons'
    ];
  }
  
  detectBoundaries(candidate) {
    const element = candidate.element;
    const boundaries = [];
    
    for (const selector of this.boundarySelectors) {
      const matches = element.querySelectorAll(selector);
      boundaries.push(...matches);
    }
    
    // Sort boundaries by position in document
    boundaries.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    return {
      element,
      boundaries: boundaries.slice(0, 3) // Keep only first 3 boundaries
    };
  }
}

// Export the main class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedContentExtractor;
} else if (typeof window !== 'undefined') {
  window.EnhancedContentExtractor = EnhancedContentExtractor;
}