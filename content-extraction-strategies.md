# Content Extraction Strategies for News Media

## Current Approach Analysis

Your existing [`findMainContentElement()`](content-script.js:38) function uses:

1. **Semantic selectors**: `article`, `main`, `.content`, etc.
2. **Text length scoring**: Primary metric for content quality
3. **Fallback strategy**: Expands from densest paragraph when semantic selectors fail

### Limitations of Current Approach

- **Length-based scoring alone is insufficient** - trending sections and related articles can be quite long
- **No noise filtering** - doesn't actively exclude known non-core content patterns
- **Limited semantic understanding** - doesn't consider content structure and context
- **No content quality assessment** - treats all text equally

## Advanced Content Extraction Strategies

### 1. Multi-Factor Content Scoring System

Instead of relying solely on content length, use a weighted scoring system:

```javascript
const SCORING_WEIGHTS = {
  semantic: 0.3,      // HTML5 semantic elements, schema.org
  position: 0.2,      // Element position and layout
  textQuality: 0.25,  // Paragraph density, sentence structure
  structure: 0.15,    // Proper article structure (headline, body)
  noisePenalty: -0.1  // Penalty for noise indicators
};
```

**Semantic Score Factors:**
- HTML5 semantic elements (`<article>`, `<main>`, `[role="main"]`)
- Schema.org markup (`itemtype="http://schema.org/Article"`)
- JSON-LD structured data
- Microdata attributes

**Position Score Factors:**
- Element position relative to viewport
- Distance from page center
- Element size and aspect ratio
- Z-index and visual prominence

**Text Quality Score Factors:**
- Paragraph-to-noise ratio
- Average sentence length and complexity
- Proper capitalization and punctuation
- Content coherence metrics

**Structure Score Factors:**
- Presence of headline elements
- Logical heading hierarchy (H1 → H2 → H3)
- Proper article structure (intro, body, conclusion)
- Publication metadata (author, date, tags)

### 2. Noise Detection and Filtering

**Common Non-Core Content Patterns:**

```javascript
const NOISE_PATTERNS = {
  classNames: [
    /trending|popular|related|recommended/i,
    /sidebar|aside|widget|ad|advertisement/i,
    /social|share|comment|newsletter/i,
    /navigation|nav|menu|breadcrumb/i,
    /footer|header|banner|promo/i,
    /more-from|author-bio|tags|categories/i
  ],
  
  elementTypes: [
    'nav', 'aside', 'footer', 'header',
    '[role="complementary"]',
    '[role="navigation"]',
    '[role="banner"]'
  ],
  
  contentPatterns: [
    /^(trending|popular|related|more from)/i,
    /^(advertisement|sponsored|promoted)/i,
    /^(subscribe|newsletter|follow us)/i,
    /^(read more|continue reading)/i,
    /^(share this|like this)/i
  ],
  
  structuralIndicators: [
    // Elements with high link-to-text ratio
    // Elements with many small text fragments
    // Elements positioned in typical sidebar locations
    // Elements with promotional styling patterns
  ]
};
```

### 3. Content Density Analysis

**Text-to-HTML Ratio:**
```javascript
function calculateContentDensity(element) {
  const textLength = element.textContent.trim().length;
  const htmlLength = element.innerHTML.length;
  return textLength / htmlLength;
}
```

**Paragraph Density:**
```javascript
function calculateParagraphDensity(element) {
  const paragraphs = element.querySelectorAll('p');
  const totalText = paragraphs.reduce((sum, p) => sum + p.textContent.trim().length, 0);
  const totalElements = element.querySelectorAll('*').length;
  return totalText / totalElements;
}
```

### 4. Visual Layout Analysis

**Main Content Column Detection:**
- Identify the widest content column
- Detect typical news layout patterns (header, main, sidebar, footer)
- Use CSS computed styles to understand layout structure
- Consider responsive design breakpoints

