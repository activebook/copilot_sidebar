# Semantic Content Analysis for Main Content Detection

## Overview

Semantic content analysis goes beyond simple DOM structure to understand the meaning and purpose of content elements. This approach leverages HTML5 semantics, structured data, accessibility features, and content patterns to identify main article content with high accuracy.

## Semantic Detection Strategies

### 1. HTML5 Semantic Elements

Modern web standards provide semantic elements that explicitly indicate content purpose.

```javascript
class SemanticElementAnalyzer {
  constructor() {
    this.semanticElements = {
      // Primary content containers
      article: { weight: 0.9, description: 'Self-contained content' },
      main: { weight: 0.95, description: 'Main content of document' },
      section: { weight: 0.6, description: 'Thematic grouping' },
      
      // Content structure
      header: { weight: 0.3, description: 'Introductory content' },
      footer: { weight: 0.2, description: 'Footer information' },
      aside: { weight: -0.5, description: 'Sidebar content' },
      nav: { weight: -0.8, description: 'Navigation links' },
      
      // Content types
      figure: { weight: 0.4, description: 'Self-contained content' },
      figcaption: { weight: 0.3, description: 'Figure caption' },
      blockquote: { weight: 0.5, description: 'Quoted content' },
      time: { weight: 0.3, description: 'Date/time information' }
    };
  }
  
  analyzeElement(element) {
    const tagName = element.tagName.toLowerCase();
    const semanticInfo = this.semanticElements[tagName];
    
    if (!semanticInfo) {
      return { isSemanticElement: false, weight: 0, description: null };
    }
    
    return {
      isSemanticElement: true,
      weight: semanticInfo.weight,
      description: semanticInfo.description,
      tagName: tagName,
      confidence: this.calculateSemanticConfidence(element, tagName)
    };
  }
  
  calculateSemanticConfidence(element, tagName) {
    let confidence = 0.7; // Base confidence for semantic elements
    
    // Boost confidence based on context
    if (tagName === 'article') {
      // Article elements should contain substantial content
      const textLength = element.textContent.trim().length;
      if (textLength > 500) confidence += 0.2;
      if (textLength > 1000) confidence += 0.1;
      
      // Should have proper article structure
      if (element.querySelector('h1, h2, .headline')) confidence += 0.1;
      if (element.querySelector('time, .date, .published')) confidence += 0.05;
    }
    
    if (tagName === 'main') {
      // Main element should be unique and substantial
      const mainElements = document.querySelectorAll('main');
      if (mainElements.length === 1) confidence += 0.2;
      
      const textLength = element.textContent.trim().length;
      if (textLength > 1000) confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }
}
```

### 2. ARIA Roles and Landmarks

ARIA (Accessible Rich Internet Applications) provides semantic information for assistive technologies.

```javascript
class ARIAAnalyzer {
  constructor() {
    this.landmarkRoles = {
      main: { weight: 0.95, description: 'Main content landmark' },
      article: { weight: 0.8, description: 'Article content' },
      region: { weight: 0.6, description: 'Significant content region' },
      complementary: { weight: -0.3, description: 'Supporting content' },
      navigation: { weight: -0.8, description: 'Navigation landmark' },
      banner: { weight: -0.5, description: 'Site banner' },
      contentinfo: { weight: -0.4, description: 'Content information' },
      search: { weight: -0.6, description: 'Search functionality' }
    };
    
    this.contentRoles = {
      document: { weight: 0.7, description: 'Document content' },
      img: { weight: 0.2, description: 'Image content' },
      button: { weight: -0.2, description: 'Interactive button' },
      link: { weight: -0.1, description: 'Link element' },
      list: { weight: 0.3, description: 'List content' },
      listitem: { weight: 0.2, description: 'List item' }
    };
  }
  
  analyzeElement(element) {
    const role = element.getAttribute('role');
    if (!role) return { hasRole: false };
    
    const landmarkInfo = this.landmarkRoles[role];
    const contentInfo = this.contentRoles[role];
    
    const roleInfo = landmarkInfo || contentInfo;
    if (!roleInfo) return { hasRole: true, role, weight: 0 };
    
    return {
      hasRole: true,
      role,
      weight: roleInfo.weight,
      description: roleInfo.description,
      isLandmark: !!landmarkInfo,
      confidence: this.calculateRoleConfidence(element, role)
    };
  }
  
  calculateRoleConfidence(element, role) {
    let confidence = 0.8; // Base confidence for explicit roles
    
    // Validate role appropriateness
    if (role === 'main') {
      // Should be unique
      const mainElements = document.querySelectorAll('[role="main"], main');
      if (mainElements.length === 1) confidence += 0.1;
      else confidence -= 0.2;
      
      // Should contain substantial content
      const textLength = element.textContent.trim().length;
      if (textLength > 1000) confidence += 0.1;
    }
    
    if (role === 'article') {
      // Should have article-like structure
      if (element.querySelector('h1, h2, h3')) confidence += 0.1;
      if (element.querySelector('time, .date')) confidence += 0.05;
    }
    
    return Math.min(confidence, 1.0);
  }
}
```

### 3. Schema.org Structured Data

Schema.org markup provides explicit semantic information about content.

```javascript
class SchemaAnalyzer {
  constructor() {
    this.articleTypes = {
      'Article': { weight: 0.8, description: 'Generic article' },
      'NewsArticle': { weight: 0.9, description: 'News article' },
      'BlogPosting': { weight: 0.85, description: 'Blog post' },
      'ScholarlyArticle': { weight: 0.8, description: 'Academic article' },
      'TechArticle': { weight: 0.8, description: 'Technical article' },
      'Report': { weight: 0.7, description: 'Report document' }
    };
    
    this.contentTypes = {
      'WebPage': { weight: 0.5, description: 'Web page content' },
      'WebSite': { weight: 0.3, description: 'Website information' },
      'Organization': { weight: 0.1, description: 'Organization info' },
      'Person': { weight: 0.2, description: 'Person information' }
    };
  }
  
  analyzeElement(element) {
    const analysis = {
      hasMicrodata: false,
      hasJsonLd: false,
      schemas: [],
      totalWeight: 0,
      confidence: 0
    };
    
    // Check for microdata
    const itemType = element.getAttribute('itemtype');
    if (itemType) {
      analysis.hasMicrodata = true;
      analysis.schemas.push(...this.parseMicrodataTypes(itemType));
    }
    
    // Check for JSON-LD in document
    const jsonLdElements = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdElements) {
      try {
        const data = JSON.parse(script.textContent);
        const jsonLdSchemas = this.parseJsonLdTypes(data);
        if (jsonLdSchemas.length > 0) {
          analysis.hasJsonLd = true;
          analysis.schemas.push(...jsonLdSchemas);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // Calculate total weight and confidence
    analysis.totalWeight = analysis.schemas.reduce((sum, schema) => sum + schema.weight, 0);
    analysis.confidence = this.calculateSchemaConfidence(analysis.schemas, element);
    
    return analysis;
  }
  
  parseMicrodataTypes(itemType) {
    const types = itemType.split(/\s+/);
    return types.map(type => {
      const typeName = type.split('/').pop();
      const typeInfo = this.articleTypes[typeName] || this.contentTypes[typeName];
      
      return {
        type: typeName,
        fullType: type,
        weight: typeInfo ? typeInfo.weight : 0.1,
        description: typeInfo ? typeInfo.description : 'Unknown type',
        source: 'microdata'
      };
    });
  }
  
  parseJsonLdTypes(data) {
    const schemas = [];
    
    if (Array.isArray(data)) {
      data.forEach(item => schemas.push(...this.parseJsonLdTypes(item)));
    } else if (data && typeof data === 'object') {
      const type = data['@type'];
      if (type) {
        const types = Array.isArray(type) ? type : [type];
        types.forEach(typeName => {
          const typeInfo = this.articleTypes[typeName] || this.contentTypes[typeName];
          schemas.push({
            type: typeName,
            weight: typeInfo ? typeInfo.weight : 0.1,
            description: typeInfo ? typeInfo.description : 'Unknown type',
            source: 'json-ld',
            data: data
          });
        });
      }
    }
    
    return schemas;
  }
  
  calculateSchemaConfidence(schemas, element) {
    if (schemas.length === 0) return 0;
    
    let confidence = 0.6; // Base confidence for structured data
    
    // Boost confidence for article types
    const hasArticleType = schemas.some(s => this.articleTypes[s.type]);
    if (hasArticleType) confidence += 0.3;
    
    // Boost confidence for multiple schema sources
    const hasMicrodata = schemas.some(s => s.source === 'microdata');
    const hasJsonLd = schemas.some(s => s.source === 'json-ld');
    if (hasMicrodata && hasJsonLd) confidence += 0.1;
    
    // Validate schema appropriateness
    const textLength = element.textContent.trim().length;
    if (hasArticleType && textLength > 500) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }
}
```

### 4. Content Pattern Recognition

Identify content patterns that indicate main article content.

```javascript
class ContentPatternAnalyzer {
  constructor() {
    this.articlePatterns = {
      headlines: {
        selectors: ['h1', '.headline', '.title', '[class*="headline"]', '[class*="title"]'],
        weight: 0.8,
        validator: (el) => el.textContent.trim().length > 10
      },
      
      bylines: {
        selectors: ['.byline', '.author', '[rel="author"]', '[class*="author"]', '[class*="byline"]'],
        weight: 0.6,
        validator: (el) => /by\s+|author/i.test(el.textContent)
      },
      
      publishDates: {
        selectors: ['time', '.date', '.published', '[datetime]', '[class*="date"]', '[class*="time"]'],
        weight: 0.5,
        validator: (el) => this.isValidDate(el)
      },
      
      articleBody: {
        selectors: ['.article-body', '.post-content', '.entry-content', '[class*="article-body"]'],
        weight: 0.9,
        validator: (el) => el.textContent.trim().length > 200
      },
      
      leadParagraphs: {
        selectors: ['.lead', '.intro', '.summary', '[class*="lead"]', '[class*="intro"]'],
        weight: 0.7,
        validator: (el) => el.textContent.trim().length > 50
      }
    };
    
    this.noisePatterns = {
      navigation: {
        selectors: ['nav', '.nav', '.navigation', '.menu', '[class*="nav"]', '[class*="menu"]'],
        penalty: -0.8
      },
      
      advertisements: {
        selectors: ['.ad', '.ads', '.advertisement', '[class*="ad-"]', '[id*="ad-"]'],
        penalty: -0.9
      },
      
      social: {
        selectors: ['.social', '.share', '.sharing', '[class*="social"]', '[class*="share"]'],
        penalty: -0.4
      },
      
      related: {
        selectors: ['.related', '.recommended', '.more-stories', '[class*="related"]'],
        penalty: -0.6
      }
    };
  }
  
  analyzeElement(element) {
    const analysis = {
      articlePatterns: [],
      noisePatterns: [],
      patternScore: 0,
      confidence: 0
    };
    
    // Check for article patterns
    for (const [patternName, pattern] of Object.entries(this.articlePatterns)) {
      const matches = this.findPatternMatches(element, pattern);
      if (matches.length > 0) {
        analysis.articlePatterns.push({
          name: patternName,
          matches: matches.length,
          weight: pattern.weight,
          elements: matches
        });
        analysis.patternScore += pattern.weight * Math.min(matches.length, 3) / 3;
      }
    }
    
    // Check for noise patterns
    for (const [patternName, pattern] of Object.entries(this.noisePatterns)) {
      const matches = this.findNoiseMatches(element, pattern);
      if (matches.length > 0) {
        analysis.noisePatterns.push({
          name: patternName,
          matches: matches.length,
          penalty: pattern.penalty,
          elements: matches
        });
        analysis.patternScore += pattern.penalty * Math.min(matches.length, 2) / 2;
      }
    }
    
    // Calculate confidence
    analysis.confidence = this.calculatePatternConfidence(analysis);
    
    return analysis;
  }
  
  findPatternMatches(element, pattern) {
    const matches = [];
    
    for (const selector of pattern.selectors) {
      const elements = element.querySelectorAll(selector);
      for (const el of elements) {
        if (!pattern.validator || pattern.validator(el)) {
          matches.push(el);
        }
      }
    }
    
    return matches;
  }
  
  findNoiseMatches(element, pattern) {
    const matches = [];
    
    for (const selector of pattern.selectors) {
      const elements = element.querySelectorAll(selector);
      matches.push(...elements);
    }
    
    return matches;
  }
  
  isValidDate(element) {
    const dateTime = element.getAttribute('datetime');
    if (dateTime) {
      return !isNaN(Date.parse(dateTime));
    }
    
    const text = element.textContent.trim();
    // Simple date pattern matching
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}/, // ISO date
      /\d{1,2}\/\d{1,2}\/\d{4}/, // US date
      /\d{1,2}\.\d{1,2}\.\d{4}/, // European date
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i // Month names
    ];
    
    return datePatterns.some(pattern => pattern.test(text));
  }
  
  calculatePatternConfidence(analysis) {
    let confidence = 0.5; // Base confidence
    
    // Boost confidence for strong article patterns
    const hasHeadline = analysis.articlePatterns.some(p => p.name === 'headlines');
    const hasBody = analysis.articlePatterns.some(p => p.name === 'articleBody');
    const hasByline = analysis.articlePatterns.some(p => p.name === 'bylines');
    const hasDate = analysis.articlePatterns.some(p => p.name === 'publishDates');
    
    if (hasHeadline) confidence += 0.2;
    if (hasBody) confidence += 0.3;
    if (hasByline && hasDate) confidence += 0.2;
    
    // Reduce confidence for noise patterns
    const noiseScore = analysis.noisePatterns.reduce((sum, p) => sum + Math.abs(p.penalty), 0);
    confidence -= noiseScore * 0.1;
    
    return Math.max(0, Math.min(1, confidence));
  }
}
```

### 5. Integrated Semantic Analysis

Combine all semantic analysis approaches for comprehensive content detection.

