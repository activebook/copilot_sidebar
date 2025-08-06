// Content Extraction Test Framework
// Comprehensive testing system for validating content extraction across diverse news sites

/**
 * Test framework for evaluating content extraction quality and robustness
 */
class ContentExtractionTestFramework {
  constructor() {
    this.testSites = this.getTestSites();
    this.testResults = [];
    this.metrics = new ExtractionMetrics();
    this.validator = new ContentValidator();
  }
  
  /**
   * Comprehensive list of test sites representing different news site architectures
   */
  getTestSites() {
    return [
      // Major News Sites
      {
        name: 'CNN',
        baseUrl: 'https://www.cnn.com',
        sampleUrls: [
          'https://www.cnn.com/2024/01/15/politics/example-article/index.html'
        ],
        expectedPatterns: {
          mainContentSelector: '.zn-body__paragraph, .zn-body__read-all',
          noiseSelectors: ['.zn-related', '.zn-trending', '.zn-footer'],
          articleStructure: ['h1', '.byline', 'time', 'p']
        },
        challenges: ['heavy sidebar content', 'related articles', 'video embeds']
      },
      
      {
        name: 'BBC News',
        baseUrl: 'https://www.bbc.com/news',
        sampleUrls: [
          'https://www.bbc.com/news/world-12345678'
        ],
        expectedPatterns: {
          mainContentSelector: '[data-component="text-block"]',
          noiseSelectors: ['.bbccom_slot', '.story-more', '.related-topics'],
          articleStructure: ['h1', '.byline', 'time', '[data-component="text-block"]']
        },
        challenges: ['related topics', 'live updates', 'media galleries']
      },
      
      {
        name: 'New York Times',
        baseUrl: 'https://www.nytimes.com',
        sampleUrls: [
          'https://www.nytimes.com/2024/01/15/world/example-article.html'
        ],
        expectedPatterns: {
          mainContentSelector: '.StoryBodyCompanionColumn',
          noiseSelectors: ['.RelatedCoverage', '.MoreInSection', '.Newsletter'],
          articleStructure: ['h1', '.byline', 'time', '.StoryBodyCompanionColumn']
        },
        challenges: ['paywall content', 'newsletter signups', 'related coverage']
      },
      
      // Blog Platforms
      {
        name: 'Medium',
        baseUrl: 'https://medium.com',
        sampleUrls: [
          'https://medium.com/@author/example-article-123456'
        ],
        expectedPatterns: {
          mainContentSelector: 'article section',
          noiseSelectors: ['.related-stories', '.footer', '.sidebar'],
          articleStructure: ['h1', '.author', 'time', 'section p']
        },
        challenges: ['clap buttons', 'related stories', 'author recommendations']
      },
      
      {
        name: 'WordPress Blog',
        baseUrl: 'https://example-blog.com',
        sampleUrls: [
          'https://example-blog.com/2024/01/example-post/'
        ],
        expectedPatterns: {
          mainContentSelector: '.entry-content, .post-content',
          noiseSelectors: ['.sidebar', '.related-posts', '.comments'],
          articleStructure: ['h1', '.author', '.date', '.entry-content']
        },
        challenges: ['sidebar widgets', 'related posts', 'comment sections']
      },
      
      // Tech News Sites
      {
        name: 'TechCrunch',
        baseUrl: 'https://techcrunch.com',
        sampleUrls: [
          'https://techcrunch.com/2024/01/15/example-tech-article/'
        ],
        expectedPatterns: {
          mainContentSelector: '.article-content',
          noiseSelectors: ['.related-articles', '.newsletter-signup', '.social-share'],
          articleStructure: ['h1', '.byline', 'time', '.article-content']
        },
        challenges: ['newsletter signups', 'social sharing', 'related articles']
      },
      
      {
        name: 'Ars Technica',
        baseUrl: 'https://arstechnica.com',
        sampleUrls: [
          'https://arstechnica.com/tech-policy/2024/01/example-article/'
        ],
        expectedPatterns: {
          mainContentSelector: '.post-content',
          noiseSelectors: ['.sidebar', '.related', '.comments'],
          articleStructure: ['h1', '.byline', 'time', '.post-content']
        },
        challenges: ['technical content', 'code blocks', 'image galleries']
      },
      
      // Local News Sites
      {
        name: 'Local News Site',
        baseUrl: 'https://example-local-news.com',
        sampleUrls: [
          'https://example-local-news.com/news/local/example-story'
        ],
        expectedPatterns: {
          mainContentSelector: '.story-body, .article-text',
          noiseSelectors: ['.weather-widget', '.breaking-news', '.ads'],
          articleStructure: ['h1', '.byline', '.date', '.story-body']
        },
        challenges: ['weather widgets', 'breaking news tickers', 'local ads']
      }
    ];
  }
  
