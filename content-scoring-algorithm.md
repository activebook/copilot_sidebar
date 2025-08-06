# Multi-Factor Content Scoring Algorithm

## Overview

The content scoring algorithm evaluates potential content containers using multiple weighted factors to determine the likelihood that an element contains the main article content. This approach is far more robust than simple length-based scoring.

## Scoring Formula

```javascript
ContentScore = (
  TextQuality * 0.25 +
  ContentDensity * 0.20 +
  ArticleStructure * 0.20 +
  SemanticScore * 0.15 +
  PositionScore * 0.10 +
  MetadataScore * 0.10
) * (1 - NoiseScore * 0.5)
```

## Factor Definitions

### 1. Text Quality Score (Weight: 0.25)

Evaluates the quality and readability of text content.

```javascript
function calculateTextQuality(element) {
  const text = element.textContent.trim();
  const paragraphs = Array.from(element.querySelectorAll('p'));
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  const metrics = {
    // Average sentence length (optimal: 15-25 words)
    avgSentenceLength: sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length,
    
    // Paragraph count and distribution
    paragraphCount: paragraphs.length,
    avgParagraphLength: paragraphs.reduce((sum, p) => sum + p.textContent.length, 0) / paragraphs.length,
    
    // Text coherence indicators
    properCapitalization: sentences.filter(s => /^[A-Z]/.test(s.trim())).length / sentences.length,
    properPunctuation: sentences.filter(s => /[.!?]$/.test(s.trim())).length / sentences.length,
    
    // Content complexity
    uniqueWords: new Set(text.toLowerCase().match(/\b\w+\b/g) || []).size,
    totalWords: (text.match(/\b\w+\b/g) || []).length,
    
    // Readability indicators
    longSentences: sentences.filter(s => s.trim().split(/\s+/).length > 30).length / sentences.length,
    shortSentences: sentences.filter(s => s.trim().split(/\s+/).length < 5).length / sentences.length
  };
  
  let score = 0;
  
  // Sentence length scoring (bell curve around 15-25 words)
  if (metrics.avgSentenceLength >= 15 && metrics.avgSentenceLength <= 25) {
    score += 0.3;
  } else if (metrics.avgSentenceLength >= 10 && metrics.avgSentenceLength <= 35) {
    score += 0.2;
  } else {
    score += 0.1;
  }
  
  // Paragraph structure
  if (metrics.paragraphCount >= 3) score += 0.2;
  if (metrics.avgParagraphLength >= 100 && metrics.avgParagraphLength <= 500) score += 0.2;
  
  // Text quality indicators
  score += metrics.properCapitalization * 0.1;
  score += metrics.properPunctuation * 0.1;
  
  // Vocabulary diversity
  const lexicalDiversity = metrics.uniqueWords / metrics.totalWords;
  if (lexicalDiversity >= 0.4 && lexicalDiversity <= 0.8) score += 0.1;
  
  return Math.min(score, 1.0);
}
```

### 2. Content Density Score (Weight: 0.20)

Measures the ratio of meaningful text to HTML markup and other elements.

```javascript
function calculateContentDensity(element) {
  const textLength = element.textContent.trim().length;
  const htmlLength = element.innerHTML.length;
  const childElements = element.querySelectorAll('*').length;
  const linkElements = element.querySelectorAll('a').length;
  const imageElements = element.querySelectorAll('img').length;
  
  const metrics = {
    // Text-to-HTML ratio
    textToHtmlRatio: textLength / htmlLength,
    
    // Text per element ratio
    textPerElement: textLength / Math.max(childElements, 1),
    
    // Link density (lower is better for main content)
    linkDensity: linkElements / Math.max(childElements, 1),
    
    // Image to text ratio
    imageToTextRatio: imageElements / Math.max(textLength / 100, 1),
    
    // Paragraph density
    paragraphDensity: element.querySelectorAll('p').length / Math.max(childElements, 1)
  };
  
  let score = 0;
  
  // Text-to-HTML ratio scoring
  if (metrics.textToHtmlRatio >= 0.3) score += 0.4;
  else if (metrics.textToHtmlRatio >= 0.2) score += 0.3;
  else if (metrics.textToHtmlRatio >= 0.1) score += 0.2;
  
  // Text per element (higher is better)
  if (metrics.textPerElement >= 50) score += 0.3;
  else if (metrics.textPerElement >= 25) score += 0.2;
  
  // Link density penalty (too many links indicate navigation/promotional content)
  if (metrics.linkDensity <= 0.1) score += 0.2;
  else if (metrics.linkDensity <= 0.2) score += 0.1;
  else score -= 0.1;
  
  // Paragraph density bonus
  if (metrics.paragraphDensity >= 0.3) score += 0.1;
  
  return Math.max(0, Math.min(score, 1.0));
}
```

### 3. Article Structure Score (Weight: 0.20)

Evaluates whether the element has proper article structure.