**Element Positioning:**
```javascript
function analyzeElementPosition(element) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  return {
    centerDistance: Math.abs((rect.left + rect.width/2) - viewportWidth/2),
    topDistance: rect.top,
    widthRatio: rect.width / viewportWidth,
    heightRatio: rect.height / viewportHeight,
    isInMainColumn: rect.left < viewportWidth * 0.7 && rect.width > viewportWidth * 0.4
  };
}
```

### 5. Semantic Content Analysis

**Article Structure Detection:**
```javascript
function analyzeArticleStructure(element) {
  const structure = {
    hasHeadline: !!element.querySelector('h1, .headline, .title'),
    hasSubheading: !!element.querySelector('h2, .subheading, .subtitle'),
    hasByline: !!element.querySelector('.byline, .author, [rel="author"]'),
    hasPublishDate: !!element.querySelector('time, .date, .published'),
    hasBodyParagraphs: element.querySelectorAll('p').length >= 3,
    hasProperHierarchy: checkHeadingHierarchy(element)
  };
  
  return Object.values(structure).filter(Boolean).length / Object.keys(structure).length;
}
```

**Content Coherence:**
```javascript
function analyzeContentCoherence(element) {
  const paragraphs = Array.from(element.querySelectorAll('p'));
  const sentences = paragraphs.flatMap(p => p.textContent.split(/[.!?]+/));
  
  return {
    averageSentenceLength: sentences.reduce((sum, s) => sum + s.trim().length, 0) / sentences.length,
    paragraphCount: paragraphs.length,
    averageParagraphLength: paragraphs.reduce((sum, p) => sum + p.textContent.length, 0) / paragraphs.length,
    hasProperPunctuation: sentences.filter(s => /[.!?]$/.test(s.trim())).length / sentences.length
  };
}
```

### 6. Fallback Strategies

**Strategy Hierarchy:**
1. **Primary**: Semantic + Multi-factor scoring
2. **Secondary**: Content density analysis with noise filtering
3. **Tertiary**: Enhanced longest-content with smart boundaries
4. **Emergency**: Current approach with basic noise removal

**Smart Boundary Detection:**
```javascript
function findContentBoundaries(element) {
  // Look for natural content boundaries
  const boundaries = [
    element.querySelector('.article-end, .content-end'),
    element.querySelector('.related-articles'),
    element.querySelector('.comments'),
    element.querySelector('.newsletter-signup')
  ].filter(Boolean);
  
  return boundaries.length > 0 ? boundaries[0] : element;
}
```

### 7. Configuration Modes

**Extraction Modes:**
- **Strict Mode**: Maximum noise filtering, may miss some content
- **Balanced Mode**: Good balance of completeness and cleanliness (default)
- **Comprehensive Mode**: Include more content, minimal filtering
- **Custom Mode**: User-defined patterns and thresholds

```javascript
const EXTRACTION_CONFIGS = {
  strict: {
    minContentScore: 0.8,
    noiseThreshold: 0.3,
    requireSemanticElements: true
  },
  balanced: {
    minContentScore: 0.6,
    noiseThreshold: 0.5,
    requireSemanticElements: false
  },
  comprehensive: {
    minContentScore: 0.4,
    noiseThreshold: 0.7,
    requireSemanticElements: false
  }
};
```

## Implementation Strategy

### Phase 1: Enhanced Scoring System
- Implement multi-factor scoring algorithm
- Add semantic element detection
- Create content quality metrics

### Phase 2: Noise Filtering
- Implement noise pattern detection
- Add structural analysis
- Create content boundary detection

### Phase 3: Advanced Analysis
- Add visual layout analysis
- Implement content coherence checking
- Create fallback strategies

### Phase 4: Testing and Validation
- Test against major news sites
- Validate extraction quality
- Fine-tune scoring weights

## Expected Benefits

1. **Reduced Noise**: Active filtering of non-core content
2. **Better Accuracy**: Multi-factor scoring vs. length-only approach
3. **Robustness**: Multiple fallback strategies for edge cases
4. **Flexibility**: Configurable extraction modes for different use cases
5. **Maintainability**: Modular design allows easy updates and improvements

This approach moves beyond the "longest content" heuristic to create a sophisticated, multi-layered content extraction system that can handle the complexity of modern news sites.