  /**
   * Run comprehensive test suite
   */
  async runTestSuite(extractor, options = {}) {
    const results = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      siteResults: [],
      overallScore: 0,
      recommendations: []
    };
    
    console.log('Starting Content Extraction Test Suite...');
    
    for (const site of this.testSites) {
      if (options.sites && !options.sites.includes(site.name)) {
        continue; // Skip sites not in the filter
      }
      
      console.log(`Testing ${site.name}...`);
      const siteResult = await this.testSite(site, extractor, options);
      results.siteResults.push(siteResult);
      results.totalTests += siteResult.totalTests;
      results.passedTests += siteResult.passedTests;
      results.failedTests += siteResult.failedTests;
    }
    
    // Calculate overall metrics
    results.overallScore = results.totalTests > 0 ? 
      (results.passedTests / results.totalTests) * 100 : 0;
    
    results.recommendations = this.generateRecommendations(results);
    
    return results;
  }
  
  /**
   * Test extraction on a specific site
   */
  async testSite(site, extractor, options = {}) {
    const siteResult = {
      siteName: site.name,
      baseUrl: site.baseUrl,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      testDetails: [],
      averageScore: 0,
      issues: [],
      strengths: []
    };
    
    // Test with different configurations
    const configs = options.configs || ['strict', 'balanced', 'comprehensive'];
    
    for (const config of configs) {
      const configResult = await this.testSiteWithConfig(site, extractor, config);
      siteResult.testDetails.push(configResult);
      siteResult.totalTests += configResult.tests.length;
      siteResult.passedTests += configResult.tests.filter(t => t.passed).length;
      siteResult.failedTests += configResult.tests.filter(t => !t.passed).length;
    }
    
    // Calculate site-specific metrics
    siteResult.averageScore = siteResult.totalTests > 0 ?
      (siteResult.passedTests / siteResult.totalTests) * 100 : 0;
    
    // Identify common issues and strengths
    siteResult.issues = this.identifyCommonIssues(siteResult.testDetails);
    siteResult.strengths = this.identifyStrengths(siteResult.testDetails);
    
    return siteResult;
  }
  
  /**
   * Test site with specific configuration
   */
  async testSiteWithConfig(site, extractor, config) {
    const configResult = {
      config,
      tests: [],
      averageScore: 0,
      extractionTime: 0,
      memoryUsage: 0
    };
    
    // Create test DOM structures based on site patterns
    const testCases = this.generateTestCases(site);
    
    for (const testCase of testCases) {
      const startTime = performance.now();
      const startMemory = this.getMemoryUsage();
      
      try {
        // Configure extractor
        const configuredExtractor = new extractor.constructor({
          mode: config,
          ...testCase.extractorConfig
        });
        
        // Run extraction
        const result = configuredExtractor.extractMainContent(testCase.dom);
        
        const endTime = performance.now();
        const endMemory = this.getMemoryUsage();
        
        // Validate results
        const validation = this.validator.validateExtraction(result, testCase.expected);
        
        const test = {
          name: testCase.name,
          passed: validation.isValid,
          score: validation.score,
          extractionTime: endTime - startTime,
          memoryDelta: endMemory - startMemory,
          issues: validation.issues,
          details: {
            extractedLength: result.content ? result.content.textContent.length : 0,
            expectedLength: testCase.expected.minLength || 0,
            noiseFiltered: validation.noiseFiltered,
            structurePreserved: validation.structurePreserved
          }
        };
        
        configResult.tests.push(test);
        
      } catch (error) {
        configResult.tests.push({
          name: testCase.name,
          passed: false,
          score: 0,
          error: error.message,
          extractionTime: performance.now() - startTime
        });
      }
    }
    
    // Calculate config-specific metrics
    configResult.averageScore = configResult.tests.length > 0 ?
      configResult.tests.reduce((sum, t) => sum + t.score, 0) / configResult.tests.length : 0;
    
    configResult.extractionTime = configResult.tests.reduce((sum, t) => sum + (t.extractionTime || 0), 0);
    
    return configResult;
  }
  
  /**
   * Generate test cases for a specific site
   */
  generateTestCases(site) {
    const testCases = [];
    
    // Test Case 1: Clean article with minimal noise
    testCases.push({
      name: 'Clean Article',
      dom: this.createCleanArticleDOM(site),
      expected: {
        minLength: 500,
        shouldContain: ['headline', 'author', 'content'],
        shouldNotContain: ['advertisement', 'related', 'sidebar'],
        structureElements: ['h1', 'p']
      },
      extractorConfig: {}
    });
    
    // Test Case 2: Article with heavy sidebar content
    testCases.push({
      name: 'Article with Sidebar',
      dom: this.createArticleWithSidebarDOM(site),
      expected: {
        minLength: 500,
        shouldContain: ['headline', 'content'],
        shouldNotContain: ['trending', 'popular', 'related'],
        noiseRatio: 0.3 // Max 30% noise content
      },
      extractorConfig: {}
    });
    
    // Test Case 3: Article with related content sections
    testCases.push({
      name: 'Article with Related Content',
      dom: this.createArticleWithRelatedDOM(site),
      expected: {
        minLength: 400,
        shouldContain: ['headline', 'content'],
        shouldNotContain: ['more stories', 'recommended', 'you might like'],
        boundaryDetection: true
      },
      extractorConfig: { enableBoundaryDetection: true }
    });
    
    // Test Case 4: Article with social sharing and comments
    testCases.push({
      name: 'Article with Social Elements',
      dom: this.createArticleWithSocialDOM(site),
      expected: {
        minLength: 400,
        shouldContain: ['headline', 'content'],
        shouldNotContain: ['share this', 'follow us', 'comments'],
        socialFiltering: true
      },
      extractorConfig: { enableNoiseFiltering: true }
    });
    
    // Test Case 5: Complex layout with multiple content sections
    testCases.push({
      name: 'Complex Layout',
      dom: this.createComplexLayoutDOM(site),
      expected: {
        minLength: 600,
        shouldContain: ['main content'],
        shouldNotContain: ['navigation', 'footer', 'advertisement'],
        semanticAccuracy: 0.8
      },
      extractorConfig: { enableSemanticAnalysis: true }
    });
    
    return testCases;
  }
  
  /**
   * Create test DOM structures
   */
  createCleanArticleDOM(site) {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <article>
        <header>
          <h1>Test Article Headline</h1>
          <div class="byline">By Test Author</div>
          <time datetime="2024-01-15">January 15, 2024</time>
        </header>
        <div class="article-content">
          <p>This is the first paragraph of the test article. It contains meaningful content that should be extracted as part of the main article body.</p>
          <p>This is the second paragraph with more substantial content. It continues the narrative and provides additional information that readers would expect to find in the main article.</p>
          <p>The third paragraph concludes the article with final thoughts and summary information. This represents a typical article structure with introduction, body, and conclusion.</p>
        </div>
      </article>
    `;
    return dom;
  }
  
  createArticleWithSidebarDOM(site) {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div class="page-layout">
        <main class="main-content">
          <article>
            <h1>Main Article Headline</h1>
            <div class="byline">By Test Author</div>
            <div class="article-body">
              <p>Main article content paragraph one with substantial text content.</p>
              <p>Main article content paragraph two with more detailed information.</p>
              <p>Main article content paragraph three concluding the main story.</p>
            </div>
          </article>
        </main>
        <aside class="sidebar">
          <div class="trending">
            <h3>Trending Now</h3>
            <ul>
              <li><a href="#">Trending story 1</a></li>
              <li><a href="#">Trending story 2</a></li>
              <li><a href="#">Trending story 3</a></li>
            </ul>
          </div>
          <div class="popular">
            <h3>Most Popular</h3>
            <ul>
              <li><a href="#">Popular story 1</a></li>
              <li><a href="#">Popular story 2</a></li>
            </ul>
          </div>
        </aside>
      </div>
    `;
    return dom;
  }
  
  createArticleWithRelatedDOM(site) {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <article>
        <h1>Article with Related Content</h1>
        <div class="article-content">
          <p>Main article content that should be extracted.</p>
          <p>More main content with important information.</p>
          <p>Final paragraph of the main article content.</p>
        </div>
        <div class="article-end"></div>
        <section class="related-articles">
          <h3>Related Stories</h3>
          <div class="related-item">
            <h4><a href="#">Related story 1</a></h4>
            <p>Brief description of related story.</p>
          </div>
          <div class="related-item">
            <h4><a href="#">Related story 2</a></h4>
            <p>Brief description of another related story.</p>
          </div>
        </section>
      </article>
    `;
    return dom;
  }
  
  createArticleWithSocialDOM(site) {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <article>
        <h1>Article with Social Elements</h1>
        <div class="social-share">
          <button>Share on Facebook</button>
          <button>Share on Twitter</button>
          <button>Share via Email</button>
        </div>
        <div class="article-content">
          <p>Main article content paragraph one.</p>
          <p>Main article content paragraph two.</p>
        </div>
        <div class="newsletter-signup">
          <h3>Subscribe to our newsletter</h3>
          <form>
            <input type="email" placeholder="Enter your email">
            <button type="submit">Subscribe</button>
          </form>
        </div>
        <section class="comments">
          <h3>Comments</h3>
          <div class="comment">
            <p>This is a user comment that should not be included in main content.</p>
          </div>
        </section>
      </article>
    `;
    return dom;
  }
  
  createComplexLayoutDOM(site) {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <div class="page">
        <header class="site-header">
          <nav>
            <ul>
              <li><a href="#">Home</a></li>
              <li><a href="#">News</a></li>
              <li><a href="#">Sports</a></li>
            </ul>
          </nav>
        </header>
        <main role="main">
          <article itemscope itemtype="http://schema.org/NewsArticle">
            <header>
              <h1 itemprop="headline">Complex Layout Article</h1>
              <div class="byline" itemprop="author">Test Author</div>
              <time itemprop="datePublished" datetime="2024-01-15">Jan 15, 2024</time>
            </header>
            <div class="article-body" itemprop="articleBody">
              <p>First paragraph of main content in complex layout.</p>
              <p>Second paragraph with substantial content.</p>
              <blockquote>Important quote within the article.</blockquote>
              <p>Third paragraph continuing the main narrative.</p>
            </div>
          </article>
        </main>
        <aside class="complementary">
          <div class="ad">Advertisement content</div>
          <div class="weather">Weather widget</div>
        </aside>
        <footer class="site-footer">
          <p>Footer content and links</p>
        </footer>
      </div>
    `;
    return dom;
  }
  
  /**
   * Utility methods
   */
  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }
  
  identifyCommonIssues(testDetails) {
    const issues = [];
    const failureReasons = {};
    
    testDetails.forEach(config => {
      config.tests.forEach(test => {
        if (!test.passed && test.issues) {
          test.issues.forEach(issue => {
            failureReasons[issue] = (failureReasons[issue] || 0) + 1;
          });
        }
      });
    });
    
    // Identify most common issues
    Object.entries(failureReasons)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([issue, count]) => {
        issues.push({ issue, frequency: count });
      });
    
    return issues;
  }
  
  identifyStrengths(testDetails) {
    const strengths = [];
    let totalTests = 0;
    let passedTests = 0;
    
    testDetails.forEach(config => {
      totalTests += config.tests.length;
      passedTests += config.tests.filter(t => t.passed).length;
    });
    
    const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
    
    if (successRate >= 90) strengths.push('Excellent overall accuracy');
    else if (successRate >= 80) strengths.push('Good overall accuracy');
    else if (successRate >= 70) strengths.push('Acceptable accuracy');
    
    return strengths;
  }
  
  generateRecommendations(results) {
    const recommendations = [];
    
    if (results.overallScore < 70) {
      recommendations.push('Consider adjusting noise detection thresholds');
      recommendations.push('Review semantic analysis patterns');
    }
    
    if (results.overallScore >= 90) {
      recommendations.push('Excellent performance - consider optimizing for speed');
    }
    
    // Site-specific recommendations
    results.siteResults.forEach(site => {
      if (site.averageScore < 60) {
        recommendations.push(`Improve extraction for ${site.siteName} - common issues: ${site.issues.map(i => i.issue).join(', ')}`);
      }
    });
    
    return recommendations;
  }
}

/**
 * Content validation component
 */
class ContentValidator {
  validateExtraction(result, expected) {
    const validation = {
      isValid: true,
      score: 0,
      issues: [],
      noiseFiltered: false,
      structurePreserved: false
    };
    
    if (!result || !result.content) {
      validation.isValid = false;
      validation.issues.push('No content extracted');
      return validation;
    }
    
    const extractedText = result.content.textContent.trim();
    const extractedLength = extractedText.length;
    
    // Length validation
    if (expected.minLength && extractedLength < expected.minLength) {
      validation.issues.push(`Content too short: ${extractedLength} < ${expected.minLength}`);
      validation.score -= 0.3;
    } else {
      validation.score += 0.3;
    }
    
    // Content inclusion validation
    if (expected.shouldContain) {
      const containsAll = expected.shouldContain.every(term => 
        extractedText.toLowerCase().includes(term.toLowerCase())
      );
      if (containsAll) {
        validation.score += 0.3;
      } else {
        validation.issues.push('Missing expected content terms');
        validation.score -= 0.2;
      }
    }
    
    // Noise exclusion validation
    if (expected.shouldNotContain) {
      const containsNoise = expected.shouldNotContain.some(term =>
        extractedText.toLowerCase().includes(term.toLowerCase())
      );
      if (!containsNoise) {
        validation.score += 0.2;
        validation.noiseFiltered = true;
      } else {
        validation.issues.push('Contains noise content');
        validation.score -= 0.3;
      }
    }
    
    // Structure validation
    if (expected.structureElements) {
      const hasStructure = expected.structureElements.every(selector =>
        result.content.querySelector(selector)
      );
      if (hasStructure) {
        validation.score += 0.2;
        validation.structurePreserved = true;
      } else {
        validation.issues.push('Missing expected structure elements');
        validation.score -= 0.1;
      }
    }
    
    // Normalize score
    validation.score = Math.max(0, Math.min(1, validation.score));
    validation.isValid = validation.score >= 0.6;
    
    return validation;
  }
}

/**
 * Extraction metrics component
 */
class ExtractionMetrics {
  calculateMetrics(results) {
    return {
      accuracy: this.calculateAccuracy(results),
      precision: this.calculatePrecision(results),
      recall: this.calculateRecall(results),
      f1Score: this.calculateF1Score(results),
      performance: this.calculatePerformance(results)
    };
  }
  
  calculateAccuracy(results) {
    const total = results.totalTests;
    const correct = results.passedTests;
    return total > 0 ? (correct / total) * 100 : 0;
  }
  
  calculatePrecision(results) {
    // Precision: How much of the extracted content is actually main content
    // This would require manual annotation in a real scenario
    return 85; // Placeholder
  }
  
  calculateRecall(results) {
    // Recall: How much of the actual main content was extracted
    // This would require manual annotation in a real scenario
    return 80; // Placeholder
  }
  
  calculateF1Score(results) {
    const precision = this.calculatePrecision(results);
    const recall = this.calculateRecall(results);
    return 2 * (precision * recall) / (precision + recall);
  }
  
  calculatePerformance(results) {
    const avgTime = results.siteResults.reduce((sum, site) => {
      const siteTime = site.testDetails.reduce((s, config) => s + config.extractionTime, 0);
      return sum + siteTime;
    }, 0) / results.siteResults.length;
    
    return {
      averageExtractionTime: avgTime,
      memoryEfficiency: 'Good', // Placeholder
      scalability: 'High' // Placeholder
    };
  }
}

// Export for use in testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentExtractionTestFramework, ContentValidator, ExtractionMetrics };
} else if (typeof window !== 'undefined') {
  window.ContentExtractionTestFramework = ContentExtractionTestFramework;
  window.ContentValidator = ContentValidator;
  window.ExtractionMetrics = ExtractionMetrics;
}