```javascript
function calculateArticleStructure(element) {
  const structure = {
    // Headline elements
    hasMainHeadline: !!element.querySelector('h1, .headline, .title, [class*="headline"], [class*="title"]'),
    hasSubheadings: element.querySelectorAll('h2, h3, h4, h5, h6').length > 0,
    
    // Article metadata
    hasAuthor: !!element.querySelector('.author, .byline, [rel="author"], [class*="author"], [class*="byline"]'),
    hasPublishDate: !!element.querySelector('time, .date, .published, [datetime], [class*="date"], [class*="time"]'),
    
    // Content structure
    hasBodyParagraphs: element.querySelectorAll('p').length >= 3,
    hasProperHierarchy: checkHeadingHierarchy(element),
    
    // Rich content indicators
    hasImages: element.querySelectorAll('img').length > 0,
    hasQuotes: element.querySelectorAll('blockquote, .quote').length > 0,
    hasLists: element.querySelectorAll('ul, ol').length > 0,
    
    // Article boundaries
    hasIntroduction: checkForIntroduction(element),
    hasConclusion: checkForConclusion(element)
  };
  
  // Calculate structure score
  const structureElements = Object.values(structure);
  const presentElements = structureElements.filter(Boolean).length;
  const totalElements = structureElements.length;
  
  let score = presentElements / totalElements;
  
  // Bonus for critical elements
  if (structure.hasMainHeadline) score += 0.2;
  if (structure.hasBodyParagraphs) score += 0.2;
  if (structure.hasAuthor && structure.hasPublishDate) score += 0.1;
  
  return Math.min(score, 1.0);
}

function checkHeadingHierarchy(element) {
  const headings = Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  if (headings.length === 0) return false;
  
  let previousLevel = 0;
  for (const heading of headings) {
    const level = parseInt(heading.tagName[1]);
    if (level > previousLevel + 1) return false; // Skip levels
    previousLevel = level;
  }
  return true;
}

function checkForIntroduction(element) {
  const firstParagraph = element.querySelector('p');
  if (!firstParagraph) return false;
  
  const text = firstParagraph.textContent.trim();
  return text.length >= 100 && text.length <= 300; // Typical intro length
}

function checkForConclusion(element) {
  const paragraphs = Array.from(element.querySelectorAll('p'));
  if (paragraphs.length < 3) return false;
  
  const lastParagraph = paragraphs[paragraphs.length - 1];
  const text = lastParagraph.textContent.trim().toLowerCase();
  
  // Look for conclusion indicators
  const conclusionWords = ['conclusion', 'finally', 'in summary', 'to conclude', 'overall'];
  return conclusionWords.some(word => text.includes(word));
}
```

### 4. Semantic Score (Weight: 0.15)

Based on HTML5 semantic elements and structured data.

```javascript
function calculateSemanticScore(element) {
  let score = 0;
  
  // HTML5 semantic elements
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'article') score += 0.8;
  else if (tagName === 'main') score += 0.9;
  else if (tagName === 'section') score += 0.4;
  
  // ARIA roles
  const role = element.getAttribute('role');
  if (role === 'main') score += 0.85;
  else if (role === 'article') score += 0.7;
  
  // Schema.org markup
  const itemType = element.getAttribute('itemtype');
  if (itemType) {
    if (itemType.includes('Article')) score += 0.7;
    else if (itemType.includes('NewsArticle')) score += 0.8;
    else if (itemType.includes('BlogPosting')) score += 0.6;
  }
  
  // Microdata
  const itemScope = element.hasAttribute('itemscope');
  if (itemScope) score += 0.3;
  
  // Content-specific classes and IDs
  const className = (element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  
  if (/article|content|post|entry|story/.test(className + ' ' + id)) score += 0.5;
  if (/main|primary/.test(className + ' ' + id)) score += 0.4;
  
  // JSON-LD structured data
  const jsonLd = document.querySelector('script[type="application/ld+json"]');
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd.textContent);
      if (data['@type'] && data['@type'].includes('Article')) score += 0.3;
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  return Math.min(score, 1.0);
}
```

### 5. Position Score (Weight: 0.10)

Evaluates element position and layout characteristics.

```javascript
function calculatePositionScore(element) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  const metrics = {
    // Distance from center
    centerDistance: Math.abs((rect.left + rect.width / 2) - viewportWidth / 2),
    
    // Element dimensions
    widthRatio: rect.width / viewportWidth,
    heightRatio: rect.height / viewportHeight,
    
    // Position relative to viewport
    topDistance: rect.top,
    leftDistance: rect.left,
    
    // Layout characteristics
    isInMainColumn: rect.left < viewportWidth * 0.7 && rect.width > viewportWidth * 0.4,
    isFullWidth: rect.width > viewportWidth * 0.8,
    isReasonableHeight: rect.height > 200 && rect.height < viewportHeight * 3
  };
  
  let score = 0;
  
  // Center positioning bonus
  if (metrics.centerDistance < viewportWidth * 0.2) score += 0.3;
  else if (metrics.centerDistance < viewportWidth * 0.3) score += 0.2;
  
  // Width scoring
  if (metrics.widthRatio >= 0.4 && metrics.widthRatio <= 0.8) score += 0.3;
  else if (metrics.widthRatio >= 0.3 && metrics.widthRatio <= 0.9) score += 0.2;
  
  // Main column detection
  if (metrics.isInMainColumn) score += 0.2;
  
  // Height reasonableness
  if (metrics.isReasonableHeight) score += 0.2;
  
  return Math.min(score, 1.0);
}
```