```javascript
class IntegratedSemanticAnalyzer {
  constructor() {
    this.semanticAnalyzer = new SemanticElementAnalyzer();
    this.ariaAnalyzer = new ARIAAnalyzer();
    this.schemaAnalyzer = new SchemaAnalyzer();
    this.patternAnalyzer = new ContentPatternAnalyzer();
  }
  
  analyzeElement(element) {
    const semanticAnalysis = this.semanticAnalyzer.analyzeElement(element);
    const ariaAnalysis = this.ariaAnalyzer.analyzeElement(element);
    const schemaAnalysis = this.schemaAnalyzer.analyzeElement(element);
    const patternAnalysis = this.patternAnalyzer.analyzeElement(element);
    
    // Calculate combined semantic score
    const semanticScore = this.calculateCombinedScore({
      semantic: semanticAnalysis,
      aria: ariaAnalysis,
      schema: schemaAnalysis,
      pattern: patternAnalysis
    });
    
    return {
      element,
      semanticScore,
      confidence: this.calculateOverallConfidence({
        semantic: semanticAnalysis,
        aria: ariaAnalysis,
        schema: schemaAnalysis,
        pattern: patternAnalysis
      }),
      details: {
        semantic: semanticAnalysis,
        aria: ariaAnalysis,
        schema: schemaAnalysis,
        pattern: patternAnalysis
      }
    };
  }
  
  calculateCombinedScore(analyses) {
    let totalScore = 0;
    let totalWeight = 0;
    
    // Semantic elements (weight: 0.3)
    if (analyses.semantic.isSemanticElement) {
      totalScore += analyses.semantic.weight * analyses.semantic.confidence * 0.3;
      totalWeight += 0.3;
    }
    
    // ARIA roles (weight: 0.25)
    if (analyses.aria.hasRole) {
      totalScore += analyses.aria.weight * analyses.aria.confidence * 0.25;
      totalWeight += 0.25;
    }
    
    // Schema.org markup (weight: 0.2)
    if (analyses.schema.schemas.length > 0) {
      const schemaScore = Math.min(analyses.schema.totalWeight, 1.0);
      totalScore += schemaScore * analyses.schema.confidence * 0.2;
      totalWeight += 0.2;
    }
    
    // Content patterns (weight: 0.25)
    const patternScore = Math.max(0, Math.min(1, analyses.pattern.patternScore));
    totalScore += patternScore * analyses.pattern.confidence * 0.25;
    totalWeight += 0.25;
    
    // Normalize score
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }
  
  calculateOverallConfidence(analyses) {
    const confidences = [];
    
    if (analyses.semantic.isSemanticElement) {
      confidences.push(analyses.semantic.confidence);
    }
    
    if (analyses.aria.hasRole) {
      confidences.push(analyses.aria.confidence);
    }
    
    if (analyses.schema.schemas.length > 0) {
      confidences.push(analyses.schema.confidence);
    }
    
    confidences.push(analyses.pattern.confidence);
    
    // Average confidence with bonus for multiple indicators
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const diversityBonus = Math.min(confidences.length * 0.05, 0.2);
    
    return Math.min(avgConfidence + diversityBonus, 1.0);
  }
  
  findMainContentCandidates(rootElement = document.body) {
    const candidates = [];
    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          // Skip hidden elements and known non-content elements
          if (this.isHidden(node) || this.isNonContentElement(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while ((node = walker.nextNode())) {
      const analysis = this.analyzeElement(node);
      
      // Only consider elements with meaningful semantic indicators
      if (analysis.semanticScore > 0.3 || analysis.confidence > 0.5) {
        candidates.push(analysis);
      }
    }
    
    // Sort by combined score and confidence
    return candidates.sort((a, b) => {
      const scoreA = a.semanticScore * a.confidence;
      const scoreB = b.semanticScore * b.confidence;
      return scoreB - scoreA;
    });
  }
  
  isHidden(element) {
    const style = window.getComputedStyle(element);
    return style.display === 'none' || 
           style.visibility === 'hidden' || 
           style.opacity === '0' ||
           element.getBoundingClientRect().width === 0;
  }
  
  isNonContentElement(element) {
    const tagName = element.tagName.toLowerCase();
    return ['script', 'style', 'noscript', 'template'].includes(tagName);
  }
}
```

## Usage Example

```javascript
// Initialize the semantic analyzer
const semanticAnalyzer = new IntegratedSemanticAnalyzer();

// Find main content candidates
const candidates = semanticAnalyzer.findMainContentCandidates();

// Get the best candidate
const bestCandidate = candidates[0];

if (bestCandidate) {
  console.log('Main content found:', {
    element: bestCandidate.element,
    semanticScore: bestCandidate.semanticScore,
    confidence: bestCandidate.confidence,
    details: bestCandidate.details
  });
}
```

This semantic content analysis system provides a sophisticated approach to identifying main content by leveraging multiple layers of semantic information, resulting in much more accurate content extraction than simple heuristic-based approaches.