### 6. Metadata Score (Weight: 0.10)

Evaluates presence of article metadata and rich content.

```javascript
function calculateMetadataScore(element) {
  const metadata = {
    // Author information
    hasAuthor: !!element.querySelector('.author, .byline, [rel="author"]'),
    hasAuthorLink: !!element.querySelector('a[rel="author"], .author a'),
    
    // Publication information
    hasPublishDate: !!element.querySelector('time, .date, [datetime]'),
    hasUpdateDate: !!element.querySelector('.updated, .modified'),
    
    // Content categorization
    hasTags: !!element.querySelector('.tags, .categories, .tag'),
    hasCategory: !!element.querySelector('.category, .section'),
    
    // Social and engagement
    hasShareButtons: !!element.querySelector('.share, .social-share'),
    hasCommentCount: !!element.querySelector('.comment-count, .comments-count'),
    
    // Rich content
    hasImages: element.querySelectorAll('img').length > 0,
    hasCaptions: !!element.querySelector('.caption, figcaption'),
    hasVideos: !!element.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]'),
    
    // Article extras
    hasReadingTime: !!element.querySelector('.reading-time, .read-time'),
    hasWordCount: !!element.querySelector('.word-count, .length')
  };
  
  const presentMetadata = Object.values(metadata).filter(Boolean).length;
  const totalMetadata = Object.keys(metadata).length;
  
  let score = presentMetadata / totalMetadata;
  
  // Bonus for critical metadata
  if (metadata.hasAuthor) score += 0.2;
  if (metadata.hasPublishDate) score += 0.2;
  if (metadata.hasImages) score += 0.1;
  
  return Math.min(score, 1.0);
}
```

## Noise Score Penalty

The noise score reduces the overall content score based on indicators that suggest non-core content.

```javascript
function calculateNoiseScore(element) {
  let noiseScore = 0;
  
  // Class/ID pattern matching
  const className = (element.className || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  const combined = className + ' ' + id;
  
  const noisePatterns = [
    /trending|popular|related|recommended/,
    /sidebar|aside|widget|ad|advertisement/,
    /social|share|comment|newsletter/,
    /navigation|nav|menu|breadcrumb/,
    /footer|header|banner|promo/,
    /more-from|author-bio|tags|categories/
  ];
  
  for (const pattern of noisePatterns) {
    if (pattern.test(combined)) {
      noiseScore += 0.3;
      break;
    }
  }
  
  // Content pattern analysis
  const text = element.textContent.trim().toLowerCase();
  const noiseContentPatterns = [
    /^(trending|popular|related|more from)/,
    /^(advertisement|sponsored|promoted)/,
    /^(subscribe|newsletter|follow us)/
  ];
  
  for (const pattern of noiseContentPatterns) {
    if (pattern.test(text)) {
      noiseScore += 0.4;
      break;
    }
  }
  
  // Structural indicators
  const linkCount = element.querySelectorAll('a').length;
  const textLength = text.length;
  const linkDensity = linkCount / Math.max(textLength / 100, 1);
  
  if (linkDensity > 0.5) noiseScore += 0.3; // Too many links
  if (textLength < 100) noiseScore += 0.2; // Too short
  
  return Math.min(noiseScore, 1.0);
}
```

## Usage Example

```javascript
function scoreContentElement(element, config = {}) {
  const weights = config.weights || {
    textQuality: 0.25,
    contentDensity: 0.20,
    articleStructure: 0.20,
    semanticScore: 0.15,
    positionScore: 0.10,
    metadataScore: 0.10
  };
  
  const scores = {
    textQuality: calculateTextQuality(element),
    contentDensity: calculateContentDensity(element),
    articleStructure: calculateArticleStructure(element),
    semanticScore: calculateSemanticScore(element),
    positionScore: calculatePositionScore(element),
    metadataScore: calculateMetadataScore(element)
  };
  
  const noiseScore = calculateNoiseScore(element);
  
  // Calculate weighted score
  let totalScore = 0;
  for (const [factor, score] of Object.entries(scores)) {
    totalScore += score * weights[factor];
  }
  
  // Apply noise penalty
  const finalScore = totalScore * (1 - noiseScore * 0.5);
  
  return {
    finalScore: Math.max(0, Math.min(1, finalScore)),
    componentScores: scores,
    noiseScore,
    details: {
      weightedComponents: Object.entries(scores).map(([factor, score]) => ({
        factor,
        score,
        weight: weights[factor],
        contribution: score * weights[factor]
      })),
      noisePenalty: noiseScore * 0.5
    }
  };
}
```

This multi-factor scoring algorithm provides a much more nuanced and robust approach to content evaluation than simple length-based scoring, taking into account the various characteristics that distinguish high-quality main content from peripheral elements on news